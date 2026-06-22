from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=dict)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "created_at": current_user.created_at.isoformat(),
    }


@router.put("/me", response_model=dict)
def update_current_user(email: Optional[str] = None, current_user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    if email:
        existing = db.query(User).filter(User.email == email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
        current_user.email = email
        db.commit()
        db.refresh(current_user)

    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
    }