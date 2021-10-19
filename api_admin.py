# api_admin.py

from typing import Optional
from pydantic import BaseModel

from payanam_launch import app


class Item(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    tax: Optional[float] = None

