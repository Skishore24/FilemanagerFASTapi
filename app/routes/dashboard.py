from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token

router = APIRouter()

# ============================================================
# 📊 DASHBOARD SUMMARY
# ============================================================
@router.get("")
def get_dashboard(db: Session = Depends(get_db), user=Depends(verify_token)):
    try:
        total_files = db.execute(text("SELECT COUNT(*) FROM files")).scalar()
        total_users = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
        total_categories = db.execute(text("SELECT COUNT(*) FROM categories")).scalar()

        top_file = db.execute(
            text("SELECT name FROM files ORDER BY id DESC LIMIT 1")
        ).fetchone()

        return {
            "totalFiles": total_files or 0,
            "totalUsers": total_users or 0,
            "totalCategories": total_categories or 0,
            "totalViews": 0,
            "topFile": top_file[0] if top_file else "None"
        }

    except Exception as e:
        print("❌ DASHBOARD SUMMARY ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Dashboard load failed")


# ============================================================
# 📈 DASHBOARD CHARTS (FIXED)
# ============================================================
@router.get("/charts")
def get_dashboard_charts(db: Session = Depends(get_db), user=Depends(verify_token)):
    try:
        # ✅ SAFE QUERY (no missing columns)
        top_users = db.execute(text("""
            SELECT name, mobile
            FROM users
            LIMIT 5
        """)).fetchall()

        top_users_list = []
        for u in top_users:
            row = dict(u._mapping)

            top_users_list.append({
                "name": row.get("name") or "Unknown",
                "mobile": row.get("mobile") or "-",
                "totalVisits": 0,
                "lastActive": None
            })

        return {
            "performance": [],   # frontend handles empty safely
            "devices": [],
            "views": [],
            "countries": [],
            "topUsers": top_users_list
        }

    except Exception as e:
        print("❌ DASHBOARD CHART ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Charts load failed")