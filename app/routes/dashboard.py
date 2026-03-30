from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token

router = APIRouter(tags=["Dashboard"])


# ================= DASHBOARD SUMMARY =================
@router.get("")
def get_dashboard(db: Session = Depends(get_db), user=Depends(verify_token)):
    try:
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")

        total_files = db.execute(text("SELECT COUNT(*) FROM files")).scalar() or 0
        total_users = db.execute(text("SELECT COUNT(DISTINCT mobile) FROM view_logs")).scalar() or 0
        total_categories = db.execute(text("SELECT COUNT(*) FROM categories")).scalar() or 0
        total_views = db.execute(text("SELECT COUNT(*) FROM view_logs")).scalar() or 0

        top_file = db.execute(text("""
            SELECT file_name
            FROM view_logs
            GROUP BY file_name
            ORDER BY COUNT(*) DESC
            LIMIT 1
        """)).fetchone()

        return {
            "totalFiles": total_files,
            "totalUsers": total_users,
            "totalCategories": total_categories,
            "totalViews": total_views,
            "topFile": top_file[0] if top_file else "None"
        }

    except Exception as e:
        print("🔥 DASHBOARD ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))


# ================= CHARTS =================
@router.get("/charts")
def get_dashboard_charts(db: Session = Depends(get_db), user=Depends(verify_token)):
    try:
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")

        # 🔥 TEST QUERY (to ensure DB works)
        test = db.execute(text("SELECT 1")).fetchone()
        if not test:
            raise Exception("DB connection failed")

        # ================= PERFORMANCE =================
        performance = [
            {"month": "Jan", "views": 5, "downloads": 2},
            {"month": "Feb", "views": 10, "downloads": 4},
            {"month": "Mar", "views": 7, "downloads": 3},
        ]

        # ================= DEVICES =================
        devices = [
            {"device": "Mobile", "total": 10},
            {"device": "Desktop", "total": 5}
        ]

        # ================= USERS =================
        views = [
            {"month": "Jan", "total": 3},
            {"month": "Feb", "total": 6},
            {"month": "Mar", "total": 4}
        ]

        # ================= COUNTRIES =================
        countries = [
            {"country": "India", "views": 20, "downloads": 5},
            {"country": "USA", "views": 10, "downloads": 3}
        ]

        # ================= TOP USERS =================
        top_users = [
            {"name": "User1", "mobile": "9999999999", "totalVisits": 10, "lastActive": "2025-01-01"},
            {"name": "User2", "mobile": "8888888888", "totalVisits": 8, "lastActive": "2025-01-01"}
        ]

        return {
            "performance": performance,
            "devices": devices,
            "views": views,
            "countries": countries,
            "topUsers": top_users
        }

    except Exception as e:
        print("🔥 CHART ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))