"""Database session dependencies for async SQLAlchemy."""
from app.database import get_db, async_session_factory

get_session = get_db
