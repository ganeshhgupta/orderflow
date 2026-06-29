from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .models import OrderStatus


class OrderCreate(BaseModel):
    item: str = Field(..., min_length=1, max_length=255)
    quantity: int = Field(..., ge=1)
    price: float = Field(..., gt=0)


class OrderResponse(BaseModel):
    id: str
    item: str
    quantity: int
    price: float
    status: OrderStatus
    retry_count: int
    error_msg: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MetricsResponse(BaseModel):
    queue_depth: int
    dlq_depth: int
    total_completed: int
    total_failed: int
    total_dead: int
    total_processing: int
    worker_count: int = 0
