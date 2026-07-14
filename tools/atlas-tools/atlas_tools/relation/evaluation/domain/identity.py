"""Define the finite identities that make a logical evaluation vote stable.

A vote is identified by the card, judge request pins, prompt bundle, effort,
and repeat index. These aliases and lookup tables keep that vocabulary finite
and prevent string assembly from creating impossible bundles.
"""

from typing import Annotated, Literal

from pydantic import Field, StringConstraints

type Verdict = Literal["coincident", "proximal", "overlay", "unclear"]
type VoteVerdict = Literal["coincident", "proximal", "overlay", "unclear", "ABSTAIN"]
type PlacementClass = Literal["coincident", "proximal", "overlay"]
type RelationFamilyId = Annotated[str, StringConstraints(min_length=1)]
type JudgeFamilyId = Annotated[str, StringConstraints(min_length=1)]
type NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]
type FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
type NonNegativeFiniteFloat = Annotated[float, Field(ge=0.0, allow_inf_nan=False)]
type PositiveFiniteFloat = Annotated[float, Field(gt=0.0, allow_inf_nan=False)]
type Probability = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
type OpenProbability = Annotated[float, Field(gt=0.0, lt=1.0, allow_inf_nan=False)]

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
