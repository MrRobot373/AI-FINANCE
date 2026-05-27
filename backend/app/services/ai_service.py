import ollama
import os
import json
from sqlalchemy.orm import Session
from app.models.transaction import Transaction
from app.models.goal import Goal
from app.models.recurring import RecurringExpense
from app.models.category import Category

class AIService:
    def __init__(self):
        self.model = os.getenv("OLLAMA_MODEL", "gemma3:4b")

    def build_context(self, db: Session, section: str = "dashboard") -> str:
        # Avatar section uses a voice-friendly prompt (no markdown, no emoji)
        if section.lower() == "avatar":
            return self._build_avatar_context(db)

        # Only build financial context for Dashboard section
        if section.lower() not in ["dashboard"]:
            return "You are a helpful AI assistant."

        # Fetch recent transactions (last 10)
        transactions = db.query(Transaction).order_by(Transaction.date.desc()).limit(10).all()
        tx_str = "\n".join([f"- {t.date.date()}: {t.description} ({t.amount})" for t in transactions])

        # Fetch goals
        goals = db.query(Goal).all()
        goals_str = "\n".join([f"- {g.name}: {g.current_amount}/{g.target_amount} (Due: {g.deadline})" for g in goals])

        # Fetch recurring
        recurring = db.query(RecurringExpense).all()
        rec_str = "\n".join([f"- {r.name}: {r.amount} ({r.frequency})" for r in recurring])

        # Fetch categories
        categories = db.query(Category).all()
        cat_str = "\n".join([f"- '{c.name}' (ID: {c.id})" for c in categories])

        context = f"""
You are a fast and helpful financial assistant for an INDIAN user. Currency is always INR (₹).

Recent Transactions:
{tx_str}

Financial Goals:
{goals_str}

Recurring Expenses:
{rec_str}

Available Categories:
{cat_str}

INSTRUCTIONS:
1. BE PROACTIVE: When user says something like "add expense food 100" or "spent 100 on food", just DO IT immediately.
2. DO NOT ask unnecessary questions. If user gives amount and category, act immediately.
3. For simple commands, infer missing details intelligently:
   - "add food 100" -> amount=100, description="food", find category with name containing "food"
   - "spent 500 on groceries" -> amount=-500, description="groceries", find matching category
   - "add expense chai 50" -> amount=-50, description="chai", use food category

4. ONLY ask questions if critical info is truly missing (like amount or description).

5. When executing an action, output JSON wrapped in markdown code blocks:

For adding expense/transaction:
```json
{{
  "action": "add_transaction",
  "data": {{
    "amount": -100,
    "description": "food",
    "category_id": "USE_ACTUAL_UUID_FROM_CATEGORIES"
  }}
}}
```

For adding income:
```json
{{
  "action": "add_transaction", 
  "data": {{
    "amount": 5000,
    "description": "salary",
    "category_id": "USE_ACTUAL_UUID_FROM_CATEGORIES"
  }}
}}
```

For creating goals:
```json
{{
  "action": "create_goal",
  "data": {{
    "name": "Vacation",
    "target_amount": 50000
  }}
}}
```

IMPORTANT RULES:
- Expenses are NEGATIVE amounts, Income is POSITIVE
- ALWAYS use actual UUID from Available Categories list
- If category name contains what user said (food, transport, etc), use that ID
- Respond naturally but take action immediately when possible
- DO NOT output JSON for read-only queries (like "how much did I spend")
"""
        return context

    def _build_avatar_context(self, db: Session) -> str:
        """Build a voice-friendly system prompt for the Avatar section.
        No emojis, no markdown, no special characters - pure spoken English."""
        
        # Fetch financial data for context
        transactions = db.query(Transaction).order_by(Transaction.date.desc()).limit(5).all()
        tx_str = "\n".join([f"On {t.date.date()}, {t.description} for {t.amount} rupees" for t in transactions])

        goals = db.query(Goal).all()
        goals_str = "\n".join([f"{g.name}: saved {g.current_amount} out of {g.target_amount} rupees" for g in goals])

        context = f"""You are FinWise, a friendly and professional banking and personal finance assistant speaking to an Indian user.

CRITICAL RULES FOR YOUR RESPONSES:
- You are speaking out loud through a voice interface. Your response will be converted to speech.
- Stay focused on banking and finance. Help with bank accounts, cards, loans, budgeting, expenses, savings, investments, insurance, taxes, financial goals, and market questions.
- If the user asks for something unrelated to banking or finance, answer briefly and guide them back to money matters.
- Do not promise guaranteed returns or give unsafe financial advice. For high risk decisions, suggest verifying details or speaking with a qualified advisor.
- NEVER use emojis of any kind.
- NEVER use markdown formatting like hash symbols, asterisks, backticks, or bullet points.
- NEVER use special characters or symbols.
- Write all numbers in words. For example, say "five thousand rupees" instead of "5000" or "Rs. 5000".
- Keep sentences short and natural, as if you are having a face-to-face conversation.
- Use a warm, confident tone. Be concise. Two to four sentences per response is ideal.
- Currency is always Indian Rupees. Say "rupees" not "INR" or the rupee symbol.
- Do not list items with dashes or numbers. Instead, weave information naturally into sentences.

Recent transactions:
{tx_str if tx_str else "No recent transactions."}

Financial goals:
{goals_str if goals_str else "No active goals."}

Remember: Respond as if you are speaking directly to someone. Short, natural, clear sentences only."""
        return context

    def generate_stream(self, prompt: str, db: Session, section: str = "dashboard", history: list = []):
        if section.lower() == "rag":
            # Use RagService for RAG section
            from app.services.rag_service import RagService
            rag_service = RagService()
            response = rag_service.process_chat_query(prompt, history=history)
            # Simulate streaming for the frontend
            import time
            for word in response.split(" "):
                yield word + " "
                time.sleep(0.01)
            return

        system_context = self.build_context(db, section)
        
        # Build messages list
        messages = [{'role': 'system', 'content': system_context}]
        
        # Add history
        for msg in history:
            role = 'user' if msg.role == 'user' else 'assistant'
            messages.append({'role': role, 'content': msg.content})
            
        # Add current user prompt
        messages.append({'role': 'user', 'content': prompt})
        
        stream = ollama.chat(
            model=self.model,
            messages=messages,
            stream=True,
        )

        for chunk in stream:
            yield chunk['message']['content']
