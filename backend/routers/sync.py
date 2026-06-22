from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/", response_model=dict)
def sync_data(resources: List[str], last_sync: Optional[str] = None,
              current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changes = {}

    if "notes" in resources:
        changes["notes"] = {
            "created": [],
            "updated": [],
            "deleted": [],
        }

    if "bookmarks" in resources:
        changes["bookmarks"] = {
            "created": [],
            "updated": [],
            "deleted": [],
        }

    if "progress" in resources:
        changes["progress"] = {
            "created": [],
            "updated": [],
            "deleted": [],
        }

    return {
        "sync_time": datetime.utcnow().isoformat(),
        "changes": changes,
    }