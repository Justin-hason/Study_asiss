from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from database import get_db
from models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/register", response_model=dict)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.username == req.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    if req.email:
        existing_email = db.query(User).filter(User.email == req.email).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

    hashed_password = get_password_hash(req.password)
    user = User(
        username=req.username,
        email=req.email,
        password_hash=hashed_password,
        role="user",
        tenant_id="default",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(data={"user_id": user.id, "username": user.username})

    return {
        "token": access_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
        },
    }


@router.post("/login", response_model=dict)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    print(f"[DEBUG] Login attempt - username: '{form_data.username}', password length: {len(form_data.password)}")
    
    user = db.query(User).filter(User.username == form_data.username).first()
    print(f"[DEBUG] User found: {user is not None}")
    
    if user:
        print(f"[DEBUG] User password_hash: {user.password_hash[:30]}...")
        verify_result = verify_password(form_data.password, user.password_hash)
        print(f"[DEBUG] Verify password result: {verify_result}")
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    access_token = create_access_token(data={"user_id": user.id, "username": user.username})

    return {
        "token": access_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
        },
    }


@router.get("/me", response_model=dict)
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
    }


@router.post("/refresh", response_model=dict)
def refresh_token(current_user: User = Depends(get_current_user)):
    access_token = create_access_token(data={"user_id": current_user.id, "username": current_user.username})
    return {"token": access_token}