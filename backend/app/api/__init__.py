from fastapi import APIRouter
from .aws import router as aws_router
from .azure import router as azure_router

api_router = APIRouter()
api_router.include_router(aws_router)
api_router.include_router(azure_router)

__all__ = ["api_router"]
