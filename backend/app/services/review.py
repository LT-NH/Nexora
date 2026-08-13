"""Nexora - Review Service.

Handles review CRUD and aggregated statistics — all scoped to a workspace.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.review import Review
from app.models.workspace import Workspace
from app.schemas.review import ReviewCreate, ReviewReply, ReviewResponse, ReviewStatsResponse
from app.utils.audit import create_audit_log
from app.utils.logging import get_logger

logger = get_logger(__name__)

_UPLOADS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "reviews"
)


class ReviewService:
    """Service for review-related business logic."""

    @staticmethod
    async def create_review(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
        data: ReviewCreate,
        *,
        user_id: str,
    ) -> ReviewResponse:
        """Create a new product review."""
        # Verify product exists in workspace
        prod_check = await db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.workspace_id == workspace.id,
            )
        )
        if prod_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found.",
            )

        review = Review(
            workspace_id=workspace.id,
            product_id=product_id,
            customer_name=data.customer_name.strip(),
            rating=data.rating,
            content=data.content,
            is_verified=data.is_verified,
        )
        if data.image_urls:
            review.image_urls = json.dumps(data.image_urls)
        db.add(review)
        await db.flush()
        await db.refresh(review)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="review.created",
            resource_type="review",
            resource_id=review.id,
            details={
                "product_id": product_id,
                "rating": review.rating,
                "customer_name": review.customer_name,
            },
        )

        logger.info(
            "Review created: product=%s rating=%d by %s",
            product_id,
            review.rating,
            review.customer_name,
        )
        return ReviewService._to_response(review)

    @staticmethod
    async def list_reviews(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
    ) -> List[ReviewResponse]:
        """List all reviews for a product."""
        # Verify product exists in workspace
        prod_check = await db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.workspace_id == workspace.id,
            )
        )
        if prod_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found.",
            )

        result = await db.execute(
            select(Review)
            .where(
                Review.workspace_id == workspace.id,
                Review.product_id == product_id,
            )
            .order_by(Review.created_at.desc())
        )
        reviews = result.scalars().all()
        return [ReviewService._to_response(r) for r in reviews]

    @staticmethod
    async def reply_review(
        db: AsyncSession,
        workspace: Workspace,
        review_id: str,
        data: ReviewReply,
    ) -> ReviewResponse:
        """Seller replies to a review."""
        result = await db.execute(
            select(Review).where(
                Review.id == review_id,
                Review.workspace_id == workspace.id,
            )
        )
        review = result.scalar_one_or_none()
        if review is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found.")

        review.reply = data.reply
        review.replied_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(review)
        return ReviewService._to_response(review)

    @staticmethod
    async def toggle_approval(
        db: AsyncSession,
        workspace: Workspace,
        review_id: str,
    ) -> ReviewResponse:
        """Toggle review approval status."""
        result = await db.execute(
            select(Review).where(
                Review.id == review_id,
                Review.workspace_id == workspace.id,
            )
        )
        review = result.scalar_one_or_none()
        if review is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found.")

        review.is_approved = not review.is_approved
        await db.flush()
        await db.refresh(review)
        return ReviewService._to_response(review)

    @staticmethod
    async def upload_review_image(
        db: AsyncSession,
        workspace: Workspace,
        review_id: str,
        file: UploadFile,
    ) -> ReviewResponse:
        """Upload an image for a review."""
        result = await db.execute(
            select(Review).where(
                Review.id == review_id,
                Review.workspace_id == workspace.id,
            )
        )
        review = result.scalar_one_or_none()
        if review is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found.")

        os.makedirs(_UPLOADS_DIR, exist_ok=True)
        ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(_UPLOADS_DIR, filename)
        content = await file.read()
        with open(filepath, "wb") as f:
            f.write(content)

        image_url = f"/uploads/reviews/{filename}"
        existing = review.image_urls_list
        existing.append(image_url)
        review.image_urls = json.dumps(existing)
        await db.flush()
        await db.refresh(review)
        return ReviewService._to_response(review)

    @staticmethod
    async def get_review_stats(
        db: AsyncSession,
        workspace: Workspace,
    ) -> ReviewStatsResponse:
        """Get aggregated review statistics for the workspace."""
        result = await db.execute(
            select(
                func.avg(Review.rating),
                func.count(Review.id),
            ).where(Review.workspace_id == workspace.id)
        )
        avg_rating, total_reviews = result.one()

        # Rating distribution
        dist_result = await db.execute(
            select(Review.rating, func.count(Review.id))
            .where(Review.workspace_id == workspace.id)
            .group_by(Review.rating)
        )
        rating_distribution: dict[str, int] = {str(i): 0 for i in range(1, 6)}
        for row in dist_result.all():
            rating_distribution[str(row[0])] = row[1]

        return ReviewStatsResponse(
            average_rating=round(float(avg_rating or 0.0), 1),
            total_reviews=total_reviews or 0,
            rating_distribution=rating_distribution,
        )

    @staticmethod
    async def get_product_review_stats(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
    ) -> ReviewStatsResponse:
        """Get aggregated review statistics for a specific product."""
        result = await db.execute(
            select(
                func.avg(Review.rating),
                func.count(Review.id),
            ).where(
                Review.workspace_id == workspace.id,
                Review.product_id == product_id,
            )
        )
        avg_rating, total_reviews = result.one()

        # Rating distribution
        dist_result = await db.execute(
            select(Review.rating, func.count(Review.id))
            .where(
                Review.workspace_id == workspace.id,
                Review.product_id == product_id,
            )
            .group_by(Review.rating)
        )
        rating_distribution: dict[str, int] = {str(i): 0 for i in range(1, 6)}
        for row in dist_result.all():
            rating_distribution[str(row[0])] = row[1]

        return ReviewStatsResponse(
            average_rating=round(float(avg_rating or 0.0), 1),
            total_reviews=total_reviews or 0,
            rating_distribution=rating_distribution,
        )

    @staticmethod
    def _to_response(review: Review) -> ReviewResponse:
        return ReviewResponse(
            id=review.id,
            workspace_id=review.workspace_id,
            product_id=review.product_id,
            customer_name=review.customer_name,
            rating=review.rating,
            content=review.content,
            image_urls=review.image_urls_list if review.image_urls else None,
            reply=review.reply,
            replied_at=review.replied_at,
            is_approved=review.is_approved,
            is_verified=review.is_verified,
            created_at=review.created_at,
        )
