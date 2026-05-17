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

    def _resolve_market_symbol(self, query: str):
        q = self._normalize_query(query)
        symbols = {
            "dax": ("^GDAXI", "DAX Index", "EUR"),
            "nifty": ("^NSEI", "Nifty 50", "INR"),
            "nifty 50": ("^NSEI", "Nifty 50", "INR"),
            "sensex": ("^BSESN", "BSE Sensex", "INR"),
            "nasdaq": ("^IXIC", "NASDAQ Composite", "USD"),
            "s&p 500": ("^GSPC", "S&P 500", "USD"),
            "sp 500": ("^GSPC", "S&P 500", "USD"),
            "dow jones": ("^DJI", "Dow Jones Industrial Average", "USD"),
            "ftse": ("^FTSE", "FTSE 100", "GBP"),
            "nikkei": ("^N225", "Nikkei 225", "JPY"),
            "apple": ("AAPL", "Apple", "USD"),
            "microsoft": ("MSFT", "Microsoft", "USD"),
            "nvidia": ("NVDA", "NVIDIA", "USD"),
            "tesla": ("TSLA", "Tesla", "USD"),
            "google": ("GOOGL", "Alphabet", "USD"),
            "alphabet": ("GOOGL", "Alphabet", "USD"),
            "amazon": ("AMZN", "Amazon", "USD"),
            "meta": ("META", "Meta", "USD"),
        }
        for key, value in symbols.items():
            if re.search(rf"\b{re.escape(key)}\b", q):
                return value
        return None

    def _currency_prefix(self, currency: str):
        symbols = {"USD": "$", "INR": "Rs.", "EUR": "EUR ", "GBP": "GBP ", "JPY": "JPY "}
        return symbols.get((currency or "").upper(), f"{currency} " if currency else "")

    def _market_data_response(self, symbol: str, display_name: str = None, currency_hint: str = None):
        stock = yf.Ticker(symbol)
        current_price = None
        prev_close = None
        currency = currency_hint

        try:
            fast_info = stock.fast_info
            current_price = fast_info.get("last_price")
            prev_close = fast_info.get("previous_close")
            currency = fast_info.get("currency") or currency
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

    def yfinance_tool(self, query):
        try:
            resolved_symbol = self._resolve_market_symbol(query)
            if resolved_symbol:
                symbol, display_name, currency = resolved_symbol
                market_data = self._market_data_response(symbol, display_name, currency)
                if market_data:
                    return market_data

            # Step 1: Use AI to classify the query and extract tickers
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
                
                # Try NSE first, then BSE, then web search
                for exchange in ["NSE", "BOM"]:
                    result = self._google_finance_price(nse_ticker, exchange, "Rs.")
                    if "Could not" not in result:
                        return result
                
                # Last resort: web search
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
                    return f"Could not fetch stock data for {nse_ticker} at this time."

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
                current_price = stock.fast_info.get('last_price')
                prev_close = stock.fast_info.get('previous_close')
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
                # Last resort: try Google Finance scraping
                return self._google_finance_price(ticker, "NASDAQ", "$")

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

Search Results:
{context}

Question: {query}

Provide a concise, direct answer (2-3 sentences max) without mentioning sources:"""
            result = self.llm.invoke(prompt).strip()
            return result
        else:
            # No search results available - use LLM's own knowledge
            prompt = f"""Current date and time: {self._format_now()}.
Answer the following question using your own knowledge. Be helpful and concise.
If you genuinely don't know the answer, say so honestly and suggest how the user could find the information.

Question: {query}

Answer (2-3 sentences):"""
            result = self.llm.invoke(prompt).strip()
            return result

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
            
        # 2. Check if it's a real-time stock price question -> Use yfinance
        stock_keywords = ['price', 'prize', 'stock', 'share', 'quote', 'how much is']
        if any(keyword in query.lower() for keyword in stock_keywords):
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

        # 4. Web search only when explicitly requested or confirmed after permission prompt.
        if self._is_explicit_web_search(query):
            web_answer = self.web_search_full(self._clean_explicit_web_query(query))
            return web_answer + "\n\n*(Answer retrieved via Web Search)*"

        return self._web_permission_response(query)

