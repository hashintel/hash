"""Provide the strict immutable policy shared by analysis results."""

from pydantic import BaseModel, ConfigDict


class AnalysisModel(BaseModel):
    """Reject coercion, mutation, unknown fields, and invalid defaults."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )
