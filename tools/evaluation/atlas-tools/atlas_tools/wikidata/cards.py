"""Relation cards: deterministic text serializer, token budget, emitters.

Layering (mining is decoupled from card formatting):

1. raw response cache (``cache.py``) — provenance of every API byte;
2. ``records.jsonl`` (``records.py``) — structured, card-format-independent
   property records;
3. ``cards.jsonl`` (this module) — the VERSIONED TEXT PROJECTION of the
   records. ``render_cards`` is a pure records -> cards step with zero
   transport/network involvement, so the card format can change and be
   re-rendered without re-running extraction.

Card format v2 (``card_format_version = 2``)
--------------------------------------------
A card is deterministic labeled TEXT (never JSON), one section per line, in
the atlas-spec priority order. Data-absent sections are simply not rendered;
``omitted_fields`` records only *truncation* losses.

    Relation: <title>
    Description: <description>
    Aliases: <alias>; <alias>; ...
    Inverse: <label> — <description>
    Ancestors: <label> — <description>; ...
    Source types: <label> — <description>; ...
    Destination types: <label> — <description>; ...
    Constraints: symmetric=yes|no; transitive=yes|no; single-value=yes|no; \
distinct-values=yes|no; direction=symmetric|subject->object
    Examples:
    - <subject label> -> <object label>
    Slug: <normalized-en-label>

v2 vs v1: Wikidata identifiers (PIDs/QIDs) are STRIPPED from card text.
The card text is the embedding input for the relation-policy classifier;
at inference time cards are built from ontologies where Wikidata ids do
not exist, so ids are a non-transferable lexical feature and a leakage
channel (train/inference distribution mismatch). References whose label is
EMPTY are dropped from the text entirely — a bare QID carries no
transferable signal — and a section whose references are all unlabeled is
omitted (data absence, not truncation: ``omitted_fields`` is unaffected).
The ``pid`` remains in the JSONL row and manifest as linkage metadata; it
is never embedded.

The serializer is a pure function of (PropertyRecord, label map, Config).
``card_hash`` = sha256 of the canonical serialization, defined as the UTF-8
bytes of the card text (which ends with a single trailing newline).

Token counting
--------------
Pluggable ``TokenCounter``; the manifest records which one was used.

- ``cl100k`` (production default): tiktoken cl100k_base as a budget proxy.
  It downloads its BPE file on first use, so tests never select it.
- ``heuristic`` (tests/offline): ``tokens = ceil(len(utf8_bytes) / 4)`` — the
  standard "~4 bytes per token" approximation. Deterministic and documented.

Truncation (deterministic)
--------------------------
While over ``token_budget``:

(a) drop examples from the END (lowest diversity rank first; the sampler
    ordered them most-diverse-first at collection time); each drop is
    recorded as ``example[<rank>]``;
(b) then sentence-boundary truncate descriptions (split on ". ", keep the
    first sentence) in priority order: ancestors, then source types, then
    destination types; recorded as ``<section>_descriptions_truncated``.

Identifiers, titles, and structural flags are never truncated mid-field;
the title, description, inverse, and endpoint-type summaries are never
dropped. If the card still exceeds ``hard_token_budget`` after (a)+(b), the
Examples and Ancestors sections are dropped entirely (recorded as
``examples_section`` / ``ancestors_section``).

``severely_truncated`` is True iff the card exceeded the hard budget (rule
above) OR more than 50% of the collected examples were dropped.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, NonNegativeInt

from atlas_tools.common.provenance import (
    Provenance,
    canonical_json_bytes,
    sha256_bytes,
    sha256_file,
)
from atlas_tools.wikidata import CARD_FORMAT_VERSION
from atlas_tools.wikidata.config import Config, TokenizerName
from atlas_tools.wikidata.model import EntityLabel, PropertyRecord, pid_number
from atlas_tools.wikidata.properties import ExtractionResult
from atlas_tools.wikidata.records import (
    LadderFlags,
    RecordSet,
    RecordsPaths,
    emit_records,
    load_records,
)


class TokenCounter(Protocol):
    @property
    def name(self) -> TokenizerName: ...

    def count(self, text: str) -> int: ...


class HeuristicTokenCounter:
    """ceil(len(utf8_bytes) / 4): deterministic, offline, documented above."""

    name: TokenizerName = "heuristic"

    def count(self, text: str) -> int:
        return math.ceil(len(text.encode("utf-8")) / 4)


class Cl100kTokenCounter:
    """tiktoken cl100k_base (downloads its BPE file on first use)."""

    name: TokenizerName = "cl100k"

    def __init__(self) -> None:
        import tiktoken

        self._encoding = tiktoken.get_encoding("cl100k_base")

    def count(self, text: str) -> int:
        return len(self._encoding.encode(text))


def make_token_counter(name: TokenizerName) -> TokenCounter:
    match name:
        case "heuristic":
            return HeuristicTokenCounter()
        case "cl100k":
            return Cl100kTokenCounter()


def slugify(label: str) -> str:
    """Normalized URL slug: lowercase, non-alphanumeric runs -> '-'."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def first_sentence(text: str) -> str:
    """Sentence-boundary truncation: first '. '-delimited sentence, with its
    terminal period restored. Never cuts mid-sentence."""
    head, sep, _rest = text.partition(". ")
    return head + "." if sep else text


def _entity_phrase(
    entity_id: str,
    labels: Mapping[str, EntityLabel],
    *,
    truncate_description: bool,
) -> str | None:
    """``<label> — <description>`` for a referenced entity, or None for an
    unlabeled reference (bare Wikidata ids never reach card text; v2)."""
    entry = labels.get(entity_id, EntityLabel())
    if not entry.label:
        return None
    if entry.description:
        description = (
            first_sentence(entry.description)
            if truncate_description
            else entry.description
        )
        return f"{entry.label} — {description}"
    return entry.label


def _entity_phrases(
    entity_ids: tuple[str, ...],
    labels: Mapping[str, EntityLabel],
    *,
    truncate_description: bool,
) -> list[str]:
    """Phrases for the labeled references, in order; unlabeled ones drop."""
    return [
        phrase
        for entity_id in entity_ids
        if (
            phrase := _entity_phrase(
                entity_id, labels, truncate_description=truncate_description
            )
        )
        is not None
    ]


@dataclass(frozen=True)
class Card:
    pid: str
    card_text: str
    card_hash: str
    token_count: int
    omitted_fields: tuple[str, ...]
    severely_truncated: bool
    retrieved_at: str | None


class CardRow(BaseModel):
    """One cards.jsonl line (written as canonical JSON)."""

    pid: str
    card_text: str
    card_hash: str
    token_count: NonNegativeInt
    omitted_fields: list[str]
    severely_truncated: bool
    retrieved_at: str | None


class CardEntry(BaseModel):
    card_hash: str
    token_count: NonNegativeInt
    severely_truncated: bool


class CardsCounts(BaseModel):
    inventory_rows: NonNegativeInt
    excluded: NonNegativeInt
    cards: NonNegativeInt
    example_skips: NonNegativeInt


class CardsManifestDetails(BaseModel):
    """Details of the cards.jsonl projection; the records.jsonl input hash
    lives in the envelope's ``input_hashes``."""

    card_format_version: int
    card_hash_canonicalization: str
    tokenizer: TokenizerName
    token_budget: int
    hard_token_budget: int
    # API-snapshot date stands in for a dump SHA in W2a (no dump).
    api_snapshot_date: str
    cards: dict[str, CardEntry]
    counts: CardsCounts
    flags: LadderFlags
    excluded: dict[str, str]


# The rendering config is the FULL config (card-format keys included here,
# unlike the records envelope: they change the projection).
CardsManifestProvenance = Provenance[CardsManifestDetails, Config]


@dataclass(frozen=True)
class CardsPaths:
    """Locations of the files written by :func:`render_cards`."""

    cards_jsonl: Path
    manifest: Path


