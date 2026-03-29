from fastapi import HTTPException, Request, Depends
import jwt

SECRET_KEY = "mcet_secret_key_2024"

def verify_token(request: Request):
    auth = request.headers.get("Authorization")
    token = None

    if auth and "Bearer " in auth:
        token = auth.split(" ")[1]
    else:
        # Check query parameters for file delivery
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Token missing")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")

    except Exception:
        raise HTTPException(status_code=403, detail="Invalid token")