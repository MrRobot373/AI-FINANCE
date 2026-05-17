from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.db.database import get_db
from app.models.category import Category as CategoryModel
from app.schemas.category import Category, CategoryCreate, CategoryUpdate

router = APIRouter()

DEFAULT_CATEGORIES = [
    {"name": "Salary", "is_income": True},
    {"name": "Business", "is_income": True},
    {"name": "Freelance", "is_income": True},
    {"name": "Investments", "is_income": True},
    {"name": "Interest", "is_income": True},
    {"name": "Rental Income", "is_income": True},
    {"name": "Refunds", "is_income": True},
    {"name": "Other Income", "is_income": True},
    {"name": "Food & Dining", "is_income": False},
    {"name": "Groceries", "is_income": False},
    {"name": "Transportation", "is_income": False},
    {"name": "Shopping", "is_income": False},
    {"name": "Bills & Utilities", "is_income": False},
    {"name": "Rent", "is_income": False},
    {"name": "Healthcare", "is_income": False},
    {"name": "Entertainment", "is_income": False},
    {"name": "Education", "is_income": False},
    {"name": "Travel", "is_income": False},
    {"name": "Insurance", "is_income": False},
    {"name": "Taxes", "is_income": False},
    {"name": "Subscriptions", "is_income": False},
    {"name": "Goals", "is_income": False},
    {"name": "Recurring", "is_income": False},
    {"name": "Miscellaneous", "is_income": False},
]

def ensure_default_categories(db: Session):
    existing = {
        category.name.lower(): category
        for category in db.query(CategoryModel).all()
    }
    changed = False

    for data in DEFAULT_CATEGORIES:
        if data["name"].lower() not in existing:
            db.add(CategoryModel(**data))
            changed = True

    if changed:
        db.commit()

@router.post("/", response_model=Category, status_code=201)
def create_category(category: CategoryCreate, db: Session = Depends(get_db)):
    db_category = CategoryModel(**category.dict())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@router.get("/", response_model=List[Category])
def read_categories(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    ensure_default_categories(db)
    categories = (
        db.query(CategoryModel)
        .order_by(CategoryModel.is_income.desc(), CategoryModel.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return categories

@router.get("/{category_id}", response_model=Category)
def read_category(category_id: uuid.UUID, db: Session = Depends(get_db)):
    db_category = db.query(CategoryModel).filter(CategoryModel.id == category_id).first()
    if db_category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return db_category

@router.patch("/{category_id}", response_model=Category)
def update_category(category_id: uuid.UUID, category: CategoryUpdate, db: Session = Depends(get_db)):
    db_category = db.query(CategoryModel).filter(CategoryModel.id == category_id).first()
    if db_category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = category.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_category, key, value)
        
    db.commit()
    db.refresh(db_category)
    return db_category

@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: uuid.UUID, db: Session = Depends(get_db)):
    db_category = db.query(CategoryModel).filter(CategoryModel.id == category_id).first()
    if db_category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    
    db.delete(db_category)
    db.commit()
    return
