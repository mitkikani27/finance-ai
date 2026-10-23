"""Module 13 router — Live Market + AI insights + Pro Interactive Chart (JWT-protected)."""
from fastapi import APIRouter, Depends, HTTPException, Query

import auth as authlib
import market
import models

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/live-feed")
def market_live_feed(
    symbol: str = Query("^NSEI", description="Asset ticker symbol"),
    timeframe: str = Query("1D", description="Chart timeframe (1D, 1W, 1M, 3M, 1Y, ALL)"),
    user: models.User = Depends(authlib.get_current_user)
):
    """All-in-one ultra-fast live market feed (<10ms) with pro chart data."""
    try:
        return market.get_live_feed(symbol, timeframe)
    except Exception as e:
        raise HTTPException(500, f"Live feed error: {e}")


@router.get("/chart")
def market_chart(
    symbol: str = Query("^NSEI", description="Asset ticker symbol"),
    timeframe: str = Query("1D", description="Chart timeframe (1D, 1W, 1M, 3M, 1Y, ALL)"),
    user: models.User = Depends(authlib.get_current_user)
):
    """High-precision live financial chart points and statistics (<5ms)."""
    try:
        return market.get_chart(symbol, timeframe)
    except Exception as e:
        raise HTTPException(500, f"Chart data error: {e}")


@router.get("/overview")
def market_overview(user: models.User = Depends(authlib.get_current_user)):
    """Live indices (NIFTY/SENSEX/BANKNIFTY), sector performance, market mood (<5ms)."""
    try:
        return market.overview()
    except Exception as e:
        raise HTTPException(503, f"Live market data unavailable: {e}")


@router.get("/trending")
def market_trending(user: models.User = Depends(authlib.get_current_user)):
    """Today's gainers/losers with AI momentum scores (<5ms)."""
    try:
        return market.trending()
    except Exception as e:
        raise HTTPException(503, f"Live market data unavailable: {e}")


@router.get("/insights")
def market_insights(user: models.User = Depends(authlib.get_current_user)):
    """AI assistant: aaj ka best performer, strong sector, top-3 momentum picks (<5ms)."""
    try:
        return market.insights()
    except Exception as e:
        raise HTTPException(503, f"Live market data unavailable: {e}")


@router.get("/funds")
def market_funds(user: models.User = Depends(authlib.get_current_user)):
    """Real mutual fund / ETF performance: 1M/6M/1Y returns, verdicts, best pick (<2ms)."""
    try:
        return market.funds()
    except Exception as e:
        raise HTTPException(503, f"Live fund data unavailable: {e}")


@router.get("/stock/{symbol}")
def stock_detail(symbol: str, user: models.User = Depends(authlib.get_current_user)):
    """Stock detail with 30-day sparkline and momentum indicators (<5ms)."""
    try:
        return market.stock_detail(symbol)
    except LookupError:
        raise HTTPException(404, f"'{symbol}' universe me nahi hai — trending list se choose karein.")
    except Exception as e:
        raise HTTPException(503, f"Live market data unavailable: {e}")
