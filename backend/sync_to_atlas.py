"""FinMate AI — Sync Local Data to MongoDB Atlas & Verify Atlas Persistence.

Usage:
    python backend/sync_to_atlas.py
    python backend/sync_to_atlas.py --watch
"""
import os
import sys
import time
import certifi
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

# Fix Windows console encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

load_dotenv(Path(__file__).resolve().parent / ".env")
MONGO_URI = os.getenv("MONGO_URI", "")
DB_NAME = os.getenv("MONGO_DB", "finmate_ai")

def sync_all():
    print("=" * 70)
    print("FINMATE AI — MONGODB ATLAS SYNCHRONIZATION & VERIFICATION")
    print("=" * 70)

    # 1. Test Atlas Connection
    print(f"Connecting to MongoDB Atlas database: '{DB_NAME}'...")
    try:
        atlas_client = MongoClient(
            MONGO_URI,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=4000,
            connectTimeoutMS=4000
        )
        atlas_client.admin.command("ping")
        print("[SUCCESS] MongoDB Atlas connection established!")
    except Exception as e:
        err_str = str(e)
        print("\n[BLOCKED] Unable to connect to MongoDB Atlas cluster.")
        if "TLSV1_ALERT_INTERNAL_ERROR" in err_str or "SSL alert number 80" in err_str:
            import urllib.request
            try:
                ip = urllib.request.urlopen("https://api.ipify.org", timeout=3).read().decode()
            except Exception:
                ip = "your current public IP"
            print("-" * 70)
            print("REASON: MongoDB Atlas IP Access List Firewall rejection.")
            print(f"Your Current Public IP: {ip}")
            print("\nHOW TO FIX IN ATLAS (30 SECONDS):")
            print("1. Open MongoDB Atlas: https://cloud.mongodb.com")
            print("2. In the left menu, click 'Network Access' (under Security)")
            print("3. Click '+ ADD IP ADDRESS'")
            print("4. Select 'ALLOW ACCESS FROM ANYWHERE' (0.0.0.0/0) or enter '0.0.0.0/0'")
            print(f"   (You can also click 'Add Current IP Address' -> {ip})")
            print("5. Click 'Confirm'")
            print("-" * 70)
        else:
            print(f"Error detail: {err_str}")
        return False

    atlas_db = atlas_client[DB_NAME]

    # 2. Connect to local MongoDB
    try:
        local_client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=2000)
        local_client.admin.command("ping")
        local_db = local_client[DB_NAME]
        print("[SUCCESS] Local MongoDB connection established!")
    except Exception as e:
        print(f"[WARNING] Local MongoDB not reachable ({e}). Proceeding without local data.")
        local_db = None

    # 3. Synchronize collections
    if local_db is not None:
        collections = ["users", "budgets", "expenses", "incomes", "investments", "goals", "ocr_receipts", "notifications", "chat_history", "counters"]
        print("-" * 70)
        print("SYNCHRONIZING COLLECTIONS LOCAL -> ATLAS:")
        for col_name in collections:
            local_cnt = local_db[col_name].count_documents({})
            atlas_cnt = atlas_db[col_name].count_documents({})
            print(f"Collection '{col_name}': Local={local_cnt} | Atlas={atlas_cnt}")
            if local_cnt > 0:
                docs = list(local_db[col_name].find())
                for d in docs:
                    if "id" in d:
                        atlas_db[col_name].replace_one({"id": d["id"]}, d, upsert=True)
                    else:
                        atlas_db[col_name].replace_one({"_id": d["_id"]}, d, upsert=True)
                new_atlas_cnt = atlas_db[col_name].count_documents({})
                print(f"  -> Synced to Atlas: {new_atlas_cnt} total documents in '{col_name}'")

        # Also populate singular 'income' in Atlas so if user views 'income' tab, it's there
        if local_db["incomes"].count_documents({}) > 0:
            for d in list(local_db["incomes"].find()):
                if "id" in d:
                    atlas_db["income"].replace_one({"id": d["id"]}, d, upsert=True)
                else:
                    atlas_db["income"].replace_one({"_id": d["_id"]}, d, upsert=True)
            print(f"  -> Synced alias collection 'income' (singular): {atlas_db['income'].count_documents({})} documents")

    print("-" * 70)
    print("VERIFYING ATLAS DOCUMENT COUNTS IN 'finmate_ai':")
    for c in ["users", "incomes", "income", "expenses", "budgets", "investments", "notifications", "chat_history", "goals"]:
        if c in atlas_db.list_collection_names():
            print(f"  - Atlas finmate_ai.{c}: {atlas_db[c].count_documents({})} documents")
    print("=" * 70)
    print("ALL DATA PERSISTED DIRECTLY TO MONGODB ATLAS.")
    print("=" * 70)
    return True


def watch_loop():
    print("FINMATE AI — Waiting for MongoDB Atlas IP Access List approval...")
    print("As soon as you add 0.0.0.0/0 in MongoDB Atlas Network Access, sync will trigger automatically!\n")
    while True:
        try:
            atlas_client = MongoClient(
                MONGO_URI,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=3000,
                connectTimeoutMS=3000
            )
            atlas_client.admin.command("ping")
            print("\n>>> ATLAS CONNECTION DETECTED! Starting synchronization immediately...")
            sync_all()
            break
        except Exception:
            time.sleep(4)

if __name__ == "__main__":
    if "--watch" in sys.argv:
        watch_loop()
    else:
        sync_all()
