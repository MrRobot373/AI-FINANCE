import sys
sys.path.append('.')

from app.db.database import SessionLocal
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.goal import Goal
from app.models.recurring import RecurringExpense
from datetime import datetime, timedelta

db = SessionLocal()

# 1. Create Default Categories
categories_data = [
    {"name": "Salary", "is_income": True},
    {"name": "Food & Dining", "is_income": False},
    {"name": "Transportation", "is_income": False},
    {"name": "Shopping", "is_income": False},
    {"name": "Bills & Utilities", "is_income": False}
]
categories = []
for c_data in categories_data:
    existing_cat = db.query(Category).filter(Category.name == c_data["name"]).first()
    if existing_cat:
        categories.append(existing_cat)
    else:
        cat = Category(**c_data)
        db.add(cat)
        categories.append(cat)
db.commit()
for c in categories:
    db.refresh(c)

# 2. Add Transactions
income_cat = next(c for c in categories if c.is_income)
food_cat = next(c for c in categories if c.name == "Food & Dining")
transport_cat = next(c for c in categories if c.name == "Transportation")
shopping_cat = next(c for c in categories if c.name == "Shopping")

today = datetime.utcnow()

transactions = [
    Transaction(amount=85000, description="Monthly Salary", date=today - timedelta(days=5), category_id=income_cat.id),
    Transaction(amount=1200, description="Groceries at D-Mart", date=today - timedelta(days=2), category_id=food_cat.id),
    Transaction(amount=350, description="Uber to Office", date=today - timedelta(days=1), category_id=transport_cat.id),
    Transaction(amount=5500, description="New Shoes", date=today, category_id=shopping_cat.id),
    Transaction(amount=400, description="Zomato Dinner", date=today, category_id=food_cat.id)
]
db.add_all(transactions)

# 3. Add 2 Goals
goals = [
    Goal(name="Emergency Fund", target_amount=100000, current_amount=45000, deadline=today + timedelta(days=180)),
    Goal(name="Vacation to Goa", target_amount=50000, current_amount=10000, deadline=today + timedelta(days=90))
]
db.add_all(goals)

# 4. Add 2 Recurring Expenses
recurring = [
    RecurringExpense(name="Netflix Subscription", amount=499, frequency="Monthly", next_due_date=today + timedelta(days=10)),
    RecurringExpense(name="Gym Membership", amount=1500, frequency="Monthly", next_due_date=today + timedelta(days=5))
]
db.add_all(recurring)

db.commit()
db.close()

print("✅ Successfully seeded the database with mock data!")
