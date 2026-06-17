import uuid
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.db.database import Base, GUID
import datetime

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    amount = Column(Float, nullable=False)
    description = Column(String(255), nullable=False)
    date = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    notes = Column(Text, nullable=True)
    receipt_url = Column(String, nullable=True)

    category_id = Column(GUID(), ForeignKey("categories.id"), nullable=False)
    category = relationship("Category")