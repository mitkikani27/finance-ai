"""MongoDB document models + a tiny query shim.

The API layer uses the db.query(Model).filter(...).all() / db.add / db.commit
style (the same interface as the original ORM design). This shim maps those
calls onto MongoDB collections so the API layer stays identical while the
storage is Mongo. Documents use plain integer ids (via a counters collection)
and ISO date strings, which keeps everything readable in Atlas/Compass.

Collections: users, income, expenses, budgets, investments, fraud_alerts,
notifications, chat_history, ocr_receipts, goals.
"""
from datetime import datetime, date

from database import db

# ── field helpers ───────────────────────────────────────────────────────────
class _Order:
    __slots__ = ("key", "dir")
    def __init__(self, key, direction):
        self.key, self.dir = key, direction


class _Cond:
    __slots__ = ("field", "value", "ops")
    def __init__(self, field, value=None, ops=None):
        self.field, self.value, self.ops = field, value, ops or {}

    def to_mongo(self, dates):
        def cv(v):
            if isinstance(v, date) and not isinstance(v, datetime):
                return v.isoformat()
            return v
        if self.ops:
            return {self.field: {k: cv(v) for k, v in self.ops.items()}}
        return {self.field: cv(self.value)}


def _merge(dst, add):
    for k, v in add.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            dst[k].update(v)
        else:
            dst[k] = v
    return dst


class _F:
    __slots__ = ("name", "model")
    def __init__(self, name, model=None):
        self.name, self.model = name, model

    def _cond(self, ops=None, value=None):
        return _Cond(self.name, value, ops)

    def __eq__(self, v):  return self._cond({}, v)
    def __ne__(self, v):  return self._cond({"$ne": v})
    def __ge__(self, v):  return self._cond({"$gte": v})
    def __gt__(self, v):  return self._cond({"$gt": v})
    def __le__(self, v):  return self._cond({"$lte": v})
    def __lt__(self, v):  return self._cond({"$lt": v})
    def isnot(self, v):   return self._cond({"$ne": v})
    def is_(self, v):     return self._cond({}, v)
    def ilike(self, pattern):
        inner = pattern.strip("%")
        return self._cond({"$regex": re_escape(inner), "$options": "i"})
    def desc(self): return _Order(self.name, -1)
    def asc(self):  return _Order(self.name, 1)

    # allow `Model.field` inside db.query(...) column selects
    def __hash__(self):
        return hash((self.model.__name__ if self.model else "", self.name))


def re_escape(s: str) -> str:
    import re as _re
    return _re.escape(s)


# ── document wrapper ────────────────────────────────────────────────────────
def _coerce_read(model, name, value):
    """Restore ORM-style types: Date columns → date, created_at → datetime."""
    if isinstance(value, str):
        if name in model._dates:
            try:
                return date.fromisoformat(value[:10])
            except ValueError:
                return value
        if name == "created_at":
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                return value
    return value


class Doc:
    __slots__ = ("_model", "_data")
    def __init__(self, model, data: dict):
        object.__setattr__(self, "_model", model)
        object.__setattr__(self, "_data", data)

    def __getattr__(self, name):
        data = object.__getattribute__(self, "_data")
        if name in data:
            return _coerce_read(object.__getattribute__(self, "_model"),
                                name, data[name])
        # Dual-schema aliases for Atlas collections
        if name == "monthly_limit" and "amount" in data:
            return data["amount"]
        if name == "amount" and "monthly_limit" in data:
            return data["monthly_limit"]
        if name == "description" and "title" in data:
            return data["title"]
        if name == "title" and "description" in data:
            return data["description"]
        if name == "date" and "expense_date" in data:
            return _coerce_read(object.__getattribute__(self, "_model"), "date", data["expense_date"])
        if name == "date" and "income_date" in data:
            return _coerce_read(object.__getattribute__(self, "_model"), "date", data["income_date"])
        if name == "payment_mode" and "payment_method" in data:
            return data["payment_method"]
        if name == "inv_type" and "type" in data:
            return data["type"]
        if name == "note" and "notes" in data:
            return data["notes"]
        if name in object.__getattribute__(self, "_model")._defaults:
            return object.__getattribute__(self, "_model")._defaults[name]
        raise AttributeError(name)

    def __setattr__(self, name, value):
        object.__getattribute__(self, "_data")[name] = value

    def _dump(self) -> dict:
        out = dict(object.__getattribute__(self, "_data"))
        for k, v in out.items():
            if isinstance(v, (datetime, date)):
                out[k] = v.isoformat()
        # Dual-schema aliases
        if "monthly_limit" in out and "amount" not in out:
            out["amount"] = out["monthly_limit"]
        if "amount" in out and "monthly_limit" not in out:
            out["monthly_limit"] = out["amount"]
        if "description" in out and "title" not in out:
            out["title"] = out["description"]
        if "date" in out and "expense_date" not in out:
            out["expense_date"] = out["date"]
        if "date" in out and "income_date" not in out:
            out["income_date"] = out["date"]
        if "payment_mode" in out and "payment_method" not in out:
            out["payment_method"] = out["payment_mode"]
        if "inv_type" in out and "type" not in out:
            out["type"] = out["inv_type"]
        if "note" in out and "notes" not in out:
            out["notes"] = out["note"]
        return out


