"""Relation cards: deterministic text serializer, token budget, emitters.

Layering (mining is decoupled from card formatting):

1. raw response cache (``cache.py``) — provenance of every API byte;
2. ``records.jsonl`` (``records.py``) — structured, card-format-independent
   property records;
3. ``cards.jsonl`` (this module) — the VERSIONED TEXT PROJECTION of the
   records. ``render_cards`` is a pure records -> cards step with zero
   transport/network involvement, so the card format can change and be
   re-rendered without re-running extraction.

Card format v1 (``card_format_version = 1``)
--------------------------------------------
A card is deterministic labeled TEXT (never JSON), one section per line, in
the atlas-spec priority order. Data-absent sections are simply not rendered;
``omitted_fields`` records only *truncation* losses.

    Relation: <title> (<PID>)
    Description: <description>
    Aliases: <alias>; <alias>; ...
    Inverse: <title> (<PID>) — <description>
    Ancestors: <title> (<PID>) — <description>; ...
    Source types: <title> (<QID>) — <description>; ...
    Destination types: <title> (<QID>) — <description>; ...
    Constraints: symmetric=yes|no; transitive=yes|no; single-value=yes|no; \
distinct-values=yes|no; direction=symmetric|subject->object
    Examples:
    - <subject label> -> <object label>
    Slug: <normalized-en-label>

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

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Protocol

from atlas_tools.common.provenance import (
    provenance_block,
    sha256_bytes,
    sha256_file,
    write_sidecar,
)
from atlas_tools.wikidata import CARD_FORMAT_VERSION
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import PropertyRecord, pid_number
from atlas_tools.wikidata.properties import ExtractionResult
from atlas_tools.wikidata.records import RecordSet, emit_records, load_records


class TokenCounter(Protocol):
    name: str

    def count(self, text: str) -> int: ...


class HeuristicTokenCounter:
    """ceil(len(utf8_bytes) / 4): deterministic, offline, documented above."""

    name = "heuristic"

    def count(self, text: str) -> int:
        return math.ceil(len(text.encode("utf-8")) / 4)


class Cl100kTokenCounter:
    """tiktoken cl100k_base (downloads its BPE file on first use)."""

    name = "cl100k"

    def __init__(self) -> None:
        import tiktoken

        self._encoding = tiktoken.get_encoding("cl100k_base")

    def count(self, text: str) -> int:
        return len(self._encoding.encode(text))


def make_token_counter(name: str) -> TokenCounter:
    if name == "heuristic":
        return HeuristicTokenCounter()
    if name == "cl100k":
        return Cl100kTokenCounter()
    raise ValueError(f"unknown tokenizer {name!r}")


def slugify(label: str) -> str:
    """Normalized URL slug: lowercase, non-alphanumeric runs -> '-'."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def first_sentence(text: str) -> str:
    """Sentence-boundary truncation: first '. '-delimited sentence, with its
    terminal period restored. Never cuts mid-sentence."""
    head, sep, _rest = text.partition(". ")
    return head + "." if sep else text


def _annotated(
    entity_id: str, labels: Mapping[str, tuple[str, str]]
) -> tuple[str, str]:
    """('<title> (<id>)' or '<id>', description) for a referenced entity."""
    label, description = labels.get(entity_id, ("", ""))
    title = f"{label} ({entity_id})" if label else entity_id
    return title, description


def _entity_phrase(
    entity_id: str,
    labels: Mapping[str, tuple[str, str]],
    *,
    truncate_description: bool,
) -> str:
    title, description = _annotated(entity_id, labels)
    if description:
        if truncate_description:
            description = first_sentence(description)
        return f"{title} — {description}"
    return title


@dataclass(frozen=True)
class Card:
    pid: str
    card_text: str
    card_hash: str
    token_count: int
    omitted_fields: tuple[str, ...]
    severely_truncated: bool
    retrieved_at: str | None


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
    labels: Mapping[str, tuple[str, str]],
    config: Config,
    *,
    example_count: int,
    drop_examples_section: bool,
    drop_ancestors_section: bool,
    truncate_ancestors: bool,
    truncate_source_types: bool,
    truncate_destination_types: bool,
) -> str:
    primary = config.languages[0]
    title = record.labels.get(primary, "")
    description = record.descriptions.get(primary, "")
    aliases = record.aliases.get(primary, [])
    constraints = record.constraints

    lines: list[str] = [f"Relation: {title} ({record.pid})"]
    if description:
        lines.append(f"Description: {description}")
    if aliases:
        lines.append("Aliases: " + "; ".join(aliases))
    if record.inverse_pid:
        lines.append(
            "Inverse: "
            + _entity_phrase(record.inverse_pid, labels, truncate_description=False)
        )
    if record.ancestors and not drop_ancestors_section:
        lines.append(
            "Ancestors: "
            + "; ".join(
                _entity_phrase(pid, labels, truncate_description=truncate_ancestors)
                for pid in record.ancestors
            )
        )
    if constraints.subject_types:
        lines.append(
            "Source types: "
            + "; ".join(
                _entity_phrase(qid, labels, truncate_description=truncate_source_types)
                for qid in constraints.subject_types
            )
        )
    if constraints.value_types:
        lines.append(
            "Destination types: "
            + "; ".join(
                _entity_phrase(
                    qid, labels, truncate_description=truncate_destination_types
                )
                for qid in constraints.value_types
            )
        )

    def yn(flag: bool) -> str:
        return "yes" if flag else "no"

    direction = "symmetric" if constraints.symmetric else "subject->object"
    lines.append(
        f"Constraints: symmetric={yn(constraints.symmetric)};"
        f" transitive={yn(constraints.transitive)};"
        f" single-value={yn(constraints.single_value)};"
        f" distinct-values={yn(constraints.distinct_values)};"
        f" direction={direction}"
    )
    if record.examples and not drop_examples_section and example_count > 0:
        lines.append("Examples:")
        for example in record.examples[:example_count]:
            lines.append(f"- {example.subject_label} -> {example.object_label}")
    lines.append(f"Slug: {slugify(title)}")
    return "\n".join(lines) + "\n"


