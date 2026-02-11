from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.db_models import User, CloudCredential
from app.models.schemas import CloudCredentialCreate, CloudCredentialResponse
from app.services.auth_service import encrypt_credential, decrypt_credential
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/credentials", response_model=List[CloudCredentialResponse])
def list_credentials(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all cloud credentials for the current user"""
    creds = (
        db.query(CloudCredential)
        .filter(CloudCredential.user_id == current_user.id, CloudCredential.is_active == True)
        .all()
    )
    return [CloudCredentialResponse.model_validate(c) for c in creds]


@router.post("/credentials", response_model=CloudCredentialResponse, status_code=status.HTTP_201_CREATED)
def add_credential(
    payload: CloudCredentialCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a new cloud credential set for the current user"""
    if payload.provider not in ("aws", "azure"):
        raise HTTPException(status_code=400, detail="provider deve ser 'aws' ou 'azure'")

    cred = CloudCredential(
        user_id=current_user.id,
        provider=payload.provider,
        label=payload.label,
        encrypted_data=encrypt_credential(payload.data),
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    return CloudCredentialResponse.model_validate(cred)


@router.delete("/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credential(
    credential_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a cloud credential"""
    cred = (
        db.query(CloudCredential)
        .filter(CloudCredential.id == credential_id, CloudCredential.user_id == current_user.id)
        .first()
    )
    if not cred:
        raise HTTPException(status_code=404, detail="Credencial não encontrada")

    db.delete(cred)
    db.commit()


@router.get("/credentials/{credential_id}/data")
def get_credential_data(
    credential_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get decrypted credential data (used internally by cloud services)"""
    cred = (
        db.query(CloudCredential)
        .filter(
            CloudCredential.id == credential_id,
            CloudCredential.user_id == current_user.id,
            CloudCredential.is_active == True,
        )
        .first()
    )
    if not cred:
        raise HTTPException(status_code=404, detail="Credencial não encontrada")

    return {"provider": cred.provider, "label": cred.label, "data": decrypt_credential(cred.encrypted_data)}
