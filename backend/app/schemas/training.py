from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"

class TrainingConfig(BaseModel):
    model_name: str = Field(default="gemma2:2b", description="Base model to fine-tune")
    epochs: int = Field(default=3, ge=1, le=100)
    batch_size: int = Field(default=4, ge=1, le=32)
    learning_rate: float = Field(default=0.0001, ge=0.00001, le=0.01)
    max_steps: Optional[int] = Field(default=None, description="Maximum training steps")
    warmup_steps: int = Field(default=100, ge=0)
    save_steps: int = Field(default=500, ge=1)

class TrainingMetrics(BaseModel):
    current_epoch: int = 0
    total_epochs: int = 0
    current_step: int = 0
    total_steps: int = 0
    loss: Optional[float] = None
    accuracy: Optional[float] = None
    learning_rate: Optional[float] = None
    elapsed_time: Optional[float] = None
    estimated_time_remaining: Optional[float] = None

class TrainingJobCreate(BaseModel):
    name: str
    dataset_path: str
    config: TrainingConfig

class TrainingJobUpdate(BaseModel):
    status: Optional[JobStatus] = None
    metrics: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None

class TrainingJobResponse(BaseModel):
    id: str
    name: str
    status: JobStatus
    dataset_path: Optional[str]
    config: Optional[Dict[str, Any]]
    metrics: Optional[Dict[str, Any]]
    model_path: Optional[str]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        orm_mode = True

class ModelInfo(BaseModel):
    id: str
    name: str
    path: str
    size_mb: float
    created_at: datetime
    training_job_id: str
    metrics: Optional[Dict[str, Any]]
