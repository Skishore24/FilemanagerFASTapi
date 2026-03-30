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
def get_logs(
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    try:
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Admin only")

        offset = (page - 1) * limit

        # ✅ Fetch logs
        logs = db.execute(text("""
            SELECT 
                id,
                file_name,
                name,
                mobile,
                ip,
                device,
                viewed_at
            FROM view_logs
            ORDER BY viewed_at DESC
            LIMIT :limit OFFSET :offset
        """), {"limit": limit, "offset": offset}).fetchall()

        # ✅ Total count
        total = db.execute(text("SELECT COUNT(*) FROM view_logs")).scalar() or 0

        return {
            "logs": [dict(r._mapping) for r in logs],
            "totalPages": max(1, (total + limit - 1) // limit)
        }

    except Exception as e:
        print("🔥 LOG ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# BLOCK USER
# ============================================================
@router.post("/block")
def block_user(data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    mobile = data.get("mobile")
    if not mobile:
        raise HTTPException(400, "Mobile required")
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
    db.execute(text("""
    UPDATE view_logs 
    SET last_active = NOW() 
    WHERE mobile = :mobile 
    ORDER BY viewed_at DESC 
    LIMIT 1
    """), {"mobile": mobile})
    db.commit()

    # Check block status
    result = db.execute(
        text("SELECT 1 FROM blocked_users WHERE mobile = :mobile"),
        {"mobile": mobile}
    ).fetchone()

    return {"blocked": bool(result)}
    
@router.post("/delete-user-logs")
def delete_user_logs(data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(403)

    mobile = data.get("mobile")

    db.execute(
        text("DELETE FROM view_logs WHERE mobile = :mobile"),
        {"mobile": mobile}
    )
    db.commit()

    return {"success": True}