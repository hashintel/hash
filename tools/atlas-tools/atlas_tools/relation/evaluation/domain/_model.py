"""Provide the immutable validation policy shared by evaluation contracts."""

from pydantic import BaseModel, ConfigDict


class FrozenModel(BaseModel):
    """Reject coercion and unknown fields, including in default values.

    Evaluation artifacts are audit records. Silently coercing a value or
    ignoring a newly introduced field can make a resumed run mean something
    different from the run that created it, so domain models fail closed.
    Collections on these models are immutable as well; callers should use
    tuples and frozen sets instead of relying on shallow model freezing.
    """

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )

