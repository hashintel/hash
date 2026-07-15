"""Typed HASH rows and SemType schemas used by the relation-card adapter."""

from typing import Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    NonNegativeInt,
    PositiveInt,
)

from atlas_tools.relation_cards.common.model import RelationCardInput

type ExampleSecurityMode = Literal["none", "all-snapshot-links"]


class FrozenModel(BaseModel):
    """Closed, immutable base for HASH extraction records."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


class HashSnapshotIdentity(FrozenModel):
    """Typed identity of the PostgreSQL snapshot used for HASH extraction."""

    kind: Literal["hash-postgres-transaction-time"] = "hash-postgres-transaction-time"
    value: AwareDatetime


class InverseMetadata(FrozenModel):
    """The optional inverse display name recorded on a SemType entity type."""

    title: str | None = None
    title_plural: str | None = Field(default=None, alias="titlePlural")


class TypeSchema(BaseModel):
    """The source schema fields needed to describe one entity type."""

    model_config = ConfigDict(extra="ignore", frozen=True, populate_by_name=True)

    id: HttpUrl = Field(alias="$id")
    title: str
    title_plural: str | None = Field(default=None, alias="titlePlural")
    description: str
    inverse: InverseMetadata = Field(default_factory=InverseMetadata)


class TypeReference(FrozenModel):
    """A versioned entity-type reference inside a resolved link constraint."""

    ref: HttpUrl = Field(alias="$ref")


class LinkItems(BaseModel):
    """Permitted destinations for one source-type/link-type association."""

    model_config = ConfigDict(extra="ignore", frozen=True, populate_by_name=True)

    one_of: tuple[TypeReference, ...] = Field(default=(), alias="oneOf")


class LinkConstraint(BaseModel):
    """A resolved SemType link array constraint from ``closed_schema.links``."""

    model_config = ConfigDict(extra="ignore", frozen=True, populate_by_name=True)

    items: LinkItems | None = None
    min_items: NonNegativeInt | None = Field(default=None, alias="minItems")
    max_items: NonNegativeInt | None = Field(default=None, alias="maxItems")


class ClosedTypeMetadata(FrozenModel):
    """One entry in a resolved entity type's ordered ``allOf`` closure."""

    # HASH also stores display-only icon and labelProperty fields here. They
    # do not contribute to a relation card, but resolved live schemas retain
    # them and must validate without lossy pre-processing.
    model_config = ConfigDict(extra="ignore", frozen=True, populate_by_name=True)

    id: HttpUrl = Field(alias="$id")
    depth: NonNegativeInt


class ClosedTypeSchema(TypeSchema):
    """Resolved SemType schema with inherited ancestors and link mappings."""

    all_of: tuple[ClosedTypeMetadata, ...] = Field(alias="allOf", min_length=1)
    links: dict[HttpUrl, LinkConstraint] = Field(default_factory=dict)


class EntityTypeRow(FrozenModel):
    """One entity-type version selected from HASH's ontology tables."""

    base_url: HttpUrl
    version: PositiveInt
    source_schema: TypeSchema = Field(
        validation_alias="schema",
        serialization_alias="schema",
    )
    closed_schema: ClosedTypeSchema


class LinkExampleRow(FrozenModel):
    """One explicitly authorized link example and its labeled endpoints."""

    relation_base_url: HttpUrl
    relation_version: PositiveInt
    link_entity_id: str
    subject_id: str
    object_id: str
    subject_label: str
    object_label: str
    subject_direct_type_base_urls: tuple[HttpUrl, ...]
    subject_type_base_urls: tuple[HttpUrl, ...]
    subject_frequency: PositiveInt = 1
    object_frequency: PositiveInt = 1
    source_type_base_url: HttpUrl | None = None
    source_type_title: str | None = None


class HashExampleSelection(FrozenModel):
    """Per-relation diagnostics from SemType-aware example selection."""

    candidate_pairs: NonNegativeInt = 0
    unmatched_candidates: NonNegativeInt = 0
    unmatched_used: bool = False
    stratum_candidates: dict[str, NonNegativeInt] = Field(default_factory=dict)


class HashRelationRecord(FrozenModel):
    """One latest logical HASH link type and its canonical renderer input."""

    base_url: HttpUrl
    version: PositiveInt
    versioned_url: HttpUrl
    card_input: RelationCardInput
    examples: tuple[LinkExampleRow, ...] = ()
    example_selection: HashExampleSelection = Field(default_factory=HashExampleSelection)
