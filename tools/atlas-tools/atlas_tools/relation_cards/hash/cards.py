"""Emit HASH SemType link-type records and canonical relation cards."""

from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    NonNegativeInt,
    PositiveInt,
    model_validator,
)

from atlas_tools.common.data import Sha256Hex
from atlas_tools.common.postgres import DatabaseConnectionInfo
from atlas_tools.common.provenance import Provenance, canonical_json_bytes, sha256_file
from atlas_tools.relation.lineage.api import SourceSnapshotIdentity, publish_source_lineage
from atlas_tools.relation_cards.common import CARD_FORMAT_VERSION
from atlas_tools.relation_cards.common.card import build_card
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationId,
    RelationSourceSpec,
    qualify_relation_id,
)
from atlas_tools.relation_cards.common.config import (
    CardsConfig,
    SentenceSplitterName,
    TokenizerName,
)
from atlas_tools.relation_cards.common.sentence import make_sentence_splitter
from atlas_tools.relation_cards.common.tokens import make_token_counter
from atlas_tools.relation_cards.hash.adapter import build_hash_lineage_nodes
from atlas_tools.relation_cards.hash.model import (
    EntityTypeRow,
    ExampleSecurityMode,
    HashRelationRecord,
    HashSnapshotIdentity,
)
from atlas_tools.relation_cards.hash.postgres import (
    LiveHashExtraction,
    extract_live_hash_relations,
)

LINK_TYPES_FORMAT_VERSION = 1


class HashCardsConfig(BaseModel):
    """Content-affecting controls for live HASH relation-card extraction."""

    example_count: PositiveInt = 8
    # Direct PostgreSQL has no authorization-snapshot predicate. Native
    # endpoint labels therefore fail closed unless the generation explicitly
    # chooses the spec's all-snapshot-links security mode.
    example_security_mode: ExampleSecurityMode = "none"
    cards: CardsConfig = Field(default_factory=CardsConfig)

    model_config = ConfigDict(extra="forbid")


class HashCardRow(CardRow):
    """One source-qualified ``cards.jsonl`` sidecar row."""

    relation_id: RelationId
    base_url: HttpUrl
    version: PositiveInt
    versioned_url: HttpUrl

    @model_validator(mode="after")
    def check_relation_id(self) -> Self:
        expected = qualify_relation_id("hash", self.base_url)
        if self.relation_id != expected:
            raise ValueError(f"relation_id must be {expected}")
        return self


class HashCardEntry(BaseModel):
    versioned_url: HttpUrl
    card_hash: Sha256Hex
    token_count: NonNegativeInt
    severely_truncated: bool


class HashCardsManifestDetails(BaseModel):
    """Database snapshot, content hashes, and card projection metadata."""

    link_types_format_version: int
    card_format_version: int
    relation_source: RelationSourceSpec
    card_hash_canonicalization: str
    tokenizer: TokenizerName
    sentence_splitter: SentenceSplitterName
    token_budget: PositiveInt
    hard_token_budget: PositiveInt
    snapshot_at: AwareDatetime
    snapshot: HashSnapshotIdentity
    database_host: str
    database_port: PositiveInt
    database_name: str
    entity_type_versions: NonNegativeInt
    link_types: NonNegativeInt
    example_candidates: NonNegativeInt
    example_candidate_pairs: NonNegativeInt
    example_unmatched_candidates: NonNegativeInt
    example_unmatched_fallbacks: NonNegativeInt
    example_security_mode: ExampleSecurityMode
    selected_examples: NonNegativeInt
    cards: dict[str, HashCardEntry]


HashCardsProvenance = Provenance[HashCardsManifestDetails, HashCardsConfig]


@dataclass(frozen=True)
class HashCardsPaths:
    """Files written by one live HASH relation-card extraction."""

    entity_types_jsonl: Path
    link_types_jsonl: Path
    cards_jsonl: Path
    manifest: Path
    lineage_jsonl: Path
    lineage_manifest: Path


def _write_entity_types(path: Path, entity_types: tuple[EntityTypeRow, ...]) -> None:
    ordered = sorted(
        entity_types,
        key=lambda row: (str(row.base_url), row.version, str(row.source_schema.id)),
    )
    with path.open("w", encoding="utf-8") as output:
        for row in ordered:
            output.write(
                canonical_json_bytes(row.model_dump(mode="json", by_alias=True)).decode("utf-8")
                + "\n"
            )


def _write_link_types(path: Path, records: list[HashRelationRecord]) -> None:
    with path.open("w", encoding="utf-8") as output:
        output.writelines(canonical_json_bytes(record).decode("utf-8") + "\n" for record in records)


def emit_hash_cards(
    extraction: LiveHashExtraction,
    config: HashCardsConfig,
    out_dir: PathLike,
    *,
    connection_info: DatabaseConnectionInfo,
) -> HashCardsPaths:
    """Render one card per selected link type and persist provenance."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    records = sorted(extraction.records, key=lambda record: str(record.base_url))
    snapshot = HashSnapshotIdentity(value=extraction.snapshot_at)

    entity_types_path = out_dir / "entity-types.jsonl"
    _write_entity_types(entity_types_path, extraction.entity_types)
    lineage_nodes = build_hash_lineage_nodes(extraction.entity_types)
    lineage_relation_ids = {node.relation_id for node in lineage_nodes}
    card_relation_ids = {qualify_relation_id("hash", record.base_url) for record in records}
    missing_lineage = card_relation_ids - lineage_relation_ids
    if missing_lineage:
        raise ValueError(
            f"HASH card relations are absent from the source lineage: {sorted(missing_lineage)}"
        )

    link_types_path = out_dir / "link-types.jsonl"
    _write_link_types(link_types_path, records)

    counter = make_token_counter(config.cards.tokenizer)
    splitter = make_sentence_splitter(config.cards.sentence_splitter)
    rendered = [
        (
            record,
            build_card(
                record.card_input,
                config=config.cards,
                counter=counter,
                splitter=splitter,
            ),
        )
        for record in records
    ]

    cards_path = out_dir / "cards.jsonl"
    with cards_path.open("w", encoding="utf-8") as output:
        for record, card in rendered:
            output.write(
                canonical_json_bytes(
                    HashCardRow(
                        relation_id=qualify_relation_id("hash", record.base_url),
                        base_url=record.base_url,
                        version=record.version,
                        versioned_url=record.versioned_url,
                        card_text=card.card_text,
                        card_hash=card.card_hash,
                        token_count=card.token_count,
                        truncations=list(card.truncations),
                        severely_truncated=card.severely_truncated,
                    )
                ).decode("utf-8")
                + "\n"
            )

    manifest_path = out_dir / "cards.manifest.json"
    content_hashes = {
        "cards.jsonl": sha256_file(cards_path),
        "entity-types.jsonl": sha256_file(entity_types_path),
        "link-types.jsonl": sha256_file(link_types_path),
    }

    HashCardsProvenance.make(
        producer="hash.extract-relation-cards",
        input_hashes={
            "entity-types.jsonl": content_hashes["entity-types.jsonl"],
            "link-types.jsonl": content_hashes["link-types.jsonl"],
        },
        content_hashes=content_hashes,
        config=config,
        details=HashCardsManifestDetails(
            link_types_format_version=LINK_TYPES_FORMAT_VERSION,
            card_format_version=CARD_FORMAT_VERSION,
            relation_source=RelationSourceSpec(
                namespace="hash",
                local_id_field="base_url",
            ),
            card_hash_canonicalization="utf-8 bytes of card_text",
            tokenizer=counter.name,
            sentence_splitter=splitter.name,
            token_budget=config.cards.token_budget,
            hard_token_budget=config.cards.hard_token_budget,
            snapshot_at=extraction.snapshot_at,
            snapshot=snapshot,
            database_host=connection_info.host,
            database_port=connection_info.port,
            database_name=connection_info.database,
            entity_type_versions=extraction.entity_type_versions,
            link_types=len(records),
            example_candidates=extraction.example_candidates,
            example_candidate_pairs=sum(
                record.example_selection.candidate_pairs for record in records
            ),
            example_unmatched_candidates=sum(
                record.example_selection.unmatched_candidates for record in records
            ),
            example_unmatched_fallbacks=sum(
                record.example_selection.unmatched_used for record in records
            ),
            example_security_mode=config.example_security_mode,
            selected_examples=sum(len(record.examples) for record in records),
            cards={
                str(record.base_url): HashCardEntry(
                    versioned_url=record.versioned_url,
                    card_hash=card.card_hash,
                    token_count=card.token_count,
                    severely_truncated=card.severely_truncated,
                )
                for record, card in rendered
            },
        ),
    ).write(manifest_path)

    lineage_paths = publish_source_lineage(
        lineage_nodes,
        cards_directory=out_dir,
        output_directory=out_dir,
        producer="hash.extract-relation-lineage",
        snapshot=SourceSnapshotIdentity.model_validate(
            snapshot.model_dump(mode="json"),
            strict=True,
        ),
        raw_inputs={"entity-types.jsonl": entity_types_path},
    )

    return HashCardsPaths(
        entity_types_jsonl=entity_types_path,
        link_types_jsonl=link_types_path,
        cards_jsonl=cards_path,
        manifest=manifest_path,
        lineage_jsonl=lineage_paths.lineage_jsonl,
        lineage_manifest=lineage_paths.manifest,
    )


def extract_and_emit_hash_cards(
    connection_info: DatabaseConnectionInfo,
    config: HashCardsConfig,
    out_dir: PathLike,
    *,
    snapshot_at: AwareDatetime | None = None,
) -> HashCardsPaths:
    """Select one HASH PostgreSQL snapshot and emit cards plus lineage."""
    extraction = extract_live_hash_relations(
        connection_info,
        example_count=config.example_count,
        example_security_mode=config.example_security_mode,
        snapshot_at=snapshot_at,
    )

    return emit_hash_cards(
        extraction,
        config,
        out_dir,
        connection_info=connection_info,
    )
