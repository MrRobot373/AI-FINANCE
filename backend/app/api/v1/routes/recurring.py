from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid
from datetime import datetime, timedelta
import calendar

from app.db.database import get_db
from app.models.recurring import RecurringExpense as RecurringExpenseModel
from app.models.transaction import Transaction as TransactionModel
from app.models.category import Category as CategoryModel
from app.schemas.recurring import RecurringExpense, RecurringExpenseCreate, RecurringExpenseUpdate

router = APIRouter()

@router.post("/", response_model=RecurringExpense, status_code=201)
def create_recurring_expense(recurring: RecurringExpenseCreate, db: Session = Depends(get_db)):
    db_recurring = RecurringExpenseModel(**recurring.dict())
    db.add(db_recurring)
    db.commit()
    db.refresh(db_recurring)
    return db_recurring

@router.get("/", response_model=List[RecurringExpense])
def read_recurring_expenses(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    recurring_expenses = db.query(RecurringExpenseModel).offset(skip).limit(limit).all()
    return recurring_expenses

@router.get("/{recurring_id}", response_model=RecurringExpense)
def read_recurring_expense(recurring_id: str, db: Session = Depends(get_db)):
    db_recurring = db.query(RecurringExpenseModel).filter(RecurringExpenseModel.id == recurring_id).first()
    if db_recurring is None:
        raise HTTPException(status_code=404, detail="Recurring Expense not found")
    return db_recurring

@router.patch("/{recurring_id}", response_model=RecurringExpense)
def update_recurring_expense(recurring_id: str, recurring: RecurringExpenseUpdate, db: Session = Depends(get_db)):
    db_recurring = db.query(RecurringExpenseModel).filter(RecurringExpenseModel.id == recurring_id).first()
    if db_recurring is None:
        raise HTTPException(status_code=404, detail="Recurring Expense not found")
    
    update_data = recurring.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_recurring, key, value)
        
    db.commit()
    db.refresh(db_recurring)
    return db_recurring

@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_expense(recurring_id: str, db: Session = Depends(get_db)):
    db_recurring = db.query(RecurringExpenseModel).filter(RecurringExpenseModel.id == recurring_id).first()
    if db_recurring is None:
        raise HTTPException(status_code=404, detail="Recurring expense not found")
    db.delete(db_recurring)
    db.commit()
    return None

@router.post("/process")
def process_recurring_expenses(db: Session = Depends(get_db)):
    """
    Checks for recurring expenses that are due and creates transactions for them.
    Updates the next_due_date based on frequency.
    """
    today = datetime.now().date()
    due_expenses = db.query(RecurringExpenseModel).filter(RecurringExpenseModel.next_due_date <= today).all()

    # Resolve a category for auto-generated transactions
    recurring_category = db.query(CategoryModel).filter(CategoryModel.name == "Recurring").first()
    if not recurring_category:
        recurring_category = db.query(CategoryModel).filter(CategoryModel.name == "Miscellaneous").first()
    if not recurring_category:
        recurring_category = db.query(CategoryModel).filter(CategoryModel.is_income.is_(False)).first()

    processed_count = 0

    for expense in due_expenses:
        if not recurring_category:
            # Cannot create transaction without a valid category; skip safely
            continue

        new_transaction = TransactionModel(
            amount=-abs(expense.amount),
            description=f"Recurring: {expense.name}",
            date=datetime.now(),
            category_id=recurring_category.id,
            notes="Auto-generated from recurring expense"
        )
        db.add(new_transaction)

        # Update Next Due Date
        current_due = expense.next_due_date
        if expense.frequency == "Daily":
            expense.next_due_date = current_due + timedelta(days=1)
        elif expense.frequency == "Weekly":
            expense.next_due_date = current_due + timedelta(weeks=1)
        elif expense.frequency == "Monthly":
            next_month = current_due.month + 1 if current_due.month < 12 else 1
            next_year = current_due.year + 1 if current_due.month == 12 else current_due.year
            try:
                expense.next_due_date = current_due.replace(year=next_year, month=next_month)
            except ValueError:
                last_day = calendar.monthrange(next_year, next_month)[1]
                expense.next_due_date = current_due.replace(year=next_year, month=next_month, day=last_day)
        elif expense.frequency == "Yearly":
            expense.next_due_date = current_due.replace(year=current_due.year + 1)

        processed_count += 1

    db.commit()
    return {"message": f"Processed {processed_count} recurring expenses"}
