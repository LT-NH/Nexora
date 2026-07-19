"""Nexora - Customer Service.

Handles Customer CRUD operations and RFM (Recency, Frequency, Monetary) analysis.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.order import Order, OrderStatus
from app.models.workspace import Workspace
from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    RFMAnalysisResponse,
    RFMSegment,
)


class CustomerService:
    """Service for customer-related business logic."""

    # ── Customer CRUD ──────────────────────────────────────────────────────

    @staticmethod
    async def create_customer(
        db: AsyncSession,
        workspace: Workspace,
        customer_data: CustomerCreate,
    ) -> CustomerResponse:
        """Create a new customer in a workspace.

        Args:
            db: Async database session.
            workspace: The workspace context.
            customer_data: Customer creation data.

        Returns:
            The created CustomerResponse.
        """
        customer = Customer(
            workspace_id=workspace.id,
            name=customer_data.name.strip(),
            email=customer_data.email.lower().strip() if customer_data.email else None,
            phone=customer_data.phone,
            tags=customer_data.tags or [],
            notes=customer_data.notes,
            source=customer_data.source,
        )
        db.add(customer)
        await db.flush()
        await db.refresh(customer)

        return CustomerResponse.model_validate(customer)

    @staticmethod
    async def get_customer_by_id(
        db: AsyncSession,
        workspace: Workspace,
        customer_id: str,
    ) -> CustomerResponse:
        """Get a customer by ID within a workspace.

        Args:
            db: Async database session.
            workspace: The workspace context.
            customer_id: The customer ID.

        Returns:
            CustomerResponse for the requested customer.

        Raises:
            HTTPException 404: If the customer is not found.
        """
        result = await db.execute(
            select(Customer).where(
                Customer.id == customer_id,
                Customer.workspace_id == workspace.id,
            )
        )
        customer = result.scalar_one_or_none()

        if customer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer '{customer_id}' not found.",
            )

        return CustomerResponse.model_validate(customer)

    @staticmethod
    async def list_customers(
        db: AsyncSession,
        workspace: Workspace,
        *,
        search: str | None = None,
        source: str | None = None,
        tag: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[CustomerResponse], int]:
        """List customers in a workspace with optional filtering.

        Args:
            db: Async database session.
            workspace: The workspace context.
            search: Search by name, email, or phone.
            source: Filter by source.
            tag: Filter by tag (JSON array contains).
            skip: Pagination offset.
            limit: Max results per page.

        Returns:
            Tuple of (list of CustomerResponse, total count).
        """
        conditions = [Customer.workspace_id == workspace.id]

        if search is not None:
            search_term = f"%{search}%"
            conditions.append(
                (Customer.name.ilike(search_term))
                | (Customer.email.ilike(search_term))
                | (Customer.phone.ilike(search_term))
            )
        if source is not None:
            conditions.append(Customer.source == source)
        if tag is not None:
            conditions.append(Customer.tags.contains(tag))

        count_result = await db.execute(
            select(func.count()).select_from(Customer).where(*conditions)
        )
        total = count_result.scalar() or 0

        data_query = (
            select(Customer)
            .where(*conditions)
            .order_by(Customer.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(data_query)
        customers = result.scalars().all()

        return [CustomerResponse.model_validate(c) for c in customers], total

    @staticmethod
    async def update_customer(
        db: AsyncSession,
        workspace: Workspace,
        customer_id: str,
        update_data: CustomerUpdate,
    ) -> CustomerResponse:
        """Update an existing customer.

        Args:
            db: Async database session.
            workspace: The workspace context.
            customer_id: The customer ID to update.
            update_data: Fields to update.

        Returns:
            Updated CustomerResponse.

        Raises:
            HTTPException 404: If the customer is not found.
        """
        result = await db.execute(
            select(Customer).where(
                Customer.id == customer_id,
                Customer.workspace_id == workspace.id,
            )
        )
        customer = result.scalar_one_or_none()

        if customer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer '{customer_id}' not found.",
            )

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            if field == "name" and value is not None:
                setattr(customer, field, value.strip())
            elif field == "email" and value is not None:
                setattr(customer, field, value.lower().strip() if value else None)
            else:
                setattr(customer, field, value)

        customer.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(customer)

        return CustomerResponse.model_validate(customer)

    @staticmethod
    async def delete_customer(
        db: AsyncSession,
        workspace: Workspace,
        customer_id: str,
    ) -> None:
        """Delete a customer.

        Args:
            db: Async database session.
            workspace: The workspace context.
            customer_id: The customer ID to delete.

        Raises:
            HTTPException 404: If the customer is not found.
        """
        result = await db.execute(
            select(Customer).where(
                Customer.id == customer_id,
                Customer.workspace_id == workspace.id,
            )
        )
        customer = result.scalar_one_or_none()

        if customer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer '{customer_id}' not found.",
            )

        await db.delete(customer)
        await db.flush()

    # ── RFM Analysis ───────────────────────────────────────────────────────

    @staticmethod
    async def get_rfm_analysis(
        db: AsyncSession,
        workspace: Workspace,
        *,
        reference_date: datetime | None = None,
    ) -> RFMAnalysisResponse:
        """Perform RFM (Recency, Frequency, Monetary) analysis on workspace customers.

        Segments customers into 5 groups based on recency, frequency, and monetary
        value. Each dimension is scored 1-5 (5 is best), and the composite RFM score
        is the weighted average.

        Segment labels:
            - 4.5+ : champion
            - 3.5-4.5 : loyal
            - 2.5-3.5 : potential
            - 1.5-2.5 : at_risk
            - < 1.5 : lost

        Args:
            db: Async database session.
            workspace: The workspace context.
            reference_date: The reference date for recency calculation.
                Defaults to now.

        Returns:
            RFMAnalysisResponse with segment breakdown.
        """
        ref_date = reference_date or datetime.now(timezone.utc)

        # Get all customers with their order stats
        result = await db.execute(
            select(Customer).where(Customer.workspace_id == workspace.id)
        )
        customers = result.scalars().all()

        if not customers:
            return RFMAnalysisResponse(
                workspace_id=workspace.id,
                total_customers=0,
                segments=[],
                analyzed_at=ref_date,
            )

        # Calculate RFM metrics for each customer
        rfm_data = []
        for customer in customers:
            # Get paid/delivered orders for this customer
            orders_result = await db.execute(
                select(Order)
                .where(
                    Order.workspace_id == workspace.id,
                    Order.customer_id == customer.id,
                    Order.status.notin_(
                        [OrderStatus.CANCELLED, OrderStatus.REFUNDED]
                    ),
                )
                .order_by(desc(Order.created_at))
            )
            orders = orders_result.scalars().all()

            if not orders:
                recency_days = (ref_date - customer.created_at).days or 1
                frequency = 0
                monetary = 0.0
            else:
                recency_days = (ref_date - orders[0].created_at).days or 1
                frequency = len(orders)
                monetary = float(sum(o.total for o in orders))

            rfm_data.append(
                {
                    "customer_id": customer.id,
                    "recency_days": recency_days,
                    "frequency": frequency,
                    "monetary": monetary,
                    "customer": customer,
                }
            )

        # Score each dimension using quintile method
        recency_values = sorted([d["recency_days"] for d in rfm_data])
        frequency_values = sorted([d["frequency"] for d in rfm_data])
        monetary_values = sorted([d["monetary"] for d in rfm_data])

        n = len(rfm_data)

        def quintile_score(value: float, sorted_values: list[float], ascending: bool = True) -> int:
            """Assign a score 1-5 based on quintile position.

            For recency, lower is better (more recent), so ascending=True.
            For frequency and monetary, higher is better, so ascending=False.
            """
            if not sorted_values or max(sorted_values) == min(sorted_values):
                return 3

            if ascending:
                # Lower values get higher scores
                for i in range(5):
                    threshold_idx = int(n * (i + 1) / 5) - 1
                    if threshold_idx < 0:
                        threshold_idx = 0
                    if threshold_idx >= n:
                        threshold_idx = n - 1
                    threshold = sorted_values[threshold_idx]
                    if value <= threshold:
                        return 5 - i
                return 1
            else:
                # Higher values get higher scores
                for i in range(5):
                    threshold_idx = int(n * (i + 1) / 5) - 1
                    if threshold_idx < 0:
                        threshold_idx = 0
                    if threshold_idx >= n:
                        threshold_idx = n - 1
                    threshold = sorted_values[threshold_idx]
                    if value <= threshold:
                        return i + 1
                return 5

        # Assign scores and segments
        segments_map: dict[str, dict] = {}

        for data in rfm_data:
            r_score = quintile_score(data["recency_days"], recency_values, ascending=True)
            f_score = quintile_score(data["frequency"], frequency_values, ascending=False)
            m_score = quintile_score(data["monetary"], monetary_values, ascending=False)

            rfm_score = round((r_score + f_score + m_score) / 3.0, 2)

            if rfm_score >= 4.5:
                segment = "champion"
            elif rfm_score >= 3.5:
                segment = "loyal"
            elif rfm_score >= 2.5:
                segment = "potential"
            elif rfm_score >= 1.5:
                segment = "at_risk"
            else:
                segment = "lost"

            if segment not in segments_map:
                segments_map[segment] = {
                    "segment": segment,
                    "r_scores": [],
                    "f_scores": [],
                    "m_scores": [],
                    "rfm_scores": [],
                    "total_spents": [],
                    "customer_count": 0,
                }

            segments_map[segment]["r_scores"].append(r_score)
            segments_map[segment]["f_scores"].append(f_score)
            segments_map[segment]["m_scores"].append(m_score)
            segments_map[segment]["rfm_scores"].append(rfm_score)
            segments_map[segment]["total_spents"].append(data["monetary"])
            segments_map[segment]["customer_count"] += 1

        # Build segment responses
        segment_order = ["champion", "loyal", "potential", "at_risk", "lost"]
        segments = []

        for seg_name in segment_order:
            if seg_name in segments_map:
                info = segments_map[seg_name]
                segments.append(
                    RFMSegment(
                        segment=seg_name,
                        r_score=round(
                            sum(info["r_scores"]) / len(info["r_scores"])
                        ),
                        f_score=round(
                            sum(info["f_scores"]) / len(info["f_scores"])
                        ),
                        m_score=round(
                            sum(info["m_scores"]) / len(info["m_scores"])
                        ),
                        rfm_score=round(
                            sum(info["rfm_scores"]) / len(info["rfm_scores"]), 2
                        ),
                        customer_count=info["customer_count"],
                        average_total_spent=round(
                            sum(info["total_spents"]) / max(info["customer_count"], 1),
                            2,
                        ),
                    )
                )

        return RFMAnalysisResponse(
            workspace_id=workspace.id,
            total_customers=len(customers),
            segments=segments,
            analyzed_at=ref_date,
        )