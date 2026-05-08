"""
Run this script ONCE on the server to migrate plaintext passwords in the DB to bcrypt hashes.
  python hash_passwords.py
"""
import mysql.connector
from passlib.context import CryptContext
import os

DB_CONFIG = {
    'host': os.environ.get("DB_HOST", "localhost"),
    'user': os.environ.get("DB_USER", "root"),
    'password': os.environ.get("DB_PASSWORD", ""),
    'database': os.environ.get("DB_NAME", "mpt_db"),
}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor(dictionary=True)

cursor.execute("SELECT id, password FROM users")
users = cursor.fetchall()

migrated = 0
for user in users:
    plaintext = user["password"]
    if plaintext.startswith("$2b$") or plaintext.startswith("$2a$"):
        continue  # already hashed
    hashed = pwd_context.hash(plaintext)
    cursor.execute("UPDATE users SET password = %s WHERE id = %s", (hashed, user["id"]))
    migrated += 1

conn.commit()
cursor.close()
conn.close()
print(f"Migrated {migrated} password(s).")
