from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token
import requests

router = APIRouter()

# ============================================================
# LOCATION
# ============================================================
@router.get("/location")
def get_location(request: Request):
    ip = request.client.host

    try:
        res = requests.get(f"http://ip-api.com/json/{ip}", timeout=3).json()
        return {
            "ip": ip,
            "country": res.get("country", "Unknown"),
            "state": res.get("regionName", "Unknown"),
            "success": True
        }
    except:
        return {"ip": ip, "country": "Global", "state": "Unknown", "success": False}


# ============================================================
# SAVE VIEW
# ============================================================
@router.post("/save-view")
def save_view(data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    db.execute(text("""
        INSERT INTO view_logs (file_name, name, mobile, country, state, device, action)
        VALUES (:file, :name, :mobile, :country, :state, :device, 'view')
    """), data)
    db.commit()
    return {"success": True}


# ============================================================
# SAVE DOWNLOAD
# ============================================================
@router.post("/save-download")
def save_download(data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    db.execute(text("""
        INSERT INTO view_logs (file_name, name, mobile, country, state, device, action)
        VALUES (:file, :name, :mobile, :country, :state, :device, 'download')
    """), data)
    db.commit()
    return {"success": True}


# ============================================================
# GET LOGS (FIXED 🔥)
# ============================================================
@router.get("")
def get_logs(
    page: int = 1,
    limit: int = 10,
    search: str = "",
    sort: str = "DESC",
    date: str = "",
    category: str = "All",
    user=Depends(verify_token),
    db: Session = Depends(get_db)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    sort_order = "DESC" if sort.upper() == "DESC" else "ASC"

    base_query = "FROM view_logs WHERE 1=1"
    params = {}

    if search:
        base_query += " AND (file_name LIKE :search OR mobile LIKE :search OR name LIKE :search)"
        params["search"] = f"%{search}%"

    if date:
        base_query += " AND DATE(viewed_at) = :date"
        params["date"] = date

    # COUNT
    total_logs = db.execute(
        text(f"SELECT COUNT(*) {base_query}"),
        params
    ).scalar()

    total_pages = (total_logs + limit - 1) // limit if total_logs else 1

    # MAIN QUERY
    query = f"""
        SELECT * {base_query}
        ORDER BY viewed_at {sort_order}
        LIMIT :limit OFFSET :offset
    """

    params["limit"] = limit
    params["offset"] = (page - 1) * limit

    result = db.execute(text(query), params).fetchall()

    return {
        "logs": [dict(r._mapping) for r in result],
        "totalPages": total_pages,
        "totalLogs": total_logs
    }


# ============================================================
# DELETE LOG
# ============================================================
@router.delete("/{id}")
def delete_log(id: int, user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    db.execute(
        text("DELETE FROM view_logs WHERE id = :id"),
        {"id": id}
    )
    db.commit()

    return {"success": True}