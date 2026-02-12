from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.db_models import User
from app.models.schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from app.services.auth_service import hash_password, verify_password, create_access_token
from app.services.log_service import log_activity
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )

    user = User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_activity(db, user, 'auth.register', 'User', resource_id=str(user.id),
                 resource_name=user.email, provider='system')

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Login with email and password"""
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    log_activity(db, user, 'auth.login', 'User', resource_id=str(user.id),
                 resource_name=user.email, provider='system')

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return UserResponse.model_validate(current_user)
