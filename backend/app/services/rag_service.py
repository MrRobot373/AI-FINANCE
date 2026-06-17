import os
import hashlib
import logging
import datetime
import base64
import re
import yfinance as yf
from zoneinfo import ZoneInfo
from langchain_ollama import OllamaEmbeddings, OllamaLLM
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.tools import DuckDuckGoSearchRun
import PyPDF2
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Put chroma DB in the backend directory so it persists properly relative to where FastAPI runs
CHROMA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "chroma_db")
WEB_SEARCH_MARKER = "WEB_SEARCH_QUERY"

try:
    LOCAL_TZ = ZoneInfo(os.getenv("APP_TIMEZONE", "Asia/Kolkata"))
except Exception:
    LOCAL_TZ = datetime.timezone(datetime.timedelta(hours=5, minutes=30), "IST")

class RagService:
    def __init__(self):
        self.chroma_path = CHROMA_PATH
        self.embeddings = OllamaEmbeddings(model="mxbai-embed-large")
        self.llm = OllamaLLM(model="gemma3:4b", temperature=0)
        self.search_tool = DuckDuckGoSearchRun()
        
    def get_vectorstore(self):
        logger.info("[LINK] Initializing vector store with Chroma")
        vectorstore = Chroma(persist_directory=self.chroma_path, embedding_function=self.embeddings)
        return vectorstore

    def extract_text_from_file(self, file_path, file_extension):
        text = ""
        if file_extension == '.pdf':
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        elif file_extension == '.txt':
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
        return text

    def ingest_document(self, text, file_name):
        logger.info(f"[UPLOAD] Starting document ingestion for {file_name}")
        vectorstore = self.get_vectorstore()
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        
        existing_docs = vectorstore.get()
        existing_metadatas = existing_docs['metadatas'] if existing_docs else []
        existing_hashes = {meta.get('file_hash'): meta.get('file_name', 'Unknown') for meta in existing_metadatas if meta}
        
        file_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        
        if file_hash in existing_hashes:
            logger.warning(f"[NEXT] Document '{file_name}' already exists in vector store, skipping")
            return {"status": "skipped", "reason": "duplicate", "file_name": file_name}
        
        chunks = splitter.split_text(text)
        all_chunks = []
        for j, chunk in enumerate(chunks):
            all_chunks.append(Document(page_content=chunk, metadata={"file_hash": file_hash, "file_name": file_name}))
            
        if all_chunks:
            # Note: simplified embedding process without Streamlit progress bars
            ids = [f"{doc.metadata['file_hash']}_{idx}" for idx, doc in enumerate(all_chunks)]
            vectorstore.add_documents(all_chunks, ids=ids)
            return {"status": "success", "file_name": file_name, "chunks": len(all_chunks)}
            
        return {"status": "error", "reason": "no chunks extracted"}

    def get_stored_files(self):
        try:
            vectorstore = self.get_vectorstore()
            docs_data = vectorstore.get()
            
            if not docs_data or not docs_data.get('metadatas'):
                return []
            
            file_names = {}
            for meta in docs_data.get('metadatas', []):
                if meta is None:
                    continue
                file_name = meta.get('file_name', 'Unknown')
                file_hash = meta.get('file_hash', '')
                if file_name and file_hash not in file_names:
                    file_names[file_hash] = file_name
            
            return sorted(list(file_names.values()))
        except Exception as e:
            logger.error(f"[ERROR] Error retrieving stored files: {str(e)}")
            return []

    def delete_embedding_by_file_name(self, file_name: str):
        try:
            vectorstore = self.get_vectorstore()
            docs_before = vectorstore.get()
            
            if not docs_before or not docs_before.get('metadatas'):
                return False
                
            ids_to_delete = []
            for idx, meta in enumerate(docs_before.get('metadatas', [])):
                if meta and meta.get('file_name') == file_name:
                    ids_to_delete.append(docs_before['ids'][idx])
            
            if ids_to_delete:
                vectorstore.delete(ids=ids_to_delete)
                return True
            return False
        except Exception as e:
            logger.error(f"[ERROR] Error deleting embeddings for {file_name}: {str(e)}")
            return False

    def retrieve_context(self, query: str):
        vectorstore = self.get_vectorstore()
        retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
        docs = retriever.invoke(query)
        if not docs:
            return ""
        context = "\n\n".join([d.page_content for d in docs])
        return context

    def _now(self):
        return datetime.datetime.now(LOCAL_TZ)

    def _format_now(self):
        return self._now().strftime("%B %d, %Y, %I:%M %p %Z")

    def _normalize_query(self, query: str):
        return re.sub(r"\s+", " ", query.lower()).strip()

    def _is_greeting_query(self, query: str):
        cleaned = re.sub(r"[^a-z\s]", "", query.lower()).strip()
        greeting_phrases = {
            "hi", "hii", "hello", "hey", "hey there", "good morning",
            "good afternoon", "good evening", "namaste"
        }
        return cleaned in greeting_phrases

    def _is_date_time_query(self, query: str):
        q = self._normalize_query(query)
        has_today = any(term in q for term in ["today", "todays", "today's", "current"])
        asks_date = "date" in q or "day is it" in q
        asks_time = "time" in q or "clock" in q
        return (has_today and (asks_date or asks_time)) or q in {"date", "time", "today date", "todays date"}

    def _date_time_response(self, query: str):
        now = self._now()
        q = self._normalize_query(query)
        if "time" in q or "clock" in q:
            return f"The current date and time is {now.strftime('%B %d, %Y, %I:%M %p %Z')}."
        return f"Today's date is {now.strftime('%B %d, %Y')}."

    def _is_affirmative(self, query: str):
        q = self._normalize_query(query)
        return q in {"yes", "y", "yeah", "yep", "sure", "ok", "okay", "please do", "go ahead", "search", "search it", "do it"}

    def _is_negative(self, query: str):
        q = self._normalize_query(query)
        return q in {"no", "n", "nope", "not now", "dont", "don't", "cancel"}

    def _encode_web_query(self, query: str):
        encoded = base64.b64encode(query.encode("utf-8")).decode("ascii")
        return f"<!--{WEB_SEARCH_MARKER}:{encoded}-->"

    def _pending_web_query_from_history(self, history):
        for msg in reversed(history or []):
            if getattr(msg, "role", "") != "assistant":
                continue
            content = getattr(msg, "content", "") or ""
            match = re.search(rf"<!--{WEB_SEARCH_MARKER}:([A-Za-z0-9+/=]+)-->", content)
            if not match:
                continue
            try:
                return base64.b64decode(match.group(1)).decode("utf-8")
            except Exception:
                return None
        return None

    def _web_permission_response(self, query: str):
        marker = self._encode_web_query(query)
        return (
            "I could not find that in the uploaded knowledge base. "
            "Do you want me to search the web for current information? "
            "Reply yes to search the web."
            f"{marker}"
        )

    def _is_explicit_web_search(self, query: str):
        q = self._normalize_query(query)
        return any(phrase in q for phrase in [
            "search the web", "web search", "look up online", "browse", "internet search"
        ])

    def _clean_explicit_web_query(self, query: str):
        cleaned = re.sub(r"\b(search the web|web search|look up online|browse|internet search)\b", "", query, flags=re.I)
        return cleaned.strip(" :,-") or query

    def _is_stock_followup(self, query: str, history):
        """A short follow-up (e.g. 'what about reliance', 'and tata motors', or just
        a company name) right after a stock/market answer should stay in stock mode."""
        if not history:
            return False
        q = self._normalize_query(query)
        looks_like_followup = (
            bool(re.match(r"^(what|how)\s+about\b", q))
            or bool(re.match(r"^(and|also|then)\b", q))
            or len(q.split()) <= 3
        )
        if not looks_like_followup:
            return False

        stock_markers = ("market data", "yahoo finance", "stock data", "current price")
        user_stock_words = ("price", "prize", "stock", "share", "quote")
        for msg in reversed(list(history)[-4:]):
            role = getattr(msg, "role", "")
            content = (getattr(msg, "content", "") or "").lower()
            if role == "assistant" and any(marker in content for marker in stock_markers):
                return True
            if role == "user" and any(word in content for word in user_stock_words):
                return True
        return False

    def _detect_target_currency(self, query: str):
        """Detect a target currency the user wants a price shown in."""
        q = self._normalize_query(query)
        mapping = {
            "INR": ["rupee", "rupees", "inr", "rs", "₹"],
            "USD": ["dollar", "dollars", "usd"],
            "EUR": ["euro", "euros", "eur"],
            "GBP": ["pound", "pounds", "gbp"],
            "JPY": ["yen", "jpy"],
        }
        for currency, words in mapping.items():
            if any(re.search(rf"\b{re.escape(w)}\b", q) for w in words):
                return currency
        return None

    def _last_stock_symbol_from_history(self, history):
        """Pull the ticker (e.g. NVDA, RELIANCE.NS) from the most recent market-data
        answer, so a follow-up like 'in rupees' knows which stock we mean."""
        if not history:
            return None
        for msg in reversed(list(history)):
            if getattr(msg, "role", "") != "assistant":
                continue
            content = getattr(msg, "content", "") or ""
            if not any(m in content.lower() for m in ("market data", "stock data", "yahoo finance")):
                continue
            match = re.search(r"\(([A-Z0-9][A-Z0-9.\-\^&]{0,14})\)", content)
            if match:
                return match.group(1)
        return None

    def _resolve_market_symbol(self, query: str):
        q = self._normalize_query(query)
        symbols = {
            # --- Indices ---
            "dax": ("^GDAXI", "DAX Index", "EUR"),
            "bank nifty": ("^NSEBANK", "Nifty Bank", "INR"),
            "nifty 50": ("^NSEI", "Nifty 50", "INR"),
            "nifty": ("^NSEI", "Nifty 50", "INR"),
            "sensex": ("^BSESN", "BSE Sensex", "INR"),
            "nasdaq": ("^IXIC", "NASDAQ Composite", "USD"),
            "s&p 500": ("^GSPC", "S&P 500", "USD"),
            "sp 500": ("^GSPC", "S&P 500", "USD"),
            "dow jones": ("^DJI", "Dow Jones Industrial Average", "USD"),
            "ftse": ("^FTSE", "FTSE 100", "GBP"),
            "nikkei": ("^N225", "Nikkei 225", "JPY"),
            # --- US / global stocks ---
            "apple": ("AAPL", "Apple", "USD"),
            "microsoft": ("MSFT", "Microsoft", "USD"),
            "nvidia": ("NVDA", "NVIDIA", "USD"),
            "tesla": ("TSLA", "Tesla", "USD"),
            "alphabet": ("GOOGL", "Alphabet", "USD"),
            "google": ("GOOGL", "Alphabet", "USD"),
            "amazon": ("AMZN", "Amazon", "USD"),
            "meta": ("META", "Meta", "USD"),
            "netflix": ("NFLX", "Netflix", "USD"),
            "amd": ("AMD", "AMD", "USD"),
            "intel": ("INTC", "Intel", "USD"),
            # --- Indian (NSE) stocks: use the .NS suffix so Yahoo Finance returns
            #     accurate live prices, exactly like the US tickers above. ---
            "reliance industries": ("RELIANCE.NS", "Reliance Industries", "INR"),
            "reliance": ("RELIANCE.NS", "Reliance Industries", "INR"),
            "tata consultancy": ("TCS.NS", "Tata Consultancy Services", "INR"),
            "tcs": ("TCS.NS", "Tata Consultancy Services", "INR"),
            "infosys": ("INFY.NS", "Infosys", "INR"),
            "hdfc bank": ("HDFCBANK.NS", "HDFC Bank", "INR"),
            "hdfc": ("HDFCBANK.NS", "HDFC Bank", "INR"),
            "icici bank": ("ICICIBANK.NS", "ICICI Bank", "INR"),
            "icici": ("ICICIBANK.NS", "ICICI Bank", "INR"),
            "state bank": ("SBIN.NS", "State Bank of India", "INR"),
            "sbi": ("SBIN.NS", "State Bank of India", "INR"),
            "wipro": ("WIPRO.NS", "Wipro", "INR"),
            "itc": ("ITC.NS", "ITC", "INR"),
            "bajaj finance": ("BAJFINANCE.NS", "Bajaj Finance", "INR"),
            "bajaj finserv": ("BAJAJFINSV.NS", "Bajaj Finserv", "INR"),
            "bharti airtel": ("BHARTIARTL.NS", "Bharti Airtel", "INR"),
            "airtel": ("BHARTIARTL.NS", "Bharti Airtel", "INR"),
            "larsen": ("LT.NS", "Larsen & Toubro", "INR"),
            "l&t": ("LT.NS", "Larsen & Toubro", "INR"),
            "maruti": ("MARUTI.NS", "Maruti Suzuki", "INR"),
            "axis bank": ("AXISBANK.NS", "Axis Bank", "INR"),
            "kotak bank": ("KOTAKBANK.NS", "Kotak Mahindra Bank", "INR"),
            "kotak": ("KOTAKBANK.NS", "Kotak Mahindra Bank", "INR"),
            "hcl tech": ("HCLTECH.NS", "HCL Technologies", "INR"),
            "hcl": ("HCLTECH.NS", "HCL Technologies", "INR"),
            "tata motors": ("TATAMOTORS.NS", "Tata Motors", "INR"),
            "tata steel": ("TATASTEEL.NS", "Tata Steel", "INR"),
            "tata power": ("TATAPOWER.NS", "Tata Power", "INR"),
            "sun pharma": ("SUNPHARMA.NS", "Sun Pharma", "INR"),
            "adani enterprises": ("ADANIENT.NS", "Adani Enterprises", "INR"),
            "adani ports": ("ADANIPORTS.NS", "Adani Ports", "INR"),
            "ongc": ("ONGC.NS", "ONGC", "INR"),
            "ntpc": ("NTPC.NS", "NTPC", "INR"),
            "power grid": ("POWERGRID.NS", "Power Grid", "INR"),
            "titan": ("TITAN.NS", "Titan", "INR"),
            "nestle india": ("NESTLEIND.NS", "Nestle India", "INR"),
            "asian paints": ("ASIANPAINT.NS", "Asian Paints", "INR"),
            "ultratech": ("ULTRACEMCO.NS", "UltraTech Cement", "INR"),
            "jsw steel": ("JSWSTEEL.NS", "JSW Steel", "INR"),
            "coal india": ("COALINDIA.NS", "Coal India", "INR"),
            "paytm": ("PAYTM.NS", "Paytm", "INR"),
            "zomato": ("ZOMATO.NS", "Zomato", "INR"),
        }
        # Match longer keys first so "hdfc bank" wins over "hdfc", etc.
        for key in sorted(symbols, key=len, reverse=True):
            if re.search(rf"\b{re.escape(key)}\b", q):
                return symbols[key]
        return None

    _COMPANY_QUERY_STOPWORDS = {
        "what", "whats", "what's", "about", "is", "the", "of", "how", "much",
        "tell", "me", "give", "and", "also", "then", "price", "prize", "stock",
        "stocks", "share", "shares", "quote", "current", "today", "todays",
        "today's", "value", "rate", "market", "live", "for", "show", "get",
        "a", "an", "to", "in", "on", "do", "does", "doing", "right", "now",
    }

    def _clean_company_query(self, query: str):
        """Strip finance filler words so a name like 'what is the share price of
        adani green today' becomes 'adani green' for symbol search."""
        q = self._normalize_query(query)
        q = re.sub(r"[^a-z0-9&.\s]", " ", q)
        tokens = [t for t in q.split() if t and t not in self._COMPANY_QUERY_STOPWORDS]
        cleaned = " ".join(tokens).strip()
        return cleaned or q.strip()

    def _yahoo_symbol_search(self, query: str):
        """Resolve a company/index name to its real ticker via Yahoo Finance's
        symbol search. Authoritative (no LLM guessing, no hardcoded list) and
        covers essentially every listed company. India-focused: prefers NSE
        (.NS) then BSE (.BO) listings, else the top-ranked match."""
        term = self._clean_company_query(query)
        if not term or len(term) < 2:
            return None
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json",
            }
            resp = requests.get(
                "https://query2.finance.yahoo.com/v1/finance/search",
                params={"q": term, "quotesCount": 8, "newsCount": 0, "listsCount": 0},
                headers=headers,
                timeout=8,
            )
            if resp.status_code != 200:
                return None
            quotes = (resp.json() or {}).get("quotes", []) or []
        except Exception:
            logger.warning("Yahoo symbol search failed for %r", query, exc_info=True)
            return None

        wanted_types = {"EQUITY", "INDEX", "ETF", "MUTUALFUND", "CRYPTOCURRENCY", "CURRENCY"}
        candidates = [q for q in quotes if q.get("symbol") and q.get("quoteType") in wanted_types]
        if not candidates:
            return None

        def priority(item):
            sym = item.get("symbol", "")
            if sym.endswith(".NS"):
                return 0  # NSE (India) primary
            if sym.endswith(".BO"):
                return 1  # BSE (India)
            if "." not in sym:
                return 2  # plain US/global primary ticker (NVDA, AAPL, PLTR)
            return 3      # obscure foreign cross-listings (.SA, .DE, .MX, ...) last

        best = min(candidates, key=priority)
        symbol = best["symbol"]
        name = best.get("shortname") or best.get("longname") or symbol
        return (symbol, name, None)

    def _currency_prefix(self, currency: str):
        symbols = {"USD": "$", "INR": "Rs.", "EUR": "EUR ", "GBP": "GBP ", "JPY": "JPY "}
        return symbols.get((currency or "").upper(), f"{currency} " if currency else "")

    def _fx_rate(self, base: str, quote: str):
        """Live exchange rate for 1 base -> quote via Yahoo (e.g. USDINR=X)."""
        base = (base or "").upper()
        quote = (quote or "").upper()
        if not base or not quote:
            return None
        if base == quote:
            return 1.0
        pair = yf.Ticker(f"{base}{quote}=X")
        try:
            rate = getattr(pair.fast_info, 'last_price', None)
            if rate:
                return float(rate)
        except Exception:
            pass
        try:
            hist = pair.history(period="5d")
            if not hist.empty:
                return float(hist["Close"].iloc[-1])
        except Exception:
            pass
        return None

    def _market_data_response(self, symbol: str, display_name: str = None, currency_hint: str = None,
                              target_currency: str = None):
        stock = yf.Ticker(symbol)
        current_price = None
        prev_close = None
        currency = currency_hint

        try:
            fast_info = stock.fast_info
            current_price = getattr(fast_info, 'last_price', None)
            prev_close = getattr(fast_info, 'previous_close', None)
            currency = getattr(fast_info, 'currency', None) or currency
        except Exception:
            pass

        if current_price is None:
            try:
                hist = stock.history(period="5d")
                if not hist.empty:
                    current_price = float(hist["Close"].iloc[-1])
                    if len(hist) > 1:
                        prev_close = float(hist["Close"].iloc[-2])
            except Exception:
                pass

        if current_price is None:
            return ""

        try:
            info = stock.get_info()
            display_name = display_name or info.get("shortName") or info.get("longName") or symbol
            currency = currency or info.get("currency")
        except Exception:
            display_name = display_name or symbol

        # Optional currency conversion (e.g. show a USD stock "in indian rupees").
        conversion_note = ""
        if target_currency and currency and target_currency.upper() != (currency or "").upper():
            rate = self._fx_rate(currency, target_currency)
            if rate:
                current_price *= rate
                if prev_close:
                    prev_close *= rate
                conversion_note = (
                    f"\n*Converted from {currency.upper()} at 1 {currency.upper()} = "
                    f"{rate:,.4f} {target_currency.upper()}.*"
                )
                currency = target_currency.upper()
            # If the rate lookup fails, fall back to the native currency silently.

        change_line = ""
        if prev_close:
            change = current_price - prev_close
            change_pct = (change / prev_close) * 100
            direction = "up" if change >= 0 else "down"
            change_line = f"\n**Change:** {direction} {change:+,.2f} ({change_pct:+.2f}%)"

        prefix = self._currency_prefix(currency)
        prev_close_line = f"\n**Previous Close:** {prefix}{prev_close:,.2f}" if prev_close else ""

        return (
            f"**{display_name} ({symbol}) - Market Data**\n\n"
            f"**Current Price:** {prefix}{current_price:,.2f}"
            f"{change_line}"
            f"{prev_close_line}\n"
            f"**As of:** {self._format_now()}\n\n"
            "*(Data retrieved from Yahoo Finance)*"
            f"{conversion_note}"
        ).strip()

    # --- TOOLS ---
    
    def finance_advisor_tool(self, query, context_docs=""):
        today = datetime.datetime.now().strftime('%B %d, %Y')
        prompt = f"""
        You are a Certified Senior Financial Advisor. Provide balanced, risk-aware guidance.
        
        Current Date: {today}
        User Query: {query}
        Local Document Context: {context_docs}
        
        Guidelines:
        1. Tone: Professional and objective.
        2. Risk Disclosure: Always state "Investing involves risk" when discussing markets.
        3. Actionable Advice: Provide clear strategic steps based on context.
        
        Structure: Analysis -> Strategic Advice -> Risk Considerations.
        """
        result = self.llm.invoke(prompt).strip()
        return result

    def yfinance_tool(self, query, allow_web_fallback=True):
        try:
            # 1. Fast path: hardcoded map of common names (instant, exact ticker).
            resolved_symbol = self._resolve_market_symbol(query)
            if resolved_symbol:
                symbol, display_name, currency = resolved_symbol
                market_data = self._market_data_response(symbol, display_name, currency)
                if market_data:
                    return market_data

            # 2. General resolver: Yahoo Finance symbol search (authoritative ticker
            #    lookup for ANY company, no LLM guessing, no hardcoded list).
            searched = self._yahoo_symbol_search(query)
            if searched:
                symbol, display_name, currency = searched
                market_data = self._market_data_response(symbol, display_name, currency)
                if market_data:
                    return market_data

            # For a soft catch-all (no explicit stock keyword in the query), stop
            # here rather than fall into less reliable LLM guessing / scraping.
            if not allow_web_fallback:
                return ""

            # 3. Last resort for explicit stock queries: AI ticker extraction.
            prompt = f"""Analyze this stock query and respond with EXACTLY one of these formats:
- If it's about an INDIAN company, respond: INDIAN:<NSE_TICKER>
  Common examples: Tata Motors=TATAMOTORS, Reliance Industries=RELIANCE, Infosys=INFY, TCS=TCS, HDFC Bank=HDFCBANK, SBI=SBIN, Wipro=WIPRO, Bajaj Finance=BAJFINANCE, ITC=ITC, Zomato=ZOMATO, ICICI Bank=ICICIBANK, Kotak Bank=KOTAKBANK, Maruti=MARUTI, L&T=LT, Axis Bank=AXISBANK, HCL Tech=HCLTECH
- If it's about a US/global company, respond: US:<TICKER>
  Common examples: Nvidia=NVDA, Apple=AAPL, Microsoft=MSFT, Google/Alphabet=GOOGL, Tesla=TSLA, Amazon=AMZN, Meta=META
- If no company is mentioned, respond: NONE

Respond with ONLY one line. No explanation.

Query: "{query}"

Answer:"""
            ai_response = self.llm.invoke(prompt).strip().upper()
            logger.info(f"[STOCK] AI ticker extraction response: {ai_response}")

            # Clean up
            ai_response = ai_response.split('\n')[0].strip()

            if "NONE" in ai_response:
                return ""

            # Step 2a: Indian stock -> Scrape Google Finance for live price
            if ai_response.startswith("INDIAN"):
                nse_ticker = ai_response.replace("INDIAN:", "").replace("INDIAN", "").strip()
                nse_ticker = ''.join(c for c in nse_ticker if c.isalnum() or c == '&')
                if not nse_ticker:
                    nse_ticker = query.strip().upper()

                # Try Yahoo Finance first (reliable): NSE (.NS) then BSE (.BO).
                for suffix in (".NS", ".BO"):
                    market_data = self._market_data_response(f"{nse_ticker}{suffix}", currency_hint="INR")
                    if market_data:
                        return market_data

                # Then Google Finance scraping as a secondary source.
                for exchange in ["NSE", "BOM"]:
                    result = self._google_finance_price(nse_ticker, exchange, "Rs.")
                    if "Could not" not in result:
                        return result

                # Last resort: a price-focused web search (only when explicitly a
                # stock query; for a soft catch-all we return "" so the caller can
                # fall through gracefully instead of surfacing a weak answer).
                if not allow_web_fallback:
                    return ""
                try:
                    search_data = self.search_tool.run(f"{nse_ticker} current stock share price today NSE BSE INR")
                    context = search_data if search_data else "No results found."
                    prompt = f"""Extract the current stock price for {nse_ticker} from these results.
Format: **{nse_ticker} - Live Stock Data (NSE/BSE)** then **Current Price:** Rs.[price]
Search Results: {context}
Response:"""
                    result = self.llm.invoke(prompt).strip()
                    return result + "\n\n*(Data retrieved via Web Search)*"
                except Exception:
                    return ""

            # Step 2b: US/global stock -> Use yfinance
            raw_ticker = ai_response.replace("US:", "").strip()
            ticker = ''.join(c for c in raw_ticker if c.isalnum() or c == '.')
            if not ticker:
                return ""

            stock = yf.Ticker(ticker)

            # Try fast_info first
            current_price = None
            prev_close = None
            try:
                current_price = getattr(stock.fast_info, 'last_price', None)
                prev_close = getattr(stock.fast_info, 'previous_close', None)
            except Exception:
                pass

            # Fallback to history() if fast_info fails
            if current_price is None:
                try:
                    hist = stock.history(period='5d')
                    if not hist.empty:
                        current_price = float(hist['Close'].iloc[-1])
                        if len(hist) > 1:
                            prev_close = float(hist['Close'].iloc[-2])
                except Exception:
                    pass

            if current_price is None:
                # Last resort: try Google Finance scraping; return "" if that fails
                # too, so the caller can fall through cleanly.
                gf = self._google_finance_price(ticker, "NASDAQ", "$")
                return gf if "Could not" not in gf else ""

            if prev_close:
                change = current_price - prev_close
                change_pct = (change / prev_close) * 100
                direction = "(UP)" if change >= 0 else "(DOWN)"
            else:
                change = 0
                change_pct = 0
                direction = ""

            prev_close_display = f"${prev_close:.2f}" if prev_close else "N/A"

            result = f"""**{ticker} - Real-time Stock Data**

**Current Price:** ${current_price:.2f} {direction} ({change:+.2f}, {change_pct:+.2f}%)
**Previous Close:** {prev_close_display}
**As of:** {self._format_now()}

*(Data retrieved from Yahoo Finance)*"""
            return result.strip()
        except Exception as e:
            logger.error(f"[ERROR] yfinance_tool failed: {str(e)}")
            return ""

    def _google_finance_price(self, ticker, exchange, currency_symbol):
        """Scrape Google Finance for real-time stock price data."""
        try:
            url = f"https://www.google.com/finance/quote/{ticker}:{exchange}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                return f"Could not fetch data for {ticker} on {exchange}."
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract current price - use specific class 'YMlKec fxKbKc' for the main stock price
            price_el = soup.find('div', class_='YMlKec fxKbKc')
            if not price_el:
                # Fallback to broader class
                price_elements = soup.find_all('div', class_='YMlKec')
                price_el = price_elements[0] if price_elements else None
            
            if not price_el:
                return f"Could not find price data for {ticker} on {exchange}."
            
            # The main price element
            raw_price = price_el.text.strip()
            # Remove currency symbols for clean display
            clean_price = raw_price.replace('\u20b9', '').replace('$', '').strip()
            
            # Try to extract change info from page
            change_text = ""
            change_elements = soup.find_all('div', class_='JwB6zf')
            for el in change_elements:
                txt = el.text.strip()
                if txt:
                    # Remove special chars for Windows console safety
                    txt = txt.replace('\u20b9', 'Rs.').replace('$', '$')
                    change_text = txt
                    break

            # Build result
            result = f"""**{ticker} ({exchange}) - Real-time Stock Data**

**Current Price:** {currency_symbol}{clean_price}"""
            
            if change_text:
                result += f"\n**Change:** {change_text}"
            
            result += f"\n\n*(Data from Google Finance)*"
            return result
            
        except Exception as e:
            logger.error(f"[ERROR] Google Finance scraping failed for {ticker}: {str(e)}")
            # Fallback to web search
            try:
                search_data = self.search_tool.run(f"{ticker} {exchange} stock price today")
                context = search_data if search_data else "No results found."
                prompt = f"""Extract and present the current stock price for {ticker} from these search results.
Format: **{ticker} - Stock Data** followed by **Current Price:** {currency_symbol}[price]

Search Results: {context}

Response:"""
                result = self.llm.invoke(prompt).strip()
                return result + "\n\n*(Data retrieved via Web Search)*"
            except Exception:
                return f"Could not fetch stock data for {ticker} at this time."

    def _sanitize_web_answer(self, text: str):
        """Clean LLM web answers so they render properly: collapse markdown links
        like [label](url) to their label, drop raw URLs, and tidy leftovers."""
        if not text:
            return text
        # [label](url) -> label  (fixes the doubled ([url](url)) rendering)
        text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
        # Remove any remaining bare URLs, stopping at whitespace or closing
        # brackets so we don't swallow trailing punctuation like ')'.
        text = re.sub(r"https?://[^\s)\]]+", "", text)
        # Tidy empty brackets/parens and stray whitespace left behind.
        text = re.sub(r"\(\s*\)", "", text)
        text = re.sub(r"\[\s*\]", "", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r"\s+([.,;:])", r"\1", text)
        text = re.sub(r"\(\s*(?=[,.])", "", text)  # leftover "( ," style fragments
        return text.strip()

    def web_search_full(self, query):
        context = None

        # Try web search with retry
        for attempt in range(2):
            try:
                search_data = self.search_tool.run(f"{query}")
                if search_data and len(search_data.strip()) > 10:
                    context = search_data
                    break
            except Exception as e:
                logger.warning(f"[SEARCH] Web search attempt {attempt+1} failed: {str(e)}")
                continue

        if context:
            # We got search results - summarize them
            prompt = f"""Current date and time: {self._format_now()}.
Based on the following search results, provide a direct, concise answer to the question.
Be brief and to the point. Only include the most relevant information.
Write in plain prose only: do NOT include URLs, links, or markdown formatting.

Search Results:
{context}

Question: {query}

Provide a concise, direct answer (2-3 sentences max) without mentioning sources:"""
            result = self.llm.invoke(prompt).strip()
            return self._sanitize_web_answer(result)
        else:
            # No search results available - use LLM's own knowledge
            prompt = f"""Current date and time: {self._format_now()}.
Answer the following question using your own knowledge. Be helpful and concise.
Write in plain prose only: do NOT include URLs, links, or markdown formatting.
If you genuinely don't know the answer, say so honestly and suggest how the user could find the information.

Question: {query}

Answer (2-3 sentences):"""
            result = self.llm.invoke(prompt).strip()
            return self._sanitize_web_answer(result)

    # --- ROUTING ENGINE ---

    def process_chat_query(self, query: str, history=None):
        """
        Main entry point for handling a RAG chat query.
        Implements tool routing logic.
        """
        query = (query or "").strip()

        pending_web_query = self._pending_web_query_from_history(history)
        if pending_web_query:
            if self._is_affirmative(query):
                web_answer = self.web_search_full(pending_web_query)
                return web_answer + "\n\n*(Answer retrieved via Web Search)*"
            if self._is_negative(query):
                return "No problem. I will stay within the uploaded knowledge base unless you ask me to search the web."

        if self._is_greeting_query(query):
            return "Hi, I am FinWise. Ask me about your uploaded finance knowledge, market data, or your tracker."

        if self._is_date_time_query(query):
            return self._date_time_response(query)

        # 1. Check if it's a financial advice question -> Use finance advisor + vector DB context
        if any(keyword in query.lower() for keyword in ['advice', 'recommend', 'should i invest', 'portfolio']):
            context = self.retrieve_context(query)
            return self.finance_advisor_tool(query, context)
            
        # 1c. Currency-conversion intent for a stock, e.g. "nvidia price in inr" or a
        # follow-up "in indian rupees" after a stock answer. Resolve the subject from
        # the current query, else from the previous market-data turn, then convert.
        target_currency = self._detect_target_currency(query)
        if target_currency:
            named = self._resolve_market_symbol(query)
            conv_symbol = named[0] if named else None
            conv_name = named[1] if named else None
            if not conv_symbol and len(self._normalize_query(query).split()) <= 4:
                conv_symbol = self._last_stock_symbol_from_history(history)
            if conv_symbol:
                converted = self._market_data_response(
                    conv_symbol, conv_name, target_currency=target_currency
                )
                if converted:
                    return converted

        # 2. Check if it's a real-time stock price question -> Use yfinance
        stock_keywords = ['price', 'prize', 'stock', 'share', 'quote', 'how much is']
        is_stock_query = any(keyword in query.lower() for keyword in stock_keywords)
        # Also treat a recognized company/index name as a stock query even without a
        # price keyword (e.g. "reliance", "what about tcs"), and keep short follow-ups
        # after a stock answer in stock mode.
        if not is_stock_query and self._resolve_market_symbol(query):
            is_stock_query = True
        if not is_stock_query and self._is_stock_followup(query, history):
            is_stock_query = True
        if is_stock_query:
            yfinance_res = self.yfinance_tool(query)
            if yfinance_res:
                return yfinance_res

        # 3. Default: Try local RAG first
        context = self.retrieve_context(query)
        if context:
            prompt = f"Answer the question using ONLY the provided context. If the answer cannot be found in the context, respond with '__NOT_FOUND__'.\n\nContext:\n{context}\n\nQuestion: {query}\n\nAnswer:"
            doc_answer = self.llm.invoke(prompt).strip()

            if "__NOT_FOUND__" not in doc_answer:
                return doc_answer

        # 3b. Robust catch-all: not in the knowledge base and not caught by the
        # keyword/symbol checks above. Let the LLM ticker extractor decide if this
        # is actually a market query (covers ANY company, not just the listed ones).
        # It returns "" for non-stock queries, so we fall through harmlessly.
        if not is_stock_query:
            yfinance_res = self.yfinance_tool(query, allow_web_fallback=False)
            if yfinance_res:
                return yfinance_res

        # 4. Web search only when explicitly requested or confirmed after permission prompt.
        if self._is_explicit_web_search(query):
            web_answer = self.web_search_full(self._clean_explicit_web_query(query))
            return web_answer + "\n\n*(Answer retrieved via Web Search)*"

        return self._web_permission_response(query)