def _is_mongo_net_err(e: Exception) -> bool:
    s = str(e)
    return any(x in s for x in (
        "ServerSelectionTimeoutError", "AutoReconnect", "NetworkTimeout",
        "TLSV1_ALERT_INTERNAL_ERROR", "SSL alert number 80", "SSL handshake failed",
        "timed out", "connection reset"
    ))


# ── query ───────────────────────────────────────────────────────────────────
class _Query:
    def __init__(self, session, model, columns=None, base_filter=None):
        self.s, self.m = session, model
        self.columns = columns or []
        self.q = dict(base_filter or {})
        self.sort, self.lim = [], None

    def filter(self, *conds):
        for c in conds:
            _merge(self.q, c.to_mongo(self.m._dates))
        return self

    def order_by(self, *orders):
        for o in orders:
            if isinstance(o, _F):
                o = _Order(o.name, 1)
            self.sort.append((o.key, o.dir))
        return self

    def limit(self, n):
        self.lim = n
        return self

    def _cursor(self, projection=None):
        cur = self.s.db[self.m._col].find(self.q, projection)
        if self.sort:
            cur = cur.sort(self.sort)
        if self.lim:
            cur = cur.limit(self.lim)
        return cur

    def all(self):
        try:
            if self.columns:
                return [tuple(d.get(c) for c in self.columns)
                        for d in self._cursor({c: 1 for c in self.columns})]
            docs = [Doc(self.m, d) for d in self._cursor()]
            for d in docs:
                self.s._track(d)
            return docs
        except Exception as e:
            if _is_mongo_net_err(e):
                from database import failover_to_local
                failover_to_local(str(e))
                if self.columns:
                    return [tuple(d.get(c) for c in self.columns)
                            for d in self._cursor({c: 1 for c in self.columns})]
                docs = [Doc(self.m, d) for d in self._cursor()]
                for d in docs:
                    self.s._track(d)
                return docs
            raise

    def first(self):
        self.lim = 1
        docs = self.all()
        return docs[0] if docs else None

    def count(self) -> int:
        try:
            return self.s.db[self.m._col].count_documents(self.q)
        except Exception as e:
            if _is_mongo_net_err(e):
                from database import failover_to_local
                failover_to_local(str(e))
                return self.s.db[self.m._col].count_documents(self.q)
            raise


# ── session (unit of work, Mongo edition) ───────────────────────────────────
class Session:
    def __init__(self, database):
        self.db = database
        self._pending, self._tracked, self._deletes = [], {}, []

    # -- writes ---------------------------------------------------------------
    def add(self, doc):
        self._pending.append(doc)
        self._track(doc)

    def flush(self):
        try:
            self._flush_internal()
        except Exception as e:
            if _is_mongo_net_err(e):
                from database import failover_to_local
                failover_to_local(str(e))
                self._flush_internal()
            else:
                raise

    def _flush_internal(self):
        for doc in self._pending:
            m = doc._model
            # Apply dual-schema aliases on write so documents in Atlas have both conventions
            data = doc._dump() if hasattr(doc, "_dump") else dict(doc._data)
            if data.get("id") is None:
                data["id"] = self._next_id(m._col)
                doc._data["id"] = data["id"]
            for f, default in m._defaults.items():
                data.setdefault(f, default() if callable(default) else default)
            for k, v in data.items():
                if isinstance(v, (datetime, date)):
                    data[k] = v.isoformat()
            self.db[m._col].replace_one({"id": data["id"]}, data, upsert=True)
            doc._data.update(data)
        self._pending.clear()

    def commit(self):
        try:
            self._commit_internal()
        except Exception as e:
            if _is_mongo_net_err(e):
                from database import failover_to_local
                failover_to_local(str(e))
                self._commit_internal()
            else:
                raise

    def _commit_internal(self):
        self.flush()
        for doc in self._tracked.values():
            if doc._data.get("id") is not None:
                self.db[doc._model._col].replace_one(
                    {"id": doc._data["id"]}, doc._dump(), upsert=True)
        for col, doc_id in self._deletes:
            self.db[col].delete_one({"id": doc_id})
        self._deletes.clear()

    def delete(self, doc):
        if doc._data.get("id") is not None:
            self._deletes.append((doc._model._col, doc._data["id"]))

    def refresh(self, doc):
        try:
            fresh = self.db[doc._model._col].find_one({"id": doc._data.get("id")})
        except Exception as e:
            if _is_mongo_net_err(e):
                from database import failover_to_local
                failover_to_local(str(e))
                fresh = self.db[doc._model._col].find_one({"id": doc._data.get("id")})
            else:
                raise
        if fresh:
            doc._data.update(fresh)

    def _next_id(self, col: str) -> int:
        try:
            r = self.db.counters.find_one_and_update(
                {"_id": col}, {"$inc": {"seq": 1}}, upsert=True,
                return_document=True)
            return int(r["seq"])
        except Exception as e:
            if _is_mongo_net_err(e):
                from database import failover_to_local
                failover_to_local(str(e))
                r = self.db.counters.find_one_and_update(
                    {"_id": col}, {"$inc": {"seq": 1}}, upsert=True,
                    return_document=True)
                return int(r["seq"])
            raise

    def _track(self, doc):
        self._tracked[id(doc)] = doc

    # -- reads ----------------------------------------------------------------
    def get(self, model, doc_id):
        try:
            d = self.db[model._col].find_one({"id": doc_id})
        except Exception as e:
            if _is_mongo_net_err(e):
                from database import failover_to_local
                failover_to_local(str(e))
                d = self.db[model._col].find_one({"id": doc_id})
            else:
                raise
        if not d:
            return None
        doc = Doc(model, d)
        self._track(doc)
        return doc

    def query(self, *args):
        if args and isinstance(args[0], _F):
            model = args[0].model
            cols = [f.name for f in args if isinstance(f, _F)]
            return _Query(self, model, columns=cols)
        if args and isinstance(args[0], type):
            model = args[0]
            cols = [f.name for f in args[1:] if isinstance(f, _F)]
            return _Query(self, model, columns=cols or None)
        raise ValueError("query() expects a model class (optionally with columns)")

    # context manager convenience
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.commit()


# module-level session for startup/seed scripts
global_session = Session(db)


