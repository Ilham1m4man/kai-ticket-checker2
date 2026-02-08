import os
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bot import check_bengawan_once

app = FastAPI(title="Bengawan Bot Serverless")

# Setup CORS agar React bisa akses
ORIGIN = os.getenv("FRONTEND_ORIGIN") or "http://localhost:5173"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CheckRequest(BaseModel):
    url: str

@app.get("/")
def home():
    return {"status": "alive", "mode": "serverless"}

@app.post("/check-availability")
async def check_availability(payload: CheckRequest):
    """
    Endpoint ini dipanggil oleh React setiap X menit.
    """
    if not payload.url or "booking.kai.id" not in payload.url:
        raise HTTPException(status_code=400, detail="Invalid KAI URL")

    result = check_bengawan_once(payload.url)
    
    return result