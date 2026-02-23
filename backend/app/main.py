from fastapi import FastAPI, Depends, HTTPException, Request, APIRouter, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import yfinance as yf

from app.api.v1.routes import categories, transactions, goals, recurring, ai, train, phoneme
from app.db.database import engine, Base

load_dotenv()

# This will create the tables in the database
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Finance AI API", version="1.0")

# Load Allosaurus model on startup
@app.on_event("startup")
def startup_event():
    """Load ML models on server start"""
    from app.services.allosaurus_service import load_allosaurus_model
    load_allosaurus_model()

from fastapi.staticfiles import StaticFiles

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For personal use - open to all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure generated audio directory exists
os.makedirs("generated_audio", exist_ok=True)
# Mount static directory for serving audio files
app.mount("/generated_audio", StaticFiles(directory="generated_audio"), name="generated_audio")

# --- API Routers (No auth required for personal use) ---
api_v1_router = APIRouter()
api_v1_router.include_router(categories.router, prefix="/categories", tags=["Categories"])
api_v1_router.include_router(transactions.router, prefix="/transactions", tags=["Transactions"])
api_v1_router.include_router(goals.router, prefix="/goals", tags=["Goals"])
api_v1_router.include_router(recurring.router, prefix="/recurring", tags=["Recurring Expenses"])
api_v1_router.include_router(ai.router, prefix="/ai", tags=["AI"])
api_v1_router.include_router(train.router, prefix="/train", tags=["Training"])
api_v1_router.include_router(phoneme.router, prefix="/phoneme", tags=["Phoneme"])

app.include_router(api_v1_router, prefix="/api/v1")


# --- Health Checks ---
@app.get("/_health/live", tags=["Health"])
def health_live():
    return {"status": "ok"}

@app.get("/_health/ready", tags=["Health"])
def health_ready():
    # In a real app, you might check db connection here
    return {"status": "ready"}

@app.get("/")
def read_root():
    return {"message": "Welcome to the Finance AI API"}

@app.get("/api/yfinance")
def yfinance(symbol: str):
    try:
        ticket = yf.Ticker(symbol)
        price = ticket.info
        if symbol == "GC=F":
            return round((price["regularMarketPrice"] / 31.1035) * usd_inr(), 2)
        else:
            return round(price["regularMarketPrice"], 2)
    except:
        return "Network Error"
def usd_inr():
    ticker = yf.Ticker("USDINR=X")
    return ticker.info["regularMarketPrice"]
