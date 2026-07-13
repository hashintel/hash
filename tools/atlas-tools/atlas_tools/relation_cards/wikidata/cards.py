"""Corpus emission for Wikidata relation cards and their manifest.

Layering (mining is decoupled from card formatting):

1. raw response cache (``cache.py``): provenance of every API byte;
2. ``records.jsonl`` (``records.py``): structured, card-format-independent
   property records;
3. ``relation_cards.common``: the datasource-neutral text projection and
   truncation passes; ``relation_cards.wikidata.card`` adapts one property;
4. ``cards.jsonl`` (this module): corpus emission: iterate the record set,
   build each card, and write the JSONL corpus plus its provenance
   manifest. ``render_cards`` is a pure records -> cards step with zero
   transport/network involvement, so the card format can change and be
   re-rendered without re-running extraction.

Records without a primary-language title produce no card (nothing
embeddable); they are counted and listed in the manifest instead of being
silently dropped.

``card_hash`` is the sha256 of the UTF-8 bytes of the card text. No
embedding calls happen anywhere here: embedding is a separate, budgeted
step outside this tool.
"""

from dataclasses import dataclass
from os import PathLike
from pathlib import Path

from pydantic import BaseModel, NonNegativeInt

from atlas_tools.common.data import Sha256Hex
from atlas_tools.common.provenance import (
    Provenance,
    canonical_json_bytes,
    sha256_file,
)
from atlas_tools.relation_cards.common import CARD_FORMAT_VERSION
from atlas_tools.relation_cards.common.card import IdentifierLeakError
from atlas_tools.relation_cards.common.cards import CardRow
from atlas_tools.relation_cards.common.config import SentenceSplitterName, TokenizerName
from atlas_tools.relation_cards.common.sentence import make_sentence_splitter
from atlas_tools.relation_cards.common.tokens import make_token_counter
from atlas_tools.relation_cards.wikidata.card import (
    Card,
    ProseSanitizationSummary,
    build_card,
)
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Pid, entity_number
from atlas_tools.wikidata.properties import ExtractionResult
from atlas_tools.wikidata.records import (
    LadderFlags,
    RecordSet,
    RecordsPaths,
    emit_records,
    load_records,
)


class WikidataCardRow(CardRow):
    """One cards.jsonl line (written as canonical JSON)."""

    pid: Pid

    retrieved_at: str | None


class CardEntry(BaseModel):
    card_hash: Sha256Hex
    token_count: NonNegativeInt
    severely_truncated: bool
    sanitization: ProseSanitizationSummary = ProseSanitizationSummary()


class CardsCounts(BaseModel):
    inventory_rows: NonNegativeInt
    excluded: NonNegativeInt
    cards: NonNegativeInt
    example_skips: NonNegativeInt
    untitled: NonNegativeInt


class ProseSanitizationBudgetError(ValueError):
    """Prose sanitization emptied too large a fraction of prose fields.

    The overfilter tripwire: an emptied field means every sentence of
    some description carried a confirmed identifier, so nothing sayable
    survived. Legitimate for pure editor-routing prose, alarming at
    volume. The manifest's ``prose_sanitization.dropped_tokens``
    histogram is the triage list (``unknown_tokens`` lists id-shaped
    prose that was deliberately left alone).
    """


class CardsManifestDetails(BaseModel):
    """Details of the cards.jsonl projection.

    The records.jsonl input hash lives in the envelope's ``input_hashes``.
    """

    card_format_version: int
    card_hash_canonicalization: str
    tokenizer: TokenizerName
    sentence_splitter: SentenceSplitterName
    token_budget: int
    hard_token_budget: int
    # The API miner reads no dump, so the API-snapshot date stands in for
    # a dump SHA here.
    api_snapshot_date: str
    cards: dict[str, CardEntry]
    counts: CardsCounts
    flags: LadderFlags
    excluded: dict[str, str]
    # Records with no primary-language title: skipped, never embedded.
    untitled: list[str]
    # Corpus-wide prose-sanitization totals (per-card detail lives on each
    # CardEntry). fields_emptied / fields_sanitized is guarded against
    # cards.max_prose_field_empty_fraction at render time.
    prose_sanitization: ProseSanitizationSummary = ProseSanitizationSummary()


# The rendering config is the full config: card-format keys change the
# projection, so unlike the records envelope they belong in this hash.
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


def render_cards(
    record_set: RecordSet,
    config: Config,
    out_dir: PathLike,
) -> CardsPaths:
    """Render cards.jsonl + cards.manifest.json from a loaded record set.

    Pure projection: records + config in, cards out. No transport or network
    involvement of any kind. The manifest records the records.jsonl content
    hash as an input hash.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    counter = make_token_counter(config.cards.tokenizer)
    splitter = make_sentence_splitter(config.cards.sentence_splitter)
    meta = record_set.meta
    # PIDs the extraction saw but did not retain (external-ID,
    # maintenance, deprecated): known identifiers without labels, so
    # prose mentioning them is confirmed cross-reference, not guesswork.
    excluded_pids = frozenset(meta.details.excluded)

    cards: list[Card] = []
    untitled: list[Pid] = []
    for record in record_set.records:
        try:
            card = build_card(
                record=record,
                labels=record_set.entity_labels,
                known_identifiers=excluded_pids,
                config=config,
                counter=counter,
                splitter=splitter,
            )
        except IdentifierLeakError as error:
            # The linter has no record context; a corpus-stopping failure
            # must name the card that caused it.
            raise IdentifierLeakError(f"{record.pid}: {error}") from error
        if card is None:
            untitled.append(record.pid)
        else:
            cards.append(card)

    cards.sort(key=lambda card: entity_number(card.pid))
    untitled.sort(key=entity_number)

    sanitization = ProseSanitizationSummary.merge(card.sanitization for card in cards)
    if sanitization.empty_fraction > config.cards.max_prose_field_empty_fraction:
        raise ProseSanitizationBudgetError(
            f"prose sanitization emptied {sanitization.fields_emptied} of"
            f" {sanitization.fields_sanitized} prose fields"
            f" ({sanitization.empty_fraction:.1%}), over the configured bound of"
            f" {config.cards.max_prose_field_empty_fraction:.1%};"
            f" triage the dropped tokens: {sanitization.dropped_tokens}"
        )

    cards_path = out_dir / "cards.jsonl"
    with cards_path.open("w", encoding="utf-8") as cards_file:
        for card in cards:
            row = WikidataCardRow(
                pid=card.pid,
                card_text=card.card_text,
                card_hash=card.card_hash,
                token_count=card.token_count,
                truncations=list(card.truncations),
                severely_truncated=card.severely_truncated,
                retrieved_at=card.retrieved_at,
            )
            cards_file.write(canonical_json_bytes(row).decode("utf-8") + "\n")

    content_hashes = {
        "cards.jsonl": sha256_file(cards_path),
    }

    manifest_path = out_dir / "cards.manifest.json"
    CardsManifestProvenance.make(
        producer="wikidata.render-cards",
        input_hashes={"records.jsonl": sha256_file(record_set.records_path)},
        content_hashes=content_hashes,
        config=config,
        seed=config.extraction.seed,
        details=CardsManifestDetails(
            card_format_version=CARD_FORMAT_VERSION,
            card_hash_canonicalization="utf-8 bytes of card_text",
            tokenizer=counter.name,
            sentence_splitter=splitter.name,
            token_budget=config.cards.token_budget,
            hard_token_budget=config.cards.hard_token_budget,
            api_snapshot_date=meta.details.api_snapshot_date,
            cards={
                card.pid: CardEntry(
                    card_hash=card.card_hash,
                    token_count=card.token_count,
                    severely_truncated=card.severely_truncated,
                    sanitization=card.sanitization,
                )
                for card in cards
            },
            counts=CardsCounts(
                inventory_rows=meta.details.counts.inventory_rows,
                excluded=meta.details.counts.excluded,
                cards=len(cards),
                example_skips=meta.details.counts.example_skips,
                untitled=len(untitled),
            ),
            flags=meta.details.flags,
            excluded=meta.details.excluded,
            untitled=list(untitled),
            prose_sanitization=sanitization,
        ),
    ).write(manifest_path)

    return CardsPaths(cards_jsonl=cards_path, manifest=manifest_path)


def emit_cards(
    result: ExtractionResult,
    config: Config,
    out_dir: PathLike,
) -> ExtractPaths:
    """Persist the structured intermediate, then render cards from it.

    The intermediate is records.jsonl + entity_labels.json +
    records.meta.json + inventory.json. Rendering goes through the same
    load-and-render path that the ``render-cards`` CLI command uses, so
    there is a single code path for card emission.
    """
    out_dir = Path(out_dir)
    records_paths = emit_records(result, config, out_dir)
    cards_paths = render_cards(load_records(out_dir), config, out_dir)

    return ExtractPaths(records=records_paths, cards=cards_paths)
