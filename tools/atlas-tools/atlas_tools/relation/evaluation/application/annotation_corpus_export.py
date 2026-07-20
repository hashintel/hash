"""Export the annotation corpus from the completed grid and card sources.

The exporter re-derives every card's structured content from its source
artifact (hash link-type records; Wikidata records through the identifier
sanitizer), re-renders it through the Python template, and requires the
rendered hash to equal the verified deck's card hash — the exported content
is provably the exact input behind the voted text. Votes come from the
completed production grid only (imported pilot votes plus fresh votes,
frozen-panel judges, canaries included); pilot experiment arms and pruned
judges never enter the corpus.
"""

import json
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict, TypeAdapter

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat.api import ConcatSource, verify_concat_artifact
from atlas_tools.relation.domain.api import RelationId, qualify_relation_id
from atlas_tools.relation.evaluation.application._analysis_codec import atomic_replace
from atlas_tools.relation.evaluation.application.annotation_corpus import (
    AnnotationCorpusDocument,
    ResolvedCardContent,
    build_annotation_corpus_document,
)
from atlas_tools.relation.evaluation.application.completed import load_completed_grid
from atlas_tools.relation.evaluation.application.fit_inputs import (
    card_versioned_url,
    raw_concat_cards,
)
from atlas_tools.relation.family_closure.api import verify_family_closure
from atlas_tools.relation_cards.common.card import build_card, slugify
from atlas_tools.relation_cards.common.sentence import make_sentence_splitter
from atlas_tools.relation_cards.common.tokens import make_token_counter
from atlas_tools.relation_cards.hash.cards import HashCardsConfig, HashCardsProvenance
from atlas_tools.relation_cards.hash.model import HashRelationRecord
from atlas_tools.relation_cards.wikidata.card import build_card as build_wikidata_card
from atlas_tools.relation_cards.wikidata.cards import CardsManifestProvenance
from atlas_tools.wikidata.config import Config as WikidataConfig
from atlas_tools.wikidata.model import EntityId, EntityLabel, PropertyRecord

WIKIDATA_ENTITY_URL_PREFIX = "http://www.wikidata.org/entity/"

# The voted deck was rendered from the format-3 records intermediate;
# format 4 added the lineage sidecar without touching record content.
_SUPPORTED_RECORDS_FORMATS = frozenset({3, 4})

_ENTITY_LABELS_ADAPTER = TypeAdapter(dict[EntityId, EntityLabel])


@dataclass(frozen=True, slots=True, kw_only=True)
class AnnotationCorpusArtifact:
    """Describe one published annotation-corpus document."""

    path: Path
    content_hash: Sha256Hex
    card_count: int
    hash_card_count: int
    wikidata_card_count: int
    vote_count: int
    verdict_counts: Mapping[str, int]
    shot_excluded_count: int
    holdout_count: int


def _publisher(base_url: str) -> str:
    """Derive the pinned ``host/@web`` publisher axis from a hash base URL."""
    scheme, separator, remainder = base_url.partition("://")
    if not scheme or not separator:
        raise ValueError(f"hash base URL carries no scheme: {base_url}")
    host, _, path = remainder.partition("/")
    web = path.split("/", 1)[0]
    if not host or not web.startswith("@") or web == "@":
        raise ValueError(f"hash base URL carries no @web segment: {base_url}")
    return f"{host}/{web}"


def resolve_hash_contents(
    *,
    link_types_path: Path,
    config: HashCardsConfig,
) -> dict[RelationId, ResolvedCardContent]:
    """Re-derive hash card content from the persisted link-type records.

    Raises:
        ValueError: A record fails validation or repeats a relation.
        OSError: The link-type records cannot be read.

    """
    counter = make_token_counter(config.cards.tokenizer)
    splitter = make_sentence_splitter(config.cards.sentence_splitter)
    resolved: dict[RelationId, ResolvedCardContent] = {}
    with link_types_path.open(encoding="utf-8") as records_file:
        for line_number, line in enumerate(records_file, start=1):
            if not line.strip():
                continue
            try:
                record = HashRelationRecord.model_validate_json(line)
            except ValueError as error:
                raise ValueError(
                    f"invalid link-type record at {link_types_path} line {line_number}: {error}"
                ) from error
            relation_id = qualify_relation_id("hash", record.base_url)
            if relation_id in resolved:
                raise ValueError(f"link-type records repeat {relation_id}")
            card = build_card(
                record.card_input,
                config=config.cards,
                counter=counter,
                splitter=splitter,
            )
            base_url = str(record.base_url)
            slug = record.card_input.slug
            resolved[relation_id] = ResolvedCardContent(
                source="hash",
                identity=str(record.versioned_url),
                base_url=base_url,
                publisher=_publisher(base_url),
                inverse_of=(),
                retrieved_at=None,
                source_record_hash=None,
                slug=slug if slug is not None else slugify(record.card_input.title),
                card_input=record.card_input,
                rendered_card_hash=card.card_hash,
            )
    return resolved


class _IntermediateMetaDetails(BaseModel):
    """The exact slice of records.meta.json details this exporter consumes.

    The voted deck's records intermediate predates the current
    ``load_records`` format, so this reader validates only the consumed
    fields and verifies content hashes; the per-card re-render round-trip
    against the deck supplies the real content proof.
    """

    model_config = ConfigDict(frozen=True, extra="ignore")

    records_format_version: int
    excluded: dict[str, str]
    content_hashes: dict[str, Sha256Hex]


@dataclass(frozen=True, slots=True, kw_only=True)
class WikidataIntermediate:
    """The hash-verified records intermediate the voted cards derive from."""

    records: tuple[PropertyRecord, ...]
    entity_labels: dict[EntityId, EntityLabel]
    excluded: frozenset[str]
    records_path: Path
    records_hash: Sha256Hex
    entity_labels_hash: Sha256Hex
    meta_path: Path


def load_wikidata_intermediate(directory: Path) -> WikidataIntermediate:
    """Load and hash-verify a records intermediate of any supported format.

    Raises:
        ValueError: The format is unsupported, a content hash disagrees, or
            records repeat a PID.
        OSError: A file cannot be read.

    """
    records_path = directory / "records.jsonl"
    labels_path = directory / "entity_labels.json"
    meta_path = directory / "records.meta.json"
    payload = json.loads(meta_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or "details" not in payload:
        raise ValueError(f"{meta_path} is not a records provenance sidecar")
    details = _IntermediateMetaDetails.model_validate(payload["details"])
    if details.records_format_version not in _SUPPORTED_RECORDS_FORMATS:
        raise ValueError(
            f"records format {details.records_format_version} unsupported "
            f"(expected one of {sorted(_SUPPORTED_RECORDS_FORMATS)})"
        )
    for name, path in (("records.jsonl", records_path), ("entity_labels.json", labels_path)):
        recorded = details.content_hashes.get(name)
        if recorded is None:
            raise ValueError(f"{meta_path} records no {name} content hash")
        if sha256_file(path) != recorded:
            raise ValueError(f"{path} does not match the hash recorded in {meta_path}")

    with records_path.open(encoding="utf-8") as records_file:
        records = tuple(
            PropertyRecord.model_validate_json(line) for line in records_file if line.strip()
        )
    pids = [record.pid for record in records]
    if len(pids) != len(set(pids)):
        raise ValueError(f"{records_path} repeats a PID")

    return WikidataIntermediate(
        records=records,
        entity_labels=_ENTITY_LABELS_ADAPTER.validate_json(labels_path.read_bytes()),
        excluded=frozenset(details.excluded),
        records_path=records_path,
        records_hash=details.content_hashes["records.jsonl"],
        entity_labels_hash=details.content_hashes["entity_labels.json"],
        meta_path=meta_path,
    )


def _record_line_hashes(records_path: Path) -> dict[str, Sha256Hex]:
    """Hash each records.jsonl row exactly as pinned: its canonical-JSON bytes.

    The emitter writes rows as canonical JSON; requiring byte equality here
    keeps the pinned hash definition exact instead of trusting a model
    round-trip.
    """
    hashes: dict[str, Sha256Hex] = {}
    with records_path.open("rb") as records_file:
        for line in records_file:
            stripped = line.rstrip(b"\n")
            if not stripped:
                continue
            row = json.loads(stripped.decode("utf-8"))
            if canonical_json_bytes(row) != stripped:
                raise ValueError(f"{records_path} carries a non-canonical row")
            pid = row["pid"]
            if not isinstance(pid, str) or not pid:
                raise ValueError(f"{records_path} carries a row without a pid")
            hashes[pid] = sha256_bytes(stripped)
    return hashes


def resolve_wikidata_contents(
    *,
    intermediate: WikidataIntermediate,
    config: WikidataConfig,
    record_hashes: Mapping[str, Sha256Hex],
) -> dict[RelationId, ResolvedCardContent]:
    """Re-derive Wikidata card content through the identifier sanitizer.

    Untitled records render no card and resolve to nothing; the assembly's
    exact-coverage check proves none of them entered the voted deck.

    Raises:
        ValueError: A record renders an identifier leak or lacks its pinned
            row hash.

    """
    counter = make_token_counter(config.cards.tokenizer)
    splitter = make_sentence_splitter(config.cards.sentence_splitter)
    resolved: dict[RelationId, ResolvedCardContent] = {}
    for record in intermediate.records:
        card = build_wikidata_card(
            record=record,
            labels=intermediate.entity_labels,
            known_identifiers=intermediate.excluded,
            config=config,
            counter=counter,
            splitter=splitter,
        )
        if card is None:
            continue
        record_hash = record_hashes.get(record.pid)
        if record_hash is None:
            raise ValueError(f"record {record.pid} carries no pinned row hash")
        identity = f"{WIKIDATA_ENTITY_URL_PREFIX}{record.pid}"
        slug = card.card_input.slug
        # The voted-vintage records carry the single ``inverse_pid`` fact;
        # later extractions add the full ``p1696_inverse_pids`` list. The
        # union is every inverse fact this record vintage asserts.
        inverse_pids = {*record.p1696_inverse_pids}
        if record.inverse_pid is not None:
            inverse_pids.add(record.inverse_pid)
        resolved[qualify_relation_id("wikidata", record.pid)] = ResolvedCardContent(
            source="wikidata",
            identity=identity,
            base_url=identity,
            publisher="wikidata",
            inverse_of=tuple(
                sorted(
                    f"{WIKIDATA_ENTITY_URL_PREFIX}{inverse_pid}"
                    for inverse_pid in inverse_pids
                    if inverse_pid != record.pid
                )
            ),
            retrieved_at=record.retrieved_at,
            source_record_hash=record_hash,
            slug=slug if slug is not None else slugify(card.card_input.title),
            card_input=card.card_input,
            rendered_card_hash=card.card_hash,
        )
    return resolved


def _bound_source(
    sources: Mapping[str, ConcatSource],
    *,
    namespace: str,
    manifest_path: Path,
    manifest_content_hash: Sha256Hex,
) -> None:
    """Bind a source-card manifest to the deck by exact card content.

    Binding is by ``cards.jsonl`` content hash, not manifest envelope hash:
    the lineage backfill re-emitted manifests around unchanged card bytes,
    so envelope identity differs while the card population is exact. A
    manifest claiming this content with a different rendering config still
    fails the per-card re-render round-trip.
    """
    source = sources.get(namespace)
    if source is None:
        raise ValueError(f"the deck records no {namespace} source")
    if source.cards_hash != manifest_content_hash:
        raise ValueError(
            f"{manifest_path} does not describe the deck's exact {namespace} card content"
        )


def _bound_input(
    manifest_path: Path,
    input_hashes: Mapping[str, Sha256Hex] | None,
    *,
    name: str,
    path: Path,
) -> Sha256Hex:
    if input_hashes is None or name not in input_hashes:
        raise ValueError(f"{manifest_path} records no {name} input hash")
    recorded = input_hashes[name]
    actual = sha256_file(path)
    if actual != recorded:
        raise ValueError(f"{path} does not match the {name} hash recorded in {manifest_path}")
    return recorded


def export_annotation_corpus(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
    hash_cards_directory: Path,
    wikidata_records_directory: Path,
    wikidata_cards_directory: Path,
    family_closure_directory: Path,
    output_path: Path,
) -> AnnotationCorpusArtifact:
    """Export the ``atlas-annotation-corpus/1`` document from verified artifacts.

    The completed-grid loader proves journal, corpus, deck, and manifest
    agreement; the family closure and card-source manifests bind to the same
    deck by hash; content re-derivation proves every exported field feeds
    the exact voted rendering.

    Raises:
        ValueError: Any artifact fails verification or cross-artifact
            binding, or the assembled document violates the wire contract.
        OSError: An input cannot be read or the output cannot be published.

    """
    completed = load_completed_grid(
        run_directory=run_directory,
        cards_directory=cards_directory,
        config_path=config_path,
    )
    deck = completed.prepared.deck
    concat = verify_concat_artifact(cards_directory)
    if concat.cards_hash != deck.source_hashes["cards.jsonl"]:
        raise ValueError("the concat artifact and the evaluation deck do not share one cards.jsonl")
    closure = verify_family_closure(family_closure_directory)
    if closure.manifest.details.concat.cards_hash != concat.cards_hash:
        raise ValueError("the family closure was computed over a different card population")

    hash_manifest_path = hash_cards_directory / "cards.manifest.json"
    hash_manifest = HashCardsProvenance.load(hash_manifest_path)
    _bound_source(
        concat.provenance.details.sources,
        namespace="hash",
        manifest_path=hash_manifest_path,
        manifest_content_hash=(hash_manifest.content_hashes or {}).get("cards.jsonl", ""),
    )
    link_types_path = hash_cards_directory / "link-types.jsonl"
    link_types_hash = _bound_input(
        hash_manifest_path,
        hash_manifest.input_hashes,
        name="link-types.jsonl",
        path=link_types_path,
    )
    if hash_manifest.config is None:
        raise ValueError(f"{hash_manifest_path} records no rendering config")

    wikidata_manifest_path = wikidata_cards_directory / "cards.manifest.json"
    wikidata_manifest = CardsManifestProvenance.load(wikidata_manifest_path)
    _bound_source(
        concat.provenance.details.sources,
        namespace="wikidata",
        manifest_path=wikidata_manifest_path,
        manifest_content_hash=(wikidata_manifest.content_hashes or {}).get("cards.jsonl", ""),
    )
    intermediate = load_wikidata_intermediate(wikidata_records_directory)
    records_hash = _bound_input(
        wikidata_manifest_path,
        wikidata_manifest.input_hashes,
        name="records.jsonl",
        path=intermediate.records_path,
    )
    if wikidata_manifest.config is None:
        raise ValueError(f"{wikidata_manifest_path} records no rendering config")

    resolved = resolve_hash_contents(
        link_types_path=link_types_path,
        config=hash_manifest.config,
    )
    resolved.update(
        resolve_wikidata_contents(
            intermediate=intermediate,
            config=wikidata_manifest.config,
            record_hashes=_record_line_hashes(intermediate.records_path),
        )
    )
    resolved = {
        relation_id: content
        for relation_id, content in resolved.items()
        if relation_id in deck.by_relation_id
    }

    for card in raw_concat_cards(deck.cards_path):
        if card.producer != "hash":
            continue
        recorded = card_versioned_url(card)
        derived = resolved[card.relation_id].identity
        if recorded != derived:
            raise ValueError(
                f"{card.relation_id}: deck versioned URL {recorded} differs from the "
                f"link-type record's {derived}"
            )

    votes = (*completed.prepared.pilot_import.votes, *completed.journal.votes)
    sources = {
        "cards.jsonl": deck.source_hashes["cards.jsonl"],
        "cards.manifest.json": deck.source_hashes["cards.manifest.json"],
        "grid-manifest.json": sha256_file(run_directory / "manifest.json"),
        "corpus.jsonl": completed.manifest.source_hashes["corpus.jsonl"],
        "votes.jsonl": completed.manifest.source_hashes["votes.jsonl"],
        "imported-votes.jsonl": completed.manifest.source_hashes["imported-votes.jsonl"],
        "link-types.jsonl": link_types_hash,
        "hash-cards.manifest.json": sha256_file(hash_manifest_path),
        "records.jsonl": records_hash,
        "entity_labels.json": intermediate.entity_labels_hash,
        "records.meta.json": sha256_file(intermediate.meta_path),
        "wikidata-cards.manifest.json": sha256_file(wikidata_manifest_path),
        "families.jsonl": closure.families_hash,
        "families.manifest.json": closure.manifest_hash,
    }
    document = build_annotation_corpus_document(
        corpus=completed.prepared.corpus,
        deck_cards=deck.by_relation_id,
        resolved_contents=resolved,
        families=closure.by_relation_id,
        votes=votes,
        sources=sources,
    )
    return publish_annotation_corpus(document, output_path=output_path)


def publish_annotation_corpus(
    document: AnnotationCorpusDocument,
    *,
    output_path: Path,
) -> AnnotationCorpusArtifact:
    """Write canonical bytes atomically and describe the published artifact."""
    payload = canonical_json_bytes(document) + b"\n"
    atomic_replace(output_path, payload)
    verdicts = Counter(vote.verdict for card in document.cards for vote in card.votes)
    return AnnotationCorpusArtifact(
        path=output_path,
        content_hash=sha256_bytes(payload),
        card_count=len(document.cards),
        hash_card_count=sum(card.source == "hash" for card in document.cards),
        wikidata_card_count=sum(card.source == "wikidata" for card in document.cards),
        vote_count=sum(len(card.votes) for card in document.cards),
        verdict_counts=dict(sorted(verdicts.items())),
        shot_excluded_count=sum(card.flags.shot_excluded for card in document.cards),
        holdout_count=sum(card.flags.holdout is not None for card in document.cards),
    )


__all__ = [
    "WIKIDATA_ENTITY_URL_PREFIX",
    "AnnotationCorpusArtifact",
    "WikidataIntermediate",
    "export_annotation_corpus",
    "load_wikidata_intermediate",
    "publish_annotation_corpus",
    "resolve_hash_contents",
    "resolve_wikidata_contents",
]
