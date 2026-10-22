"""MongoDB connection.

Production/laptop: set MONGO_URI (local MongoDB or MongoDB Atlas free tier).
Sandbox/dev fallback: if no MongoDB is reachable, an in-memory mongomock client
is used so the app still boots (data lives until restart).
"""
import os

from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB", "finmate")

_mode = "mongodb"
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
    client.admin.command("ping")
except Exception:
    import mongomock
    client = mongomock.MongoClient()
    _mode = "mongomock"

db = client[DB_NAME]


def get_db():
    """FastAPI dependency — a fresh Session-like wrapper around the Mongo db."""
    from models import Session
    return Session(db)


def mode() -> str:
    return _mode
