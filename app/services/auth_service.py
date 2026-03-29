from sqlalchemy import text
from fastapi import HTTPException
import bcrypt
import jwt
from datetime import datetime, timedelta
from app.utils.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_HOURS

def login_user(db, email, password):

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email & password required")

    if "@" not in email:
        email += "@gmail.com"

    result = db.execute(
        text("SELECT id, email, password, role FROM users WHERE email = :email LIMIT 1"),
        {"email": email}
    ).fetchone()

    if not result:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id, user_email, user_pw_hash, user_role = result

    # Fix encoding issue
    if isinstance(user_pw_hash, str):
        user_pw_hash = user_pw_hash.encode()

    if not bcrypt.checkpw(password.encode(), user_pw_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    payload = {
        "id": user_id,
        "email": user_email,
        "role": user_role,
        "exp": datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    }

    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "token": token,
        "user": {
            "email": user_email,
            "role": user_role
        }
    }