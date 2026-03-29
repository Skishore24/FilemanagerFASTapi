from fastapi import APIRouter
import random
import time
import jwt
from datetime import datetime, timedelta
from twilio.rest import Client
import os

from app.utils.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_HOURS

router = APIRouter()

# Twilio setup
client = Client(
    os.getenv("TWILIO_ACCOUNT_SID"),
    os.getenv("TWILIO_AUTH_TOKEN")
)

TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")

otp_store = {}
last_sent = {}

# ========================= SEND OTP =========================
@router.post("/send-otp")
def send_otp(data: dict):
    mobile = data.get("mobile")
    name = data.get("name", "Student")

    if not mobile:
        return {"success": False, "message": "Mobile required"}

    current_time = time.time()

    # ⛔ Rate limit (60 sec)
    if mobile in last_sent:
        if current_time - last_sent[mobile] < 60:
            return {"success": False, "message": "Wait before retry"}

    otp = str(random.randint(100000, 999999))

    otp_store[mobile] = {
        "otp": otp,
        "expires": current_time + 300,
        "name": name
    }

    last_sent[mobile] = current_time

    # ✅ SEND OTP VIA WHATSAPP
    try:
        message = client.messages.create(
            from_=TWILIO_WHATSAPP_NUMBER,
            to=f"whatsapp:{mobile}",
            body=f"Your MCET OTP is: {otp}"
        )
    except Exception as e:
        return {"success": False, "message": str(e)}

    return {"success": True}


# ========================= VERIFY OTP =========================
@router.post("/verify-otp")
def verify_otp(data: dict):
    mobile = data.get("mobile")
    otp = str(data.get("otp"))

    if mobile not in otp_store:
        return {"success": False, "message": "No OTP found"}

    record = otp_store[mobile]

    if time.time() > record["expires"]:
        del otp_store[mobile]
        return {"success": False, "message": "OTP expired"}

    if otp != record["otp"]:
        return {"success": False, "message": "Wrong OTP"}

    payload = {
        "mobile": mobile,
        "name": record["name"],
        "role": "student",
        "exp": datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    }

    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    del otp_store[mobile]

    return {
        "success": True,
        "token": token,
        "user": {
            "mobile": mobile,
            "name": record["name"],
            "role": "student"
        }
    }