"""MongoDB connection and session management.

Production: connects to MongoDB Atlas (MONGO_URI) with TLS and certifi root store.
Development fallback: if MongoDB Atlas is unreachable (e.g. current client IP not
whitelisted in Atlas Network Access), falls back to local MongoDB on localhost:27017,
or in-memory mongomock as last resort, with clear diagnostic logging.
"""
import os
import sys
import logging
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
import certifi

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("finmate.database")

# Ensure .env is explicitly loaded from backend directory
_backend_dir = Path(__file__).resolve().parent
_env_path = _backend_dir / ".env"
if _env_path.is_file():
    load_dotenv(dotenv_path=_env_path, override=True)
else:
    load_dotenv(override=True)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB", "finmate_ai")

# Ensure DB_NAME defaults to finmate_ai
if not DB_NAME or DB_NAME == "finmate":
    DB_NAME = "finmate_ai"

_mode = "unknown"
_conn_error = None
_connected_uri = None
client = None

def _mask_uri(uri: str) -> str:
    """Mask password in URI for safe logging."""
    if "@" in uri:
        prefix = uri.split("@")[0]
        suffix = uri.split("@")[1]
        if ":" in prefix:
            proto_user = prefix.rsplit(":", 1)[0]
            return f"{proto_user}:****@{suffix}"
    return uri


def init_connection():
    global client, _mode, _conn_error, _connected_uri
    _conn_error = None

    # 1. Try Primary Configured URI (MongoDB Atlas or custom)
    target_uri = MONGO_URI
    is_atlas = "mongodb.net" in target_uri or "mongodb+srv" in target_uri

    client_kwargs = {
        "serverSelectionTimeoutMS": 2000,
        "connectTimeoutMS": 2000,
        "socketTimeoutMS": 10000,
    }

    if is_atlas or "ssl=true" in target_uri.lower() or "tls=true" in target_uri.lower():
        client_kwargs["tlsCAFile"] = certifi.where()

    logger.info("Connecting to primary MongoDB: %s (DB: %s)", _mask_uri(target_uri), DB_NAME)

    try:
        c = MongoClient(target_uri, **client_kwargs)
        c.admin.command("ping")
        client = c
        _connected_uri = _mask_uri(target_uri)
        _mode = "mongodb_atlas" if is_atlas else "mongodb_remote"
        logger.info("✅ SUCCESS: Connected to %s [Database: %s]", _mode, DB_NAME)
        return
    except Exception as e:
        _conn_error = str(e)
        logger.warning("⚠️ Primary MongoDB connection failed: %s", e)
        if "TLSV1_ALERT_INTERNAL_ERROR" in str(e) or "SSL alert number 80" in str(e):
            logger.warning(
                "👉 MongoDB Atlas TLS Handshake Rejected. This occurs when your current "
                "public IP address is not whitelisted in MongoDB Atlas Network Access. "
                "Fix: Log in to Atlas -> Network Access -> Add IP Address -> 0.0.0.0/0."
            )

    # 2. Fallback to Local MongoDB if primary was Atlas and failed
    if is_atlas:
        local_uri = "mongodb://localhost:27017"
        logger.info("Attempting fallback to local MongoDB: %s", local_uri)
        try:
            c = MongoClient(local_uri, serverSelectionTimeoutMS=1500)
            c.admin.command("ping")
            client = c
            _connected_uri = local_uri
            _mode = "local_mongodb"
            logger.info("✅ SUCCESS: Operating on local MongoDB (%s) [Database: %s]", local_uri, DB_NAME)
            return
        except Exception as local_err:
            logger.warning("Local MongoDB not available: %s", local_err)

    # 3. Final Fallback to in-memory mongomock
    try:
        import mongomock
        client = mongomock.MongoClient()
        _connected_uri = "in-memory (mongomock)"
        _mode = "mongomock"
        logger.warning("⚠️ CAUTION: Using in-memory mongomock. Data will not persist to Atlas until Atlas IP is whitelisted.")
    except Exception as mock_err:
        logger.error("Failed to initialize mongomock: %s", mock_err)
        raise RuntimeError(f"Could not connect to any MongoDB instance: {_conn_error}")


def failover_to_local(reason: str = ""):
    """Seamless runtime failover to local MongoDB if Atlas connection drops mid-flight."""
    global client, _mode, _connected_uri
    if _mode == "local_mongodb" and client is not None:
        return client[DB_NAME]

    logger.warning("🚨 Failover triggered (%s) -> Switching immediately to local MongoDB...", reason)
    try:
        c = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=1500)
        c.admin.command("ping")
        client = c
        _connected_uri = "mongodb://localhost:27017"
        _mode = "local_mongodb"
        logger.info("✅ SUCCESS: Switched to local MongoDB seamlessly [Database: %s]", DB_NAME)
        return client[DB_NAME]
    except Exception as err:
        logger.warning("Local MongoDB unavailable during failover: %s. Using in-memory mongomock.", err)
        try:
            import mongomock
            client = mongomock.MongoClient()
            _connected_uri = "in-memory (mongomock)"
            _mode = "mongomock"
            return client[DB_NAME]
        except Exception:
            return client[DB_NAME] if client else None


def get_active_db():
    global client, _mode
    if client is None:
        init_connection()
    return client[DB_NAME]


class _DatabaseProxy:
    """Dynamic proxy delegating to the currently active working MongoDB database."""
    def __getitem__(self, item):
        return get_active_db()[item]

    def __getattr__(self, name):
        return getattr(get_active_db(), name)


# Run connection initialization
init_connection()

# Selected dynamic database instance
db = _DatabaseProxy()


def get_db():
    """FastAPI dependency — returns a fresh Session-like wrapper around the active db."""
    from models import Session
    return Session(db)


def mode() -> str:
    """Return active connection mode ('mongodb_atlas', 'local_mongodb', 'mongomock')."""
    return _mode


def try_reconnect_atlas():
    """Attempt to reconnect to Atlas (e.g. after IP whitelist update) and sync."""
    global client, _mode, _connected_uri, _conn_error
    target_uri = MONGO_URI
    is_atlas = "mongodb.net" in target_uri or "mongodb+srv" in target_uri
    if not is_atlas:
        return False
    try:
        c = MongoClient(
            target_uri,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
            socketTimeoutMS=10000,
        )
        c.admin.command("ping")
        client = c
        _connected_uri = _mask_uri(target_uri)
        _mode = "mongodb_atlas"
        _conn_error = None
        logger.info("✅ Reconnected to MongoDB Atlas [Database: %s]", DB_NAME)
        return True
    except Exception as e:
        _conn_error = str(e)
        return False


def db_info() -> dict:
    """Detailed diagnostics of database connectivity."""
    cols = []
    try:
        cols = db.list_collection_names()
    except Exception:
        pass

    counts = {}
    for c in ["budgets", "expenses", "incomes", "investments", "users", "chat_history", "goals", "ocr_receipts"]:
        try:
            counts[c] = db[c].count_documents({})
        except Exception:
            counts[c] = 0

    return {
        "active_mode": _mode,
        "database_name": DB_NAME,
        "connected_uri": _connected_uri,
        "target_uri": _mask_uri(MONGO_URI),
        "is_atlas": _mode == "mongodb_atlas",
        "last_error": _conn_error,
        "collections": cols,
        "document_counts": counts,
    }
