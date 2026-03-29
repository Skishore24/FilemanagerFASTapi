from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.routes import (
    user,
    files,
    auth,
    categories,
    dashboard,
    logs,
    otp
)
from app.database import engine

from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

app = FastAPI()

# --- SECURITY MIDDLEWARE (Anti-Clickjacking, XSS, MIME-Sniffing) ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https:;"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# --- CORS CONFIGURATION (Prevent Unauthorized Cross-Origin Requests) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change to specific domains in production
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api/auth")
app.include_router(user.router, prefix="/api/users")
app.include_router(categories.router, prefix="/api/categories")
app.include_router(dashboard.router, prefix="/api/dashboard")
app.include_router(files.router, prefix="/api/files")
app.include_router(logs.router, prefix="/api/logs")
app.include_router(otp.router, prefix="/api")

# Serve frontend (Moved to end to avoid intercepting API calls)
app.mount("/", StaticFiles(directory="public", html=True), name="static")

# DB test
@app.on_event("startup")
def test_db():
    from app.database import DB_HOST, DB_NAME, DB_USER
    try:
        print(f"📡 [DATABASE] Attempting connection to {DB_USER}@{DB_HOST}/{DB_NAME}...")
        conn = engine.connect()
        print("✅ [DATABASE] MySQL connected successfully")
        conn.close()
    except Exception as e:
        error_msg = str(e)
        if "Access denied" in error_msg:
            print("❌ [DATABASE] Access denied: Check your DB_USER and DB_PASS in .env")
        elif "Can't connect to MySQL server" in error_msg:
             print(f"❌ [DATABASE] Cannot reach MySQL at {DB_HOST}: Check if MySQL service is running")
        elif "Unknown database" in error_msg:
             print(f"❌ [DATABASE] Database '{DB_NAME}' not found: Run your migrations/schema")
        else:
             print("❌ [DATABASE] Connection failed:", error_msg)

        