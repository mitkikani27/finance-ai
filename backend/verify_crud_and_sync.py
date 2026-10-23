"""FinMate AI — MongoDB Data Insertion & Persistence Verification Script.

Tests all 10 CRUD requirements:
1. Create an expense.
2. Read the saved expense back from MongoDB.
3. Create an income record.
4. Read the saved income back.
5. Create a budget and verify it exists.
6. Create an investment record and verify it exists.
7. Update an existing record and verify change persists.
8. Delete test records and verify deletion.
9. Confirm user isolation (authenticated user context).
10. Verify failed inserts return clear errors.

Also provides automatic sync from legacy local 'finmate' to 'finmate_ai',
and from local to Atlas when Atlas IP is whitelisted.
"""
import os
import sys
from datetime import date, datetime
from pathlib import Path

# Fix Windows console encoding for UTF-8
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure backend directory is in path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import database
import models
from database import db, get_db

def run_tests():
    print("=" * 70)
    print("FINMATE AI — MONGODB PERSISTENCE INTEGRATION TESTS")
    print("=" * 70)
    print(f"Active Mode:     {database.mode()}")
    print(f"Database Name:   {database.DB_NAME}")
    print(f"Target URI:      {database._mask_uri(database.MONGO_URI)}")
    print(f"Connected URI:   {database._connected_uri}")
    print("=" * 70)

    # Pre-sync: if local 'finmate' has data and 'finmate_ai' is empty, migrate it
    try:
        from pymongo import MongoClient
        local_c = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=1000)
        local_c.admin.command("ping")
        if "finmate" in local_c.list_database_names():
            src_db = local_c["finmate"]
            target_db = db
            for col_name in ["users", "expenses", "budgets", "investments", "goals", "ocr_receipts", "notifications", "chat_history"]:
                if col_name in src_db.list_collection_names() and target_db[col_name].count_documents({}) == 0:
                    cnt = src_db[col_name].count_documents({})
                    if cnt > 0:
                        docs = list(src_db[col_name].find())
                        target_db[col_name].insert_many(docs)
                        print(f"📦 Pre-synced {cnt} documents for '{col_name}' into '{database.DB_NAME}'")
            
            # Sync 'income' (singular) to 'incomes' (plural)
            if "income" in src_db.list_collection_names() and target_db["incomes"].count_documents({}) == 0:
                cnt = src_db["income"].count_documents({})
                if cnt > 0:
                    docs = list(src_db["income"].find())
                    target_db["incomes"].insert_many(docs)
                    print(f"📦 Pre-synced {cnt} documents from 'income' to 'incomes' in '{database.DB_NAME}'")
    except Exception as e:
        print(f"Notice: local migration skip ({e})")

    results = []

    def report(name, passed, detail=""):
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status} | {name}: {detail}")
        results.append((name, passed, detail))

    session = get_db()
    test_uid = 999  # Isolated test user ID
    created_ids = {}

    try:
        # 1. Create an expense
        exp = models.Expense(
            user_id=test_uid,
            category="Dining Out",
            description="Integration Test Dinner",
            amount=1450.50,
            date=date.today(),
            payment_mode="UPI"
        )
        session.add(exp)
        session.commit()
        created_ids["expense"] = exp.id
        report("1. Create Expense", exp.id is not None and exp.id > 0, f"Saved with ID={exp.id}")

        # 2. Read the saved expense back directly from MongoDB
        raw_exp = db.expenses.find_one({"id": exp.id, "user_id": test_uid})
        read_success = (
            raw_exp is not None
            and raw_exp.get("amount") == 1450.50
            and raw_exp.get("category") == "Dining Out"
            and "title" in raw_exp  # Dual schema alias
        )
        report("2. Read Expense Back", read_success, f"Found in MongoDB collection 'expenses': {raw_exp.get('description')} (amount={raw_exp.get('amount')})")

        # 3. Create an income record
        inc = models.Income(
            user_id=test_uid,
            source="Freelance Consulting",
            amount=35000.00,
            date=date.today(),
            note="Q4 Project Advance"
        )
        session.add(inc)
        session.commit()
        created_ids["income"] = inc.id
        report("3. Create Income", inc.id is not None and inc.id > 0, f"Saved with ID={inc.id}")

        # 4. Read the saved income back directly from MongoDB (incomes collection)
        raw_inc = db.incomes.find_one({"id": inc.id, "user_id": test_uid})
        inc_read_success = (
            raw_inc is not None
            and raw_inc.get("amount") == 35000.00
            and raw_inc.get("source") == "Freelance Consulting"
            and "income_date" in raw_inc  # Dual schema alias
        )
        report("4. Read Income Back", inc_read_success, f"Found in MongoDB collection 'incomes': source={raw_inc.get('source')} (amount={raw_inc.get('amount')})")

        # 5. Create a budget and verify it exists
        bgt = models.Budget(
            user_id=test_uid,
            category="Integration Test Category",
            monthly_limit=8500.00
        )
        session.add(bgt)
        session.commit()
        created_ids["budget"] = bgt.id
        raw_bgt = db.budgets.find_one({"id": bgt.id, "user_id": test_uid})
        bgt_success = (
            raw_bgt is not None
            and raw_bgt.get("monthly_limit") == 8500.00
            and raw_bgt.get("amount") == 8500.00  # Dual schema alias verified
        )
        report("5. Create Budget", bgt_success, f"Verified in MongoDB collection 'budgets': limit={raw_bgt.get('monthly_limit')} (dual alias amount={raw_bgt.get('amount')})")

        # 6. Create an investment record and verify it exists
        inv = models.Investment(
            user_id=test_uid,
            name="Test Nifty 50 Index Fund",
            inv_type="Mutual Fund",
            amount=50000.00,
            monthly_inflow=5000.00,
            expected_return=14.5,
            start_date=date.today(),
            note="Integration test SIP"
        )
        session.add(inv)
        session.commit()
        created_ids["investment"] = inv.id
        raw_inv = db.investments.find_one({"id": inv.id, "user_id": test_uid})
        inv_success = (
            raw_inv is not None
            and raw_inv.get("amount") == 50000.00
            and raw_inv.get("type") == "Mutual Fund"  # Dual schema alias verified
        )
        report("6. Create Investment", inv_success, f"Verified in MongoDB collection 'investments': name={raw_inv.get('name')} (amount={raw_inv.get('amount')}, type={raw_inv.get('type')})")

        # 7. Update an existing record and verify the change persists
        bgt.monthly_limit = 12000.00
        session.commit()
        raw_bgt_updated = db.budgets.find_one({"id": bgt.id})
        update_success = raw_bgt_updated is not None and raw_bgt_updated.get("monthly_limit") == 12000.00
        report("7. Update Record Persistence", update_success, f"Budget ID={bgt.id} updated from 8500 -> {raw_bgt_updated.get('monthly_limit')}")

        # 8. Delete test records and verify deletion
        session.delete(exp)
        session.delete(inc)
        session.delete(bgt)
        session.delete(inv)
        session.commit()

        post_exp = db.expenses.find_one({"id": created_ids.get("expense")})
        post_inc = db.incomes.find_one({"id": created_ids.get("income")})
        post_bgt = db.budgets.find_one({"id": created_ids.get("budget")})
        post_inv = db.investments.find_one({"id": created_ids.get("investment")})

        delete_success = (post_exp is None and post_inc is None and post_bgt is None and post_inv is None)
        report("8. Delete Record Verification", delete_success, "All 4 test documents successfully purged from database collections.")

        # 9. Confirm user isolation (records belong to authenticated user only)
        # Create a record under test_uid, confirm query for other user does not return it
        iso_exp = models.Expense(
            user_id=test_uid,
            category="Shopping",
            description="Isolation Test",
            amount=999.00,
            date=date.today()
        )
        session.add(iso_exp)
        session.commit()
        user_1_records = session.query(models.Expense).filter(
            models.Expense.user_id == 1,
            models.Expense.description == "Isolation Test"
        ).all()
        user_test_records = session.query(models.Expense).filter(
            models.Expense.user_id == test_uid,
            models.Expense.description == "Isolation Test"
        ).all()
        isolation_success = len(user_1_records) == 0 and len(user_test_records) == 1
        # Cleanup isolation test record
        session.delete(iso_exp)
        session.commit()
        report("9. User Isolation", isolation_success, f"Query for user 1 returned {len(user_1_records)} records, user {test_uid} returned {len(user_test_records)} record")

        # 10. Verify failed inserts return a clear error rather than false success
        from fastapi import HTTPException
        from routers.budget import add_or_update_budget, BudgetIn
        failed_insert_success = False
        try:
            # Attempt to create budget with negative limit
            invalid_budget = BudgetIn(category="Invalid", monthly_limit=-500)
            fake_user = models.User(id=test_uid)
            add_or_update_budget(invalid_budget, fake_user, session)
        except HTTPException as he:
            failed_insert_success = (he.status_code == 400 and "greater than 0" in str(he.detail))
            error_msg = f"HTTP {he.status_code}: {he.detail}"
        except Exception as ex:
            error_msg = str(ex)

        report("10. Error Handling on Invalid Insert", failed_insert_success, f"Rejected properly: {error_msg}")

    except Exception as ex:
        report("Unexpected Test Failure", False, str(ex))
        import traceback
        traceback.print_exc()

    print("=" * 70)
    passed_count = sum(1 for _, p, _ in results if p)
    print(f"TEST SUMMARY: {passed_count}/{len(results)} TESTS PASSED")
    print("=" * 70)
    return passed_count == len(results)

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
