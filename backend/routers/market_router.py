"""Module 13 router — Live Market + AI insights (educational, JWT-protected)."""
from fastapi import APIRouter, Depends, HTTPException

import auth as authlib
import market
import models

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/overview")
def market_overview(user: models.User = Depends(authlib.get_current_user)):
    """Live indices (NIFTY/SENSEX/BANKNIFTY), sector performance, market mood."""
    try:
        return market.overview()
    except Exception as e:
        raise HTTPException(503, f"Live market data unavailable ({e.__class__.__name__}). Internet check karein.")


@router.get("/trending")
def market_trending(user: models.User = Depends(authlib.get_current_user)):
    """Today's gainers/losers with AI momentum scores."""
    try:
        return market.trending()
    except Exception as e:
        raise HTTPException(503, f"Live market data unavailable ({e.__class__.__name__}).")


@router.get("/insights")
def market_insights(user: models.User = Depends(authlib.get_current_user)):
    """AI assistant: aaj ka best performer, strong sector, top-3 momentum picks — with reasons."""
    try:
        return market.insights()
    except Exception as e:
        raise HTTPException(503, f"Live market data unavailable ({e.__class__.__name__}).")


@router.get("/funds")
def market_funds(user: models.User = Depends(authlib.get_current_user)):
    """Real mutual fund / ETF performance: 1M/6M/1Y returns, verdicts, best pick."""
    try:
        return market.funds()
    except Exception as e:
        raise HTTPException(503, f"Live fund data unavailable ({e.__class__.__name__}).")


@router.get("/stock/{symbol}")
def stock_detail(symbol: str, user: models.User = Depends(authlib.get_current_user)):
    try:
        return market.stock_detail(symbol)
    except LookupError:
        raise HTTPException(404, f"'{symbol}' universe me nahi hai — trending list se choose karein.")
    except Exception as e:
        raise HTTPException(503, f"Live market data unavailable ({e.__class__.__name__}).")
