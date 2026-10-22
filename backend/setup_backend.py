import os
from pathlib import Path

BASE_DIR = Path("c:/Users/Lenovo/Desktop/project/finance-ai/backend")

dirs_to_create = [
    "models",
    "schemas",
    "routes",
    "services",
    "auth",
    "database"
]

for d in dirs_to_create:
    (BASE_DIR / d).mkdir(parents=True, exist_ok=True)
