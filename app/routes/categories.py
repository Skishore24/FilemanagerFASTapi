from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token

router = APIRouter()

# GET ALL
@router.get("")
def get_categories(db: Session = Depends(get_db)):
    try:
        result = db.execute(text("SELECT * FROM categories")).fetchall()
        return [dict(r._mapping) for r in result]
    except Exception as e:
        print("❌ [CATEGORIES] Fetch error:", str(e))
        raise HTTPException(status_code=500, detail="Failed to load categories")


# CREATE
@router.post("")
def create_category(data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    name = data.get("name")

    if not name or len(name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 chars")

    db.execute(
        text("INSERT INTO categories (name) VALUES (:name)"),
        {"name": name.strip()}
    )
    db.commit()

    return {"success": True}


# DELETE
@router.delete("/{id}")
def delete_category(id: int, user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    result = db.execute(
        text("SELECT id FROM categories WHERE id = :id"),
        {"id": id}
    ).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="Not found")

    db.execute(
        text("DELETE FROM categories WHERE id = :id"),
        {"id": id}
    )
    db.commit()

    return {"success": True}


# UPDATE
@router.put("/{id}")
def update_category(id: int, data: dict, user=Depends(verify_token), db: Session = Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    name = data.get("name")

    if not name or len(name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 chars")

    db.execute(
        text("UPDATE categories SET name = :name WHERE id = :id"),
        {"name": name.strip(), "id": id}
    )
    db.commit()

    return {"success": True}