"""
Create database tables for chat functionality
"""
import sys
sys.path.append('.')

from app.db.database import Base, engine
from app.models.chat import (
    RAGChatSession, RAGChatMessage,
    AvatarChatSession, AvatarChatMessage,
    DashboardChatSession, DashboardChatMessage
)

# Import other models to ensure they're registered
from app.models.transaction import Transaction
from app.models.goal import Goal
from app.models.category import Category
from app.models.recurring import RecurringExpense
from app.models.training_job import TrainingJob

if __name__ == "__main__":
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully!")
