from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token
import os
import shutil
import math

router = APIRouter()
UPLOAD_DIR = "uploads"

# Ensure upload folder
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ========================= FILE SIZE =========================
def get_file_size(size):
    for unit in ['B','KB','MB','GB']:
        if size < 1024:
            return f"{round(size,2)} {unit}"
        size /= 1024
# ========================= UPDATE IMPORTANCE =========================
@router.put("/importance/{file_id}")
def update_importance(
    file_id: int,
    data: dict,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    if user["role"] != "admin":
        raise HTTPException(403, "Not authorized")

    # Check file
    result = db.execute(
        text("SELECT * FROM files WHERE id = :id"),
        {"id": file_id}
    ).fetchone()

    if not result:
        raise HTTPException(404, "File not found")

    viewable = "View Only" if data.get("importance") == "important" else "View & Download"

    db.execute(text("""
        UPDATE files
        SET viewable = :viewable
        WHERE id = :id
    """), {
        "id": file_id,
        "viewable": viewable
    })

    db.commit()

    return {"success": True}

# ========================= BULK ACTION =========================
@router.put("/bulk")
def bulk_action(
    data: dict,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    if user["role"] != "admin":
        raise HTTPException(403)

    ids = data.get("ids", [])
    action = data.get("action")

    if not ids:
        raise HTTPException(400, "No IDs provided")

    if action == "delete":
        for file_id in ids:
            db.execute(text("DELETE FROM files WHERE id = :id"), {"id": file_id})

    elif action in ["important", "less"]:
        viewable = "View Only" if action == "important" else "View & Download"
        for file_id in ids:
            db.execute(text("""
                UPDATE files SET viewable = :viewable WHERE id = :id
            """), {"id": file_id, "viewable": viewable})

    db.commit()
    return {"success": True}

# ========================= LIST FILES =========================
@router.get("")
def get_files(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT * FROM files ORDER BY date DESC")).fetchall()

    return [
        {
            "id": r.id,
            "name": r.name,
            "category": r.category,
            "importance": "important" if r.viewable == "View Only" else "less",
            "size": r.size,
            "date": r.date   # ✅ ADD THIS
        }
        for r in result
    ]

# ========================= VIEW FILE =========================
@router.get("/secure-files/{filename}")
def view_file(filename: str, user=Depends(verify_token)):
    safe_name = os.path.basename(filename)
    path = os.path.join(UPLOAD_DIR, safe_name)

    if not os.path.exists(path):
        raise HTTPException(404, "File not found")

    return FileResponse(path)


# ========================= DOWNLOAD FILE =========================
@router.get("/secure-files/download/{filename}")
def download_file(filename: str, user=Depends(verify_token), db: Session = Depends(get_db)):
    safe_name = os.path.basename(filename)
    path = os.path.join(UPLOAD_DIR, safe_name)

    if not os.path.exists(path):
        raise HTTPException(404, "File not found")

    # 🚫 Check "View Only"
    result = db.execute(
        text("SELECT viewable FROM files WHERE name = :name"),
        {"name": safe_name}
    ).fetchone()

    if result and result[0] == "View Only":
        raise HTTPException(403, "Download not allowed")

    return FileResponse(path, filename=safe_name)

# ========================= UPDATE FILE =========================
@router.put("/{file_id}")
def update_file(
    file_id: int,
    data: dict,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    if user["role"] != "admin":
        raise HTTPException(403, "Not authorized")

    # Get existing file
    result = db.execute(
        text("SELECT * FROM files WHERE id = :id"),
        {"id": file_id}
    ).fetchone()

    if not result:
        raise HTTPException(404, "File not found")

    # Convert importance → viewable
    viewable = "View Only" if data.get("importance") == "important" else "View & Download"

    # Update DB
    db.execute(text("""
        UPDATE files
        SET name = :name,
            category = :category,
            viewable = :viewable
        WHERE id = :id
    """), {
        "id": file_id,
        "name": data.get("name"),
        "category": data.get("category"),
        "viewable": viewable
    })

    db.commit()

    return {"success": True}

# ========================= DELETE FILE =========================
@router.delete("/{file_id}")
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    if user["role"] != "admin":
        raise HTTPException(403, "Not authorized")

    # Get file info
    result = db.execute(
        text("SELECT * FROM files WHERE id = :id"),
        {"id": file_id}
    ).fetchone()

    if not result:
        raise HTTPException(404, "File not found")

    # Delete file from disk
    file_path = os.path.join(UPLOAD_DIR, result.filepath or result.name)
    if os.path.exists(file_path):
        os.remove(file_path)

    # Delete from DB
    db.execute(
        text("DELETE FROM files WHERE id = :id"),
        {"id": file_id}
    )
    db.commit()

    return {"success": True}

# ========================= UPLOAD =========================
@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    category: str = Form("General"),
    importance: str = Form("less"),
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    if user["role"] != "admin":
        raise HTTPException(403)

    safe_name = os.path.basename(file.filename)
    path = os.path.join(UPLOAD_DIR, safe_name)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    size = get_file_size(os.path.getsize(path))
    viewable = "View Only" if importance == "important" else "View & Download"

    db.execute(text("""
        INSERT INTO files (name, filepath, category, viewable, size)
        VALUES (:name, :filepath, :category, :viewable, :size)
    """), {
        "name": safe_name,
        "filepath": safe_name,
        "category": category,
        "viewable": viewable,
        "size": size
    })

    db.commit()

    return {"success": True}