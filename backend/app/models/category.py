import uuid
from sqlalchemy import Column, String, Boolean
from app.db.database import Base, GUID

class Category(Base):
    __tablename__ = "categories"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True)
    is_income = Column(Boolean, default=False)