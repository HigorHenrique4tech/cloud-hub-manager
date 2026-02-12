from fastapi import APIRouter
from .aws import router as aws_router
from .azure import router as azure_router
from .auth import router as auth_router
from .users import router as users_router
from .alerts import router as alerts_router
from .logs import router as logs_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(aws_router)
api_router.include_router(azure_router)
api_router.include_router(alerts_router)
api_router.include_router(logs_router)

__all__ = ["api_router"]