# ── model classes ───────────────────────────────────────────────────────────
class _Model:
    _col = ""
    _dates = ()
    _defaults = {}
    _fields = ()

    def __init__(self, **kw):
        data = {}
        for f, default in self._defaults.items():
            data[f] = default() if callable(default) else default
        for f in self._fields:
            if f in kw:
                data[f] = kw[f]
        # Dual-schema aliases on init
        if "amount" in kw and "monthly_limit" not in data:
            data["monthly_limit"] = kw["amount"]
        if "monthly_limit" in kw and "amount" not in data:
            data["amount"] = kw["monthly_limit"]
        if "title" in kw and "description" not in data:
            data["description"] = kw["title"]
        if "description" in kw and "title" not in data:
            data["title"] = kw["description"]
        if "expense_date" in kw and "date" not in data:
            data["date"] = kw["expense_date"]
        if "income_date" in kw and "date" not in data:
            data["date"] = kw["income_date"]
        if "payment_method" in kw and "payment_mode" not in data:
            data["payment_mode"] = kw["payment_method"]
        if "payment_mode" in kw and "payment_method" not in data:
            data["payment_method"] = kw["payment_mode"]
        if "type" in kw and "inv_type" not in data:
            data["inv_type"] = kw["type"]
        if "inv_type" in kw and "type" not in data:
            data["type"] = kw["inv_type"]
        if "notes" in kw and "note" not in data:
            data["note"] = kw["notes"]
        if "note" in kw and "notes" not in data:
            data["notes"] = kw["note"]
        # Also copy anything extra passed in kw
        for k, v in kw.items():
            if k not in data:
                data[k] = v
        object.__setattr__(self, "_model", type(self))
        object.__setattr__(self, "_data", data)

    def __getattribute__(self, name):
        if name.startswith("_"):
            return object.__getattribute__(self, name)
        try:
            data = object.__getattribute__(self, "_data")
        except AttributeError:
            return object.__getattribute__(self, name)
        if name in data:
            return _coerce_read(object.__getattribute__(self, "_model"),
                                name, data[name])
        # Dual-schema aliases
        if name == "monthly_limit" and "amount" in data:
            return data["amount"]
        if name == "amount" and "monthly_limit" in data:
            return data["monthly_limit"]
        if name == "description" and "title" in data:
            return data["title"]
        if name == "title" and "description" in data:
            return data["description"]
        if name == "date" and "expense_date" in data:
            return _coerce_read(object.__getattribute__(self, "_model"), "date", data["expense_date"])
        if name == "date" and "income_date" in data:
            return _coerce_read(object.__getattribute__(self, "_model"), "date", data["income_date"])
        if name == "payment_mode" and "payment_method" in data:
            return data["payment_method"]
        if name == "payment_method" and "payment_mode" in data:
            return data["payment_mode"]
        if name == "inv_type" and "type" in data:
            return data["type"]
        if name == "type" and "inv_type" in data:
            return data["inv_type"]
        if name == "note" and "notes" in data:
            return data["notes"]
        if name == "notes" and "note" in data:
            return data["note"]
        d = object.__getattribute__(self, "_defaults")
        if name in d:
            v = d[name]
            return v() if callable(v) else v
        return object.__getattribute__(self, name)

    def __setattr__(self, name, value):
        if name.startswith("_"):
            object.__setattr__(self, name, value)
        else:
            object.__getattribute__(self, "_data")[name] = value

    def _dump(self) -> dict:
        out = dict(object.__getattribute__(self, "_data"))
        for k, v in out.items():
            if isinstance(v, (datetime, date)):
                out[k] = v.isoformat()
        if "monthly_limit" in out and "amount" not in out:
            out["amount"] = out["monthly_limit"]
        if "amount" in out and "monthly_limit" not in out:
            out["monthly_limit"] = out["amount"]
        if "description" in out and "title" not in out:
            out["title"] = out["description"]
        if "title" in out and "description" not in out:
            out["description"] = out["title"]
        if "date" in out and "expense_date" not in out:
            out["expense_date"] = out["date"]
        if "date" in out and "income_date" not in out:
            out["income_date"] = out["date"]
        if "payment_mode" in out and "payment_method" not in out:
            out["payment_method"] = out["payment_mode"]
        if "payment_method" in out and "payment_mode" not in out:
            out["payment_mode"] = out["payment_method"]
        if "inv_type" in out and "type" not in out:
            out["type"] = out["inv_type"]
        if "type" in out and "inv_type" not in out:
            out["inv_type"] = out["type"]
        if "note" in out and "notes" not in out:
            out["notes"] = out["note"]
        if "notes" in out and "note" not in out:
            out["note"] = out["notes"]
        return out


def _bind(cls):
    for f in cls._fields:
        setattr(cls, f, _F(f, cls))
    return cls


class User(_Model):
    _col = "users"
    _fields = ("id", "email", "full_name", "phone", "password_hash", "profile", "created_at")
    _defaults = {"phone": "", "password_hash": None, "profile": "{}",
                 "created_at": lambda: datetime.utcnow().isoformat()}


class Income(_Model):
    _col = "incomes"
    _dates = ("date",)
    _fields = ("id", "user_id", "source", "amount", "date", "note", "created_at")
    _defaults = {"source": "Salary", "note": "",
                 "created_at": lambda: datetime.utcnow().isoformat()}


class Expense(_Model):
    _col = "expenses"
    _dates = ("date",)
    _fields = ("id", "user_id", "category", "description", "amount", "date",
               "payment_mode", "ai_categorized", "original_amount", "original_currency",
               "exchange_rate", "created_at")
    _defaults = {"description": "", "payment_mode": "UPI", "ai_categorized": False,
                 "original_amount": None, "original_currency": "INR", "exchange_rate": 1.0,
                 "created_at": lambda: datetime.utcnow().isoformat()}


