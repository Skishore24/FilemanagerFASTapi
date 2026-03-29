import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Ensure .env is loaded from the correct location
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

# Get environment variables
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_NAME = os.getenv("DB_NAME")

# Validate required variables
if not all([DB_USER, DB_PASS, DB_NAME]):
    missing = [k for k, v in {"DB_USER": DB_USER, "DB_PASS": DB_PASS, "DB_NAME": DB_NAME}.items() if not v]
    print(f"❌ [DATABASE] Missing required environment variables: {', '.join(missing)}")
    # We don't raise error here, let create_engine fail with a better message if possible
    # or handle in main.py startup

import urllib.parse
# Encode password properly to handle special characters (@, :, etc.)
encoded_pass = urllib.parse.quote_plus(DB_PASS) if DB_PASS else ""
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{encoded_pass}@{DB_HOST}/{DB_NAME}"

# Create engine (like connection pool)
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=0,
    pool_pre_ping=True
)

# Create session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency (used in routes)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()