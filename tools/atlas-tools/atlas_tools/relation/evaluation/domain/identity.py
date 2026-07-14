"""Define the finite identities that make a logical evaluation vote stable.

A vote is identified by the card, judge request pins, prompt bundle, effort,
and repeat index. These aliases and lookup tables keep that vocabulary finite
and prevent string assembly from creating impossible bundles.
"""

from typing import Final, Literal, Self

from pydantic_core import CoreSchema, core_schema

type Verdict = Literal["coincident", "proximal", "overlay", "unclear"]
type VoteVerdict = Literal["coincident", "proximal", "overlay", "unclear", "ABSTAIN"]
type PlacementClass = Literal["coincident", "proximal", "overlay"]
_SHA256_HEX_LENGTH = 64
_LOWER_HEXADECIMAL = frozenset("0123456789abcdef")


class _NonEmptyStringId(str):
    __slots__ = ()

    def __new__(cls, value: str) -> Self:
        if not isinstance(value, str):
            raise TypeError(f"{cls.__name__} requires a string")
        if not value:
            raise ValueError(f"{cls.__name__} must not be empty")
        return str.__new__(cls, value)

    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        _source_type: object,
        _handler: object,
    ) -> CoreSchema:
        return core_schema.no_info_after_validator_function(
            cls,
            core_schema.str_schema(strict=True, min_length=1),
        )


class _Sha256Id(str):
    __slots__ = ()

    def __new__(cls, value: str) -> Self:
        if not isinstance(value, str):
            raise TypeError(f"{cls.__name__} requires a string")
        if len(value) != _SHA256_HEX_LENGTH or any(
            character not in _LOWER_HEXADECIMAL for character in value
        ):
            raise ValueError(f"{cls.__name__} requires 64 lowercase hexadecimal characters")
        return str.__new__(cls, value)

    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        _source_type: object,
        _handler: object,
    ) -> CoreSchema:
        return core_schema.no_info_after_validator_function(
            cls,
            core_schema.str_schema(
                strict=True,
                min_length=_SHA256_HEX_LENGTH,
                max_length=_SHA256_HEX_LENGTH,
                pattern="^[0-9a-f]{64}$",
            ),
        )


class RelationFamilyId(_NonEmptyStringId):
    """Identify a semantic relation family used for classifier grouping."""


class JudgeFamilyId(_NonEmptyStringId):
    """Identify a judge model family across attempts and analysis."""


class ModelId(_NonEmptyStringId):
    """Identify the model requested from or returned by a provider."""


class ProviderName(_NonEmptyStringId):
    """Identify the provider name returned by OpenRouter."""


class ProviderSlug(_NonEmptyStringId):
    """Identify the exact OpenRouter provider route."""


class VoteId(_Sha256Id):
    """Identify one logical vote independently of physical retries."""


class AttemptId(_Sha256Id):
    """Identify one physical paid request attempt."""


class RequestHash(_Sha256Id):
    """Identify the canonical provider request bytes and stage."""


class CardHash(_Sha256Id):
    """Identify the exact relation card content used by a vote."""


class PromptPackHash(_Sha256Id):
    """Identify the exact prompt pack used to render a request."""


class PlanHash(_Sha256Id):
    """Identify an ordered logical vote plan and request contract."""


class SessionId(_Sha256Id):
    """Identify provider requests that may share prompt-cache state."""


type ShellId = Literal["S1", "S2", "S3"]
type FramingId = Literal["F1", "F2", "F3"]
type BundleId = Literal[
    "S1xF1",
    "S1xF2",
    "S1xF3",
    "S2xF1",
    "S2xF2",
    "S2xF3",
    "S3xF1",
    "S3xF2",
    "S3xF3",
]
type ReasoningEffort = Literal["max", "xhigh", "high", "medium", "low", "minimal", "none"]
type OpenRouterRegion = Literal["global", "eu"]
type RequestStage = Literal["initial", "repair"]

VERDICTS: tuple[Verdict, ...] = ("coincident", "proximal", "overlay", "unclear")
PLACEMENT_CLASSES: tuple[PlacementClass, ...] = ("coincident", "proximal", "overlay")
SHELLS: tuple[ShellId, ...] = ("S1", "S2", "S3")
FRAMINGS: tuple[FramingId, ...] = ("F1", "F2", "F3")
BUNDLES: tuple[BundleId, ...] = (
    "S1xF1",
    "S1xF2",
    "S1xF3",
    "S2xF1",
    "S2xF2",
    "S2xF3",
    "S3xF1",
    "S3xF2",
    "S3xF3",
)
QUALIFICATION_BUNDLE: BundleId = "S1xF1"
BASELINE_REPEAT_INDEX: Final = 0
REFINEMENT_REPEAT_INDICES: Final = (1, 2)
CANARY_REPEAT_INDEX: Final = 3

_BUNDLE_BY_PARTS: dict[tuple[ShellId, FramingId], BundleId] = {
    ("S1", "F1"): "S1xF1",
    ("S1", "F2"): "S1xF2",
    ("S1", "F3"): "S1xF3",
    ("S2", "F1"): "S2xF1",
    ("S2", "F2"): "S2xF2",
    ("S2", "F3"): "S2xF3",
    ("S3", "F1"): "S3xF1",
    ("S3", "F2"): "S3xF2",
    ("S3", "F3"): "S3xF3",
}

_PARTS_BY_BUNDLE: dict[BundleId, tuple[ShellId, FramingId]] = {
    bundle: parts for parts, bundle in _BUNDLE_BY_PARTS.items()
}


def bundle_id(*, shell: ShellId, framing: FramingId) -> BundleId:
    """Return the only bundle belonging to the two finite component IDs."""
    return _BUNDLE_BY_PARTS[(shell, framing)]


def bundle_parts(bundle: BundleId) -> tuple[ShellId, FramingId]:
    """Return shell and framing without parsing an unchecked string."""
    return _PARTS_BY_BUNDLE[bundle]