@dataclass(frozen=True)
class ExtractPaths:
    """Everything :func:`emit_cards` writes: intermediate + projection."""

    records: RecordsPaths
    cards: CardsPaths


@dataclass
class _TruncationState:
    example_count: int
    drop_examples_section: bool = False
    drop_ancestors_section: bool = False
    truncate_ancestors: bool = False
    truncate_source_types: bool = False
    truncate_destination_types: bool = False


def _render(
    record: PropertyRecord,
    labels: Mapping[str, EntityLabel],
    config: Config,
    state: _TruncationState,
) -> str:
    primary = config.extraction.primary_language
    title = record.labels.get(primary, "")
    description = record.descriptions.get(primary, "")
    aliases = record.aliases.get(primary, [])
    constraints = record.constraints

    # v2: no Wikidata identifiers anywhere in card text; unlabeled
    # references are dropped, and a section with no labeled references is
    # omitted (data absence, never recorded in omitted_fields).
    lines: list[str] = [f"Relation: {title}"]
    if description:
        lines.append(f"Description: {description}")
    if aliases:
        lines.append("Aliases: " + "; ".join(aliases))
    if record.inverse_pid:
        inverse_phrase = _entity_phrase(
            record.inverse_pid, labels, truncate_description=False
        )
        if inverse_phrase is not None:
            lines.append("Inverse: " + inverse_phrase)
    if record.ancestors and not state.drop_ancestors_section:
        ancestor_phrases = _entity_phrases(
            record.ancestors, labels, truncate_description=state.truncate_ancestors
        )
        if ancestor_phrases:
            lines.append("Ancestors: " + "; ".join(ancestor_phrases))
    source_phrases = _entity_phrases(
        constraints.subject_types,
        labels,
        truncate_description=state.truncate_source_types,
    )
    if source_phrases:
        lines.append("Source types: " + "; ".join(source_phrases))
    destination_phrases = _entity_phrases(
        constraints.value_types,
        labels,
        truncate_description=state.truncate_destination_types,
    )
    if destination_phrases:
        lines.append("Destination types: " + "; ".join(destination_phrases))

    def yes_no(flag: bool) -> str:
        return "yes" if flag else "no"

    direction = "symmetric" if constraints.symmetric else "subject->object"
    lines.append(
        f"Constraints: symmetric={yes_no(constraints.symmetric)};"
        f" transitive={yes_no(constraints.transitive)};"
        f" single-value={yes_no(constraints.single_value)};"
        f" distinct-values={yes_no(constraints.distinct_values)};"
        f" direction={direction}"
    )
    if record.examples and not state.drop_examples_section and state.example_count > 0:
        lines.append("Examples:")
        for example in record.examples[: state.example_count]:
            lines.append(f"- {example.subject_label} -> {example.object_label}")
    lines.append(f"Slug: {slugify(title)}")
    return "\n".join(lines) + "\n"


def build_card(
    record: PropertyRecord,
    labels: Mapping[str, EntityLabel],
    config: Config,
    counter: TokenCounter,
) -> Card:
    """Serialize one card, applying the deterministic truncation algorithm."""
    budgets = config.cards
    total_examples = len(record.examples)
    state = _TruncationState(example_count=total_examples)
    omitted: list[str] = []

    text = _render(record, labels, config, state)
    count = counter.count(text)

    # (a) drop examples from the end, lowest diversity rank first.
    while count > budgets.token_budget and state.example_count > 0:
        state.example_count -= 1
        omitted.append(f"example[{state.example_count}]")
        text = _render(record, labels, config, state)
        count = counter.count(text)

    # (b) sentence-boundary truncation, in priority order.
    for flag, name in (
        ("truncate_ancestors", "ancestor_descriptions_truncated"),
        ("truncate_source_types", "source_type_descriptions_truncated"),
        ("truncate_destination_types", "destination_type_descriptions_truncated"),
    ):
        if count <= budgets.token_budget:
            break
        setattr(state, flag, True)
        new_text = _render(record, labels, config, state)
        if new_text != text:
            omitted.append(name)
        text = new_text
        count = counter.count(text)

    # Hard budget: drop example + ancestor sections entirely, nothing else.
    severely_truncated = False
    if count > budgets.hard_token_budget:
        severely_truncated = True
        if record.examples:
            state.drop_examples_section = True
            omitted.append("examples_section")
        if record.ancestors:
            state.drop_ancestors_section = True
            omitted.append("ancestors_section")
        text = _render(record, labels, config, state)
        count = counter.count(text)

    dropped = total_examples - state.example_count
    if total_examples > 0 and dropped * 2 > total_examples:
        severely_truncated = True

    return Card(
        pid=record.pid,
        card_text=text,
        card_hash=sha256_bytes(text.encode("utf-8")),
        token_count=count,
        omitted_fields=tuple(omitted),
        severely_truncated=severely_truncated,
        retrieved_at=record.retrieved_at,
    )