class Budget(_Model):
    _col = "budgets"
    _fields = ("id", "user_id", "category", "monthly_limit", "created_at")
    _defaults = {"created_at": lambda: datetime.utcnow().isoformat()}


class Investment(_Model):
    _col = "investments"
    _dates = ("start_date", "last_sip_date")
    _fields = ("id", "user_id", "name", "inv_type", "amount", "monthly_inflow",
               "expected_return", "start_date", "last_sip_date", "note", "created_at")
    _defaults = {"inv_type": "Mutual Fund", "monthly_inflow": 0, "expected_return": 12.0,
                 "last_sip_date": None, "note": "", "created_at": lambda: datetime.utcnow().isoformat()}


class Transaction(_Model):
    _col = "transactions"
    _dates = ("date",)
    _fields = ("id", "user_id", "type", "category", "amount", "date", "description",
               "payment_method", "created_at")
    _defaults = {"type": "expense", "category": "General", "payment_method": "UPI",
                 "created_at": lambda: datetime.utcnow().isoformat()}


class Saving(_Model):
    _col = "savings"
    _dates = ("date",)
    _fields = ("id", "user_id", "title", "target_amount", "current_amount", "date", "created_at")
    _defaults = {"current_amount": 0, "created_at": lambda: datetime.utcnow().isoformat()}


class FraudAlert(_Model):
    _col = "fraud_alerts"
    _fields = ("id", "user_id", "expense_id", "description", "amount",
               "risk_score", "reason", "status", "created_at")
    _defaults = {"expense_id": None, "description": "", "risk_score": 0.0, "reason": "",
                 "status": "new", "created_at": lambda: datetime.utcnow().isoformat()}


class Notification(_Model):
    _col = "notifications"
    _fields = ("id", "user_id", "title", "body", "ntype", "read", "created_at")
    _defaults = {"body": "", "ntype": "info", "read": False,
                 "created_at": lambda: datetime.utcnow().isoformat()}


class ChatHistory(_Model):
    _col = "chat_history"
    _fields = ("id", "user_id", "role", "content", "created_at")
    _defaults = {"role": "user", "created_at": lambda: datetime.utcnow().isoformat()}


class OCRReceipt(_Model):
    _col = "ocr_receipts"
    _dates = ("rdate",)
    _fields = ("id", "user_id", "filename", "shop", "amount", "tax", "rdate",
               "raw_text", "expense_id", "original_amount", "original_currency",
               "exchange_rate", "created_at")
    _defaults = {"filename": "", "shop": "", "amount": 0, "tax": 0, "rdate": None,
                 "raw_text": "", "expense_id": None, "original_amount": None,
                 "original_currency": "INR", "exchange_rate": 1.0,
                 "created_at": lambda: datetime.utcnow().isoformat()}


class Goal(_Model):
    _col = "goals"
    _dates = ("deadline",)
    _fields = ("id", "user_id", "name", "target_amount", "saved_amount", "deadline",
               "created_at")
    _defaults = {"saved_amount": 0, "deadline": None,
                 "created_at": lambda: datetime.utcnow().isoformat()}


for _cls in (User, Income, Expense, Budget, Investment, Transaction, Saving,
             FraudAlert, Notification, ChatHistory, OCRReceipt, Goal):
    _bind(_cls)


def ensure_indexes():
    """ helpful indexes (users.email unique for login integrity)."""
    try:
        db.users.create_index([("email", 1)], unique=True)
    except Exception:
        pass
    try:
        db.expenses.create_index([("user_id", 1), ("date", -1)])
    except Exception:
        pass
    try:
        db.incomes.create_index([("user_id", 1), ("date", -1)])
    except Exception:
        pass
    try:
        db.budgets.create_index([("user_id", 1), ("category", 1)])
    except Exception:
        pass
    try:
        db.investments.create_index([("user_id", 1)])
    except Exception:
        pass
    try:
        db.chat_history.create_index([("user_id", 1), ("id", -1)])
    except Exception:
        pass
    # Auto-migrate legacy 'income' (singular) to 'incomes' (plural) if needed
    try:
        if "income" in db.list_collection_names():
            if db.income.count_documents({}) > 0 and db.incomes.count_documents({}) == 0:
                docs = list(db.income.find())
                if docs:
                    db.incomes.insert_many(docs)
    except Exception:
        pass
