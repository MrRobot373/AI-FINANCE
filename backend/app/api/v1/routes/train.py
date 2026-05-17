from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import os

from app.db.database import get_db
from app.models.training_job import TrainingJob, JobStatus
from app.schemas.training import (
    TrainingJobCreate,
    TrainingJobResponse,
    TrainingJobUpdate,
    ModelInfo,
    TrainingConfig
)
from app.services.training_service import TrainingService
from app.services.rag_service import RagService

router = APIRouter()
training_service = TrainingService()
rag_service = RagService()

@router.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    """Upload a training dataset file"""
    try:
        # Validate file type
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in {'.pdf', '.txt', '.json', '.jsonl', '.csv'}:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format. Supported: .pdf, .txt, .json, .jsonl, .csv"
            )
        
        # Read and save file
        content = await file.read()
        filepath = training_service.save_dataset(content, file.filename)

        if file_ext in {'.pdf', '.txt'}:
            extracted_text = rag_service.extract_text_from_file(filepath, file_ext)

            if not extracted_text.strip():
                os.remove(filepath)
                raise HTTPException(status_code=400, detail="Could not extract text from the file.")

            embed_result = rag_service.ingest_document(extracted_text, file.filename)

            return {
                "filepath": filepath,
                "filename": file.filename,
                "validation": {
                    "valid": True,
                    "format": file_ext.lstrip("."),
                    "sample_count": embed_result.get("chunks", "Already Exists" if embed_result.get("status") == "skipped" else "Document"),
                    "sample_preview": extracted_text[:250]
                },
                "embedding": embed_result
            }
        
        # Validate dataset
        validation = training_service.validate_dataset(filepath)
        
        if not validation.get('valid'):
            os.remove(filepath)
            raise HTTPException(
                status_code=400,
                detail=f"Invalid dataset: {validation.get('error')}"
            )
        
        return {
            "filepath": filepath,
            "filename": file.filename,
            "validation": validation
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs", response_model=TrainingJobResponse)
def create_training_job(job: TrainingJobCreate, db: Session = Depends(get_db)):
    """Create a new training job"""
    try:
        # Verify dataset exists
        if not os.path.exists(job.dataset_path):
            raise HTTPException(status_code=404, detail="Dataset file not found")
        
        # Create job in database
        db_job = TrainingJob(
            name=job.name,
            dataset_path=job.dataset_path,
            config=job.config.dict(),
            status=JobStatus.PENDING
        )
        db.add(db_job)
        db.commit()
        db.refresh(db_job)
        
        return db_job
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs", response_model=List[TrainingJobResponse])
def get_training_jobs(db: Session = Depends(get_db)):
    """Get all training jobs"""
    jobs = db.query(TrainingJob).order_by(TrainingJob.created_at.desc()).all()
    return jobs

@router.get("/jobs/{job_id}", response_model=TrainingJobResponse)
def get_training_job(job_id: str, db: Session = Depends(get_db)):
    """Get specific training job"""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.post("/jobs/{job_id}/start")
def start_training_job(job_id: str, db: Session = Depends(get_db)):
    """Start a training job"""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != JobStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start job with status: {job.status}"
        )
    
    try:
        training_service.start_training(job_id, db)
        return {"message": "Training started", "job_id": job_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/{job_id}/stop")
def stop_training_job(job_id: str, db: Session = Depends(get_db)):
    """Stop a running training job"""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != JobStatus.RUNNING:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot stop job with status: {job.status}"
        )
    
    success = training_service.stop_training(job_id)
    
    if success:
        job.status = JobStatus.STOPPED
        db.commit()
        return {"message": "Training stopped", "job_id": job_id}
    else:
        raise HTTPException(status_code=400, detail="Failed to stop training")

@router.get("/jobs/{job_id}/stream")
def stream_training_progress(job_id: str, db: Session = Depends(get_db)):
    """Stream training progress using Server-Sent Events"""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return StreamingResponse(
        training_service.get_training_progress(job_id, db),
        media_type="text/event-stream"
    )

@router.delete("/jobs/{job_id}", status_code=204)
def delete_training_job(job_id: str, db: Session = Depends(get_db)):
    """Delete a training job"""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete dataset file if exists
    if job.dataset_path and os.path.exists(job.dataset_path):
        try:
            os.remove(job.dataset_path)
        except:
            pass
    
    # Delete from database
    db.delete(job)
    db.commit()
    
    return

@router.get("/models")
def get_models(db: Session = Depends(get_db)):
    """Get all trained models"""
    models = training_service.get_available_models()
    
    # Enrich with job information
    result = []
    for model in models:
        model_name = model['name']
        # Extract job_id from model name (format: finance-ai-{job_id[:8]})
        if 'finance-ai-' in model_name:
            job_id_prefix = model_name.split('finance-ai-')[1]
            job = db.query(TrainingJob).filter(
                TrainingJob.id.like(f"{job_id_prefix}%")
            ).first()
            
            result.append({
                "id": model_name,
                "name": model_name,
                "path": model_name,
                "size_mb": round(model['size'] / (1024 * 1024), 2),
                "created_at": model['modified'],
                "training_job_id": job.id if job else None,
                "metrics": job.metrics if job else None
            })
    
    return result

@router.delete("/models/{model_name}", status_code=204)
def delete_model(model_name: str):
    """Delete a trained model"""
    success = training_service.delete_model(model_name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete model")
    return
