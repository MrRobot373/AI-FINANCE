from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
import uuid
import csv
import io

from app.db.database import get_db
from app.models.transaction import Transaction as TransactionModel
from app.schemas.transaction import Transaction, TransactionCreate, TransactionUpdate

router = APIRouter()

@router.post("/", response_model=Transaction, status_code=201)
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    # Convert amount from major to minor units (e.g., dollars to cents)
    # transaction.amount = int(transaction.amount * 100)
    db_transaction = TransactionModel(**transaction.dict())
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

@router.get("/", response_model=List[Transaction])
def read_transactions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    transactions = db.query(TransactionModel).order_by(desc(TransactionModel.date)).offset(skip).limit(limit).all()
    return transactions

@router.get("/{transaction_id}", response_model=Transaction)
def read_transaction(transaction_id: uuid.UUID, db: Session = Depends(get_db)):
    db_transaction = db.query(TransactionModel).filter(TransactionModel.id == transaction_id).first()
    if db_transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return db_transaction

@router.patch("/{transaction_id}", response_model=Transaction)
def update_transaction(transaction_id: uuid.UUID, transaction: TransactionUpdate, db: Session = Depends(get_db)):
    db_transaction = db.query(TransactionModel).filter(TransactionModel.id == transaction_id).first()
    if db_transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    update_data = transaction.dict(exclude_unset=True)
    # if 'amount' in update_data:
    #     update_data['amount'] = int(update_data['amount'] * 100)

    for key, value in update_data.items():
        setattr(db_transaction, key, value)
        
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: uuid.UUID, db: Session = Depends(get_db)):
    db_transaction = db.query(TransactionModel).filter(TransactionModel.id == transaction_id).first()
    if db_transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    db.delete(db_transaction)
    db.commit()
    return

@router.post("/bulk", status_code=201)
async def create_bulk_transactions(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if file.content_type != 'text/csv':
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV.")

    content = await file.read()
    stream = io.StringIO(content.decode("utf-8"))
    reader = csv.DictReader(stream)
    
    transactions_to_create = []
    for row in reader:
        # Basic validation and data transformation
        try:
            transaction_data = {
                "date": row["Date"],
                "amount": float(row["Amount"]),
                "description": row["Description"],
                "category_id": row["CategoryID"], # Assuming Category ID is in the CSV
            }
            transactions_to_create.append(TransactionModel(**transaction_data))
        except (KeyError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"CSV processing error: {e}")

    if not transactions_to_create:
        raise HTTPException(status_code=400, detail="CSV file is empty or malformed.")

    db.add_all(transactions_to_create)
    db.commit()
    
    return {"message": f"Successfully uploaded and created {len(transactions_to_create)} transactions."}

@router.post("/{transaction_id}/attach-receipt", response_model=Transaction)
async def attach_receipt(transaction_id: uuid.UUID, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_transaction = db.query(TransactionModel).filter(TransactionModel.id == transaction_id).first()
    if db_transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # In a real app, you'd save this to S3, GCS, etc. and get a URL.
    # For this local-only version, we'll simulate it by storing a "path".
    # This is NOT production-ready for file handling.
    file_location = f"uploads/receipts/{transaction_id}_{file.filename}"
    os.makedirs(os.path.dirname(file_location), exist_ok=True)
    with open(file_location, "wb+") as file_object:
        file_object.write(await file.read())

    db_transaction.receipt_url = f"/static/{file_location}" # Example URL
    db.commit()
    db.refresh(db_transaction)
    
    return db_transaction