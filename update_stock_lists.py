#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Stock lists updater (KRX / NASDAQ / S&P500)
- Robust to weekends/holidays
- Retries with backoff
- Safer endpoints and headers
- Deterministic CSV schemas
Author: ChatGPT (for 현진님)
Date: 2025-08-13 (Asia/Seoul)
"""

from __future__ import annotations

import argparse
import io
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd
import requests
from requests.adapters import HTTPAdapter, Retry


# ----------------------------
# Utilities
# ----------------------------

def ensure_out_dir(out_dir: str) -> str:
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    return out_dir


def build_session() -> requests.Session:
    s = requests.Session()
    # General default headers
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive",
    })
    retries = Retry(
        total=3,
        backoff_factor=0.6,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(["GET", "POST"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=10, pool_maxsize=10)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


def recent_business_days_krx(max_back: int = 10) -> Iterable[str]:
    """Yield yyyymmdd strings for recent weekdays (Mon-Fri), up to max_back days back."""
    d = date.today()
    yielded = 0
    while yielded <= max_back:
        if d.weekday() < 5:  # 0=Mon..4=Fri
            yield d.strftime("%Y%m%d")
            yielded += 1
        d -= timedelta(days=1)


def save_csv(df: pd.DataFrame, path: str) -> None:
    df.to_csv(path, index=False, encoding="utf-8-sig")


def dedup_ordered(df: pd.DataFrame, key: str) -> pd.DataFrame:
    return df.loc[~df[key].duplicated(keep="first")].reset_index(drop=True)


# ----------------------------
# KRX
# ----------------------------

def update_krx_stocks(session: requests.Session, out_path: str, limit: Optional[int] = None) -> bool:
    """
    Try multiple KRX endpoints and recent business days until we get a non-empty result.
    Schema: Symbol,Name,Market
    Markets: KOSPI, KOSDAQ
    """
    url = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd"
    # Known blds that return listing info depending on KRX changes
    blds = [
        "dbms/MDC/STAT/standard/MDCSTAT01901",  # 종목검색(상장종목) - 기본
        "dbms/MDC/STAT/standard/MDCSTAT01501",  # 대체 (변경 시도)
    ]
    mkt_map = {"KOSPI": "STK", "KOSDAQ": "KSQ"}
    headers = {
        "Referer": "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd",
        "X-Requested-With": "XMLHttpRequest",
    }

    rows_out: List[Dict[str, str]] = []

    for bld in blds:
        for trdDd in recent_business_days_krx(max_back=10):
            logging.info(f"KRX try bld={bld}, trdDd={trdDd}")
            collected_any_for_date = False
            for market, mktId in mkt_map.items():
                payload = {
                    "bld": bld,
                    "mktId": mktId,
                    "trdDd": trdDd,
                    "money": "1",
                    "csvxls_isNo": "false",
                }
                try:
                    r = session.post(url, data=payload, headers=headers, timeout=20)
                    r.raise_for_status()
                    data = r.json()
                except Exception as e:
                    logging.warning(f"KRX request failed ({market}, {trdDd}): {e}")
                    continue

                table = data.get("OutBlock_1") or data.get("output") or []
                # Heuristic: Normalize field names
                for rec in table:
                    sym = rec.get("ISU_SRT_CD") or rec.get("ISU_CD") or rec.get("TRD_CD") or ""
                    nm = rec.get("ISU_ABBRV") or rec.get("ISU_NM") or rec.get("KOR_SECNM") or ""
                    sym = sym.strip()
                    nm = nm.strip()
                    if sym and nm:
                        rows_out.append({"Symbol": sym, "Name": nm, "Market": market})
                        collected_any_for_date = True

            if collected_any_for_date:
                # Stop at first date that yields data across any market
                break
        if rows_out:
            break

    if not rows_out:
        logging.error("KRX API returned no data; using fallback shortlist.")
        # Minimal, maintained fallback shortlist (ensure correctness of key blue chips)
        fallback = [
            {"Symbol": "005930", "Name": "삼성전자", "Market": "KOSPI"},
            {"Symbol": "000660", "Name": "SK하이닉스", "Market": "KOSPI"},
            {"Symbol": "005380", "Name": "현대차", "Market": "KOSPI"},
            {"Symbol": "051910", "Name": "LG화학", "Market": "KOSPI"},
            {"Symbol": "035720", "Name": "카카오", "Market": "KOSPI"},
            {"Symbol": "068270", "Name": "셀트리온", "Market": "KOSPI"},
            {"Symbol": "005490", "Name": "포스코홀딩스", "Market": "KOSPI"},  # corrected
        ]
        df = pd.DataFrame(fallback, columns=["Symbol", "Name", "Market"])
        save_csv(df, out_path)
        return False

    df = pd.DataFrame(rows_out, columns=["Symbol", "Name", "Market"])
    df = dedup_ordered(df, "Symbol").sort_values(["Market", "Symbol"]).reset_index(drop=True)
    if limit:
        df = df.head(limit)
    save_csv(df, out_path)
    return True


# ----------------------------
# NASDAQ
# ----------------------------

def _nasdaq_trader_primary(session: requests.Session) -> pd.DataFrame:
    """
    Primary: NASDAQ Trader official symbol directory (stable, pipe-delimited).
    """
    url = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt"
    r = session.get(url, timeout=30)
    r.raise_for_status()
    # Last line is "File Creation Time..."
    df = pd.read_csv(io.StringIO(r.text), sep="|", dtype=str)
    # Clean
    df = df.fillna("")
    df = df[(df["Test Issue"] == "N") & (df["ETF"] == "N")]
    out = df[["Symbol", "Security Name"]].rename(columns={"Security Name": "Company Name"})
    out["Symbol"] = out["Symbol"].str.strip()
    out["Company Name"] = out["Company Name"].str.strip()
    out = out[out["Symbol"].ne("")]
    out = dedup_ordered(out, "Symbol").sort_values("Symbol").reset_index(drop=True)
    return out


def _nasdaq_api_fallback(session: requests.Session) -> pd.DataFrame:
    """
    Fallback: nasdaq.com screener API (less stable; often 403 without proper headers).
    """
    url = "https://api.nasdaq.com/api/screener/stocks"
    headers = {
        "Origin": "https://www.nasdaq.com",
        "Referer": "https://www.nasdaq.com/market-activity/stocks/screener",
    }
    params = {"tableonly": "true", "limit": "0"}
    r = session.get(url, headers=headers, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    rows = (data.get("data") or {}).get("rows") or []
    records = []
    for row in rows:
        sym = (row.get("symbol") or "").strip()
        name = (row.get("name") or "").strip()
        if sym and name:
            records.append({"Symbol": sym, "Company Name": name})
    return pd.DataFrame.from_records(records, columns=["Symbol", "Company Name"])


def update_nasdaq_stocks(session: requests.Session, out_path: str, limit: Optional[int] = None) -> bool:
    """
    Generate NASDAQ common stock list (ex-ETFs, ex-test issues).
    Schema: Symbol,Company Name
    """
    try:
        df = _nasdaq_trader_primary(session)
        success = True
        logging.info("NASDAQ: fetched via NASDAQ Trader.")
    except Exception as e:
        logging.warning(f"NASDAQ Trader primary failed: {e} ; trying nasdaq.com API fallback.")
        try:
            df = _nasdaq_api_fallback(session)
            success = True
        except Exception as e2:
            logging.error(f"NASDAQ API fallback failed: {e2}")
            # Minimal fallback shortlist
            fallback = [
                {"Symbol": "AAPL", "Company Name": "Apple Inc."},
                {"Symbol": "MSFT", "Company Name": "Microsoft Corporation"},
                {"Symbol": "GOOGL", "Company Name": "Alphabet Inc. Class A"},
                {"Symbol": "AMZN", "Company Name": "Amazon.com, Inc."},
                {"Symbol": "NVDA", "Company Name": "NVIDIA Corporation"},
            ]
            df = pd.DataFrame(fallback, columns=["Symbol", "Company Name"])
            success = False

    df = dedup_ordered(df, "Symbol").sort_values("Symbol").reset_index(drop=True)
    if limit:
        df = df.head(limit)
    save_csv(df, out_path)
    return success


# ----------------------------
# S&P 500
# ----------------------------

def update_sp500(session: requests.Session, out_path: str) -> bool:
    """
    Pull S&P 500 from Wikipedia.
    Output schema:
      - Symbol_original (as on Wikipedia)
      - Symbol_yfinance ('.' -> '-' for yfinance compatibility)
      - Company Name
      - Sector
    """
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    try:
        # pandas will use requests under the hood; we ensure the page is fetchable via our session
        r = session.get(url, timeout=30)
        r.raise_for_status()
        # Use read_html on the downloaded HTML to avoid different SSL/proxy contexts
        tables = pd.read_html(io.StringIO(r.text))
        sp500 = tables[0]
        # Normalize columns
        # Old pages: columns could be ['Symbol','Security','Sector',...]
        # Recent pages include 'GICS Sector' naming.
        cols = {c.lower(): c for c in sp500.columns}
        sym_col = cols.get("symbol", "Symbol")
        name_col = cols.get("security", "Security")
        sector_col = cols.get("gics sector", "GICS Sector") if "gics sector" in cols else cols.get("sector", "Sector")

        sp500["Symbol_original"] = sp500[sym_col].astype(str).str.strip()
        sp500["Symbol_yfinance"] = sp500["Symbol_original"].str.replace(".", "-", regex=False)
        sp500["Company Name"] = sp500[name_col].astype(str).str.strip()
        sp500["Sector"] = sp500[sector_col].astype(str).str.strip()

        out = sp500[["Symbol_original", "Symbol_yfinance", "Company Name", "Sector"]]
        out = dedup_ordered(out, "Symbol_original").reset_index(drop=True)
        save_csv(out, out_path)
        return True
    except Exception as e:
        logging.error(f"S&P 500 fetch failed: {e}; using tiny fallback list.")
        fallback = pd.DataFrame(
            [
                {"Symbol_original": "AAPL", "Symbol_yfinance": "AAPL", "Company Name": "Apple Inc.", "Sector": "Information Technology"},
                {"Symbol_original": "MSFT", "Symbol_yfinance": "MSFT", "Company Name": "Microsoft Corporation", "Sector": "Information Technology"},
                {"Symbol_original": "NVDA", "Symbol_yfinance": "NVDA", "Company Name": "NVIDIA Corporation", "Sector": "Information Technology"},
            ],
            columns=["Symbol_original", "Symbol_yfinance", "Company Name", "Sector"],
        )
        save_csv(fallback, out_path)
        return False


# ----------------------------
# Main
# ----------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Update stock lists for KRX / NASDAQ / S&P500")
    parser.add_argument("--out-dir", type=str, default=".", help="Output directory for CSV files")
    parser.add_argument("--limit-krx", type=int, default=None, help="Limit number of KRX rows (debug)")
    parser.add_argument("--limit-nasdaq", type=int, default=None, help="Limit number of NASDAQ rows (debug)")
    parser.add_argument("--log-level", type=str, default="INFO", help="Logging level (DEBUG, INFO, WARNING, ERROR)")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    out_dir = ensure_out_dir(args.out_dir)
    session = build_session()

    # KRX
    krx_out = os.path.join(out_dir, "krx_stock_list.csv")
    logging.info("Updating KRX list...")
    ok_krx = update_krx_stocks(session, krx_out, limit=args.limit_krx)
    logging.info(f"KRX list {'OK' if ok_krx else 'FALLBACK'} -> {krx_out}")

    # NASDAQ
    nasdaq_out = os.path.join(out_dir, "nasdaq_stock_list.csv")
    logging.info("Updating NASDAQ list...")
    ok_nasdaq = update_nasdaq_stocks(session, nasdaq_out, limit=args.limit_nasdaq)
    logging.info(f"NASDAQ list {'OK' if ok_nasdaq else 'FALLBACK'} -> {nasdaq_out}")

    # S&P 500
    sp500_out = os.path.join(out_dir, "sp500_stock_list.csv")
    logging.info("Updating S&P 500 list...")
    ok_sp500 = update_sp500(session, sp500_out)
    logging.info(f"S&P 500 list {'OK' if ok_sp500 else 'FALLBACK'} -> {sp500_out}")

    # Summary
    success_count = sum([ok_krx, ok_nasdaq, ok_sp500])
    logging.info(f"Done. Success: {success_count}/3")
    return 0 if success_count >= 2 else 1


if __name__ == "__main__":
    sys.exit(main())