def build_card(
    record: PropertyRecord,
    labels: Mapping[str, tuple[str, str]],
    config: Config,
    counter: TokenCounter,
) -> Card:
    """Serialize one card, applying the deterministic truncation algorithm."""
    total_examples = len(record.examples)
    state = _TruncationState(example_count=total_examples)
    omitted: list[str] = []

    def render() -> str:
        return _render(
            record,
            labels,
            config,
            example_count=state.example_count,
            drop_examples_section=state.drop_examples_section,
            drop_ancestors_section=state.drop_ancestors_section,
            truncate_ancestors=state.truncate_ancestors,
            truncate_source_types=state.truncate_source_types,
            truncate_destination_types=state.truncate_destination_types,
        )

    text = render()
    count = counter.count(text)

    # (a) drop examples from the end, lowest diversity rank first.
    while count > config.token_budget and state.example_count > 0:
        state.example_count -= 1
        omitted.append(f"example[{state.example_count}]")
        text = render()
        count = counter.count(text)

    # (b) sentence-boundary truncation, in priority order.
    for flag, name in (
        ("truncate_ancestors", "ancestor_descriptions_truncated"),
        ("truncate_source_types", "source_type_descriptions_truncated"),
        ("truncate_destination_types", "destination_type_descriptions_truncated"),
    ):
        if count <= config.token_budget:
            break
        setattr(state, flag, True)
        new_text = render()
        if new_text != text:
            omitted.append(name)
        text = new_text
        count = counter.count(text)

    # Hard budget: drop example + ancestor sections entirely, nothing else.
    severely_truncated = False
    if count > config.hard_token_budget:
        severely_truncated = True
        if record.examples:
            state.drop_examples_section = True
            omitted.append("examples_section")
        if record.ancestors:
            state.drop_ancestors_section = True
            omitted.append("ancestors_section")
        text = render()
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
) -> dict[str, Path]:
    """Render cards.jsonl + cards.manifest.json from a loaded record set.

    Pure projection: records + config in, cards out. No transport or network
    involvement of any kind, and NO embedding calls (embedding is a
    separate, budgeted step outside this tool). The manifest records the
    records.jsonl content hash as an input hash.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    counter = make_token_counter(config.tokenizer)
    meta = record_set.meta

    cards = [
        build_card(record, record_set.entity_labels, config, counter)
        for record in record_set.records
    ]
    cards.sort(key=lambda card: pid_number(card.pid))

    cards_path = out_dir / "cards.jsonl"
    with open(cards_path, "w", encoding="utf-8") as f:
        for card in cards:
            f.write(
                json.dumps(
                    {
                        "pid": card.pid,
                        "card_text": card.card_text,
                        "card_hash": card.card_hash,
                        "token_count": card.token_count,
                        "omitted_fields": list(card.omitted_fields),
                        "severely_truncated": card.severely_truncated,
                        "retrieved_at": card.retrieved_at,
                    },
                    sort_keys=True,
                    separators=(",", ":"),
                    ensure_ascii=False,
                )
                + "\n"
            )

    manifest_path = out_dir / "cards.manifest.json"
    manifest = {
        "card_format_version": CARD_FORMAT_VERSION,
        "card_hash_canonicalization": "utf-8 bytes of card_text",
        "tokenizer": counter.name,
        "token_budget": config.token_budget,
        "hard_token_budget": config.hard_token_budget,
        # API-snapshot date stands in for a dump SHA in W2a (no dump).
        "api_snapshot_date": meta.get("api_snapshot_date", ""),
        "cards": {
            card.pid: {
                "card_hash": card.card_hash,
                "token_count": card.token_count,
                "severely_truncated": card.severely_truncated,
            }
            for card in cards
        },
        "counts": {
            "inventory_rows": meta["counts"]["inventory_rows"],
            "excluded": meta["counts"]["excluded"],
            "cards": len(cards),
            "example_skips": meta["counts"]["example_skips"],
        },
        "flags": meta["flags"],
        "excluded": meta["excluded"],
        **provenance_block(
            producer="wikidata.render-cards",
            input_hashes={"records.jsonl": sha256_file(record_set.records_path)},
            config=config.raw,
            seed=config.seed,
        ),
    }
    write_sidecar(manifest_path, manifest)

    return {"cards": cards_path, "manifest": manifest_path}


def emit_cards(
    result: ExtractionResult,
    config: Config,
    out_dir: Path | str,
) -> dict[str, Path]:
    """Extraction-side emitter: persist the structured intermediate
    (records.jsonl + entity_labels.json + records.meta.json + inventory.json)
    and then render cards through the SAME load+render path that the
    ``render-cards`` CLI command uses — there is a single code path for card
    emission.
    """
    out_dir = Path(out_dir)
    record_paths = emit_records(result, config, out_dir)
    card_paths = render_cards(load_records(out_dir), config, out_dir)
    return {**record_paths, **card_paths}
