from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token

router = APIRouter()

# ============================================================
# GET USERS (ADMIN)
# ============================================================
@router.get("")
def get_users(user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        result = db.execute(text("""
            SELECT 
                mobile, 
                MAX(name) AS name,
                MAX(last_active) AS last_active,
                COUNT(*) AS total_logs
            FROM view_logs
            WHERE mobile IS NOT NULL AND mobile <> ''
            GROUP BY mobile
            ORDER BY last_active DESC
        """)).fetchall()

        users = []
        for r in result:
            row = dict(r._mapping)

            users.append({
                "mobile": row["mobile"],
                "name": row["name"] or "Unknown",
                "location": "Unknown",
                "last_active": row["last_active"],
                "logs": {"length": row["total_logs"]}
            })

        return users

    except Exception as e:
        print("❌ USER ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Failed to load users")


# ============================================================
# BLOCK USER
# ============================================================
@router.post("/block")
def block_user(data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    mobile = data.get("mobile")

    db.execute(
        text("INSERT IGNORE INTO blocked_users (mobile) VALUES (:mobile)"),
        {"mobile": mobile}
    )
    db.commit()

    return {"success": True}


# ============================================================
# UNBLOCK USER
# ============================================================
@router.post("/unblock")
def unblock_user(data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    mobile = data.get("mobile")

    db.execute(
        text("DELETE FROM blocked_users WHERE mobile = :mobile"),
        {"mobile": mobile}
    )
    db.commit()

    return {"success": True}


# ============================================================
# GET BLOCKED USERS
# ============================================================
@router.get("/blocked")
def get_blocked(user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    result = db.execute(
        text("SELECT mobile FROM blocked_users")
    ).fetchall()

    return [dict(r._mapping) for r in result]


# ============================================================
# CHECK BLOCK STATUS
# ============================================================
@router.post("/check-block")
def check_block(data: dict, db: Session = Depends(get_db)):
    mobile = data.get("mobile")
    if not mobile:
        raise HTTPException(status_code=400, detail="Mobile number required")

    result = db.execute(
        text("SELECT 1 FROM blocked_users WHERE mobile = :mobile"),
        {"mobile": mobile}
    ).fetchone()

    return {"blocked": bool(result)}


# ============================================================
# HEARTBEAT (Update Activity & Check Block Status)
# ============================================================
@router.post("/heartbeat")
def heartbeat(data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    mobile = data.get("mobile")
    if not mobile:
        raise HTTPException(status_code=400, detail="Mobile number required")

    # Update activity log (last timestamp only)
    db.execute(
        text("UPDATE view_logs SET last_active = NOW() WHERE mobile = :mobile"),
        {"mobile": mobile}
    )
    db.commit()

    # Check block status
    result = db.execute(
        text("SELECT 1 FROM blocked_users WHERE mobile = :mobile"),
        {"mobile": mobile}
    ).fetchone()

    return {"blocked": bool(result)}