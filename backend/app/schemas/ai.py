"""AI request schemas."""
from pydantic import BaseModel, Field


class AIChatRequest(BaseModel):
    """Natural-language BI chat request."""

    question: str = Field(..., min_length=1, max_length=2000, description="用户问题")
    history: list[dict] = Field(
        default_factory=list,
        description="最近对话历史 [{'role': 'user'|'assistant', 'content': str}]，最多取 6 条",
    )


class AIProductDescriptionRequest(BaseModel):
    product_name: str = Field(..., min_length=1)
    category: str = ""
    features: list[str] = []
    tone: str = "professional"


class AISalesAnalysisRequest(BaseModel):
    workspace_slug: str
    period: str = "30d"
