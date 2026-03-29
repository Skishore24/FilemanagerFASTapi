from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.auth_service import login_user

router = APIRouter()

@router.post("/login")
def login(data: dict, db: Session = Depends(get_db)):
    return login_user(db, data.get("email"), data.get("password"))