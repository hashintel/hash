"""Define reusable strict scalar constraints for evaluation contracts."""

from datetime import timedelta
from typing import Annotated

from pydantic import Field

from atlas_tools.relation.domain.api import NonEmptyStr

__all__ = [
    "FiniteFloat",
    "HttpErrorStatusCode",
    "HttpStatusCode",
    "NonEmptyStr",
    "NonNegativeDuration",
    "NonNegativeFiniteFloat",
    "OpenProbability",
    "PositiveDuration",
    "PositiveFiniteFloat",
    "PositiveProbability",
    "Probability",
]


type FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
type NonNegativeFiniteFloat = Annotated[float, Field(ge=0.0, allow_inf_nan=False)]
type PositiveFiniteFloat = Annotated[float, Field(gt=0.0, allow_inf_nan=False)]
type Probability = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
type OpenProbability = Annotated[float, Field(gt=0.0, lt=1.0, allow_inf_nan=False)]
type PositiveProbability = Annotated[float, Field(gt=0.0, le=1.0, allow_inf_nan=False)]
type HttpStatusCode = Annotated[int, Field(ge=100, le=599)]
type HttpErrorStatusCode = Annotated[int, Field(ge=400, le=599)]
type NonNegativeDuration = Annotated[timedelta, Field(ge=timedelta())]
type PositiveDuration = Annotated[timedelta, Field(gt=timedelta())]