def render_cards(
    record_set: RecordSet,
    config: Config,
    out_dir: Path | str,
) -> CardsPaths:
    """Render cards.jsonl + cards.manifest.json from a loaded record set.

    Pure projection: records + config in, cards out. No transport or network
    involvement of any kind, and NO embedding calls (embedding is a
    separate, budgeted step outside this tool). The manifest records the
    records.jsonl content hash as an input hash.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    counter = make_token_counter(config.cards.tokenizer)
    meta = record_set.meta

    cards = [
        build_card(record, record_set.entity_labels, config, counter)
        for record in record_set.records
    ]
    cards.sort(key=lambda card: pid_number(card.pid))

    cards_path = out_dir / "cards.jsonl"
    with open(cards_path, "w", encoding="utf-8") as f:
        for card in cards:
            row = CardRow(
                pid=card.pid,
                card_text=card.card_text,
                card_hash=card.card_hash,
                token_count=card.token_count,
                omitted_fields=list(card.omitted_fields),
                severely_truncated=card.severely_truncated,
                retrieved_at=card.retrieved_at,
            )
            f.write(canonical_json_bytes(row).decode("utf-8") + "\n")

    manifest_path = out_dir / "cards.manifest.json"
    CardsManifestProvenance.make(
        producer="wikidata.render-cards",
        input_hashes={"records.jsonl": sha256_file(record_set.records_path)},
        config=config,
        seed=config.extraction.seed,
        details=CardsManifestDetails(
            card_format_version=CARD_FORMAT_VERSION,
            card_hash_canonicalization="utf-8 bytes of card_text",
            tokenizer=counter.name,
            token_budget=config.cards.token_budget,
            hard_token_budget=config.cards.hard_token_budget,
            api_snapshot_date=meta.details.api_snapshot_date,
            cards={
                card.pid: CardEntry(
                    card_hash=card.card_hash,
                    token_count=card.token_count,
                    severely_truncated=card.severely_truncated,
                )
                for card in cards
            },
            counts=CardsCounts(
                inventory_rows=meta.details.counts.inventory_rows,
                excluded=meta.details.counts.excluded,
                cards=len(cards),
                example_skips=meta.details.counts.example_skips,
            ),
            flags=meta.details.flags,
            excluded=meta.details.excluded,
        ),
    ).write(manifest_path)

    return CardsPaths(cards_jsonl=cards_path, manifest=manifest_path)


def emit_cards(
    result: ExtractionResult,
    config: Config,
    out_dir: Path | str,
) -> ExtractPaths:
    """Extraction-side emitter: persist the structured intermediate
    (records.jsonl + entity_labels.json + records.meta.json + inventory.json)
    and then render cards through the SAME load+render path that the
    ``render-cards`` CLI command uses — there is a single code path for card
    emission.
    """
    out_dir = Path(out_dir)
    records_paths = emit_records(result, config, out_dir)
    cards_paths = render_cards(load_records(out_dir), config, out_dir)
    return ExtractPaths(records=records_paths, cards=cards_paths)
