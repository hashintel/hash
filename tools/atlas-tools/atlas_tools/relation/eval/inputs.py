"""Filesystem-bound loading and preparation for relation evaluation inputs."""

import math
from collections import defaultdict
from collections.abc import Iterator, Mapping, Sequence
from os import PathLike
from pathlib import Path
from typing import Literal, assert_never, cast

import yaml
from pydantic import JsonValue, TypeAdapter, ValidationError

from atlas_tools.common import (
    Sha256Hex,
    canonical_json_bytes,
    sha256_bytes,
    sha256_file,
)
from atlas_tools.relation.concat import CONCAT_SCHEMA_VERSION, ConcatProvenance
from atlas_tools.relation.eval.contract import (
    RUN_CONFIG_ADAPTER,
    BundleParts,
    CardCandidate,
    DerivedSlice,
    EvaluationCard,
    LadderPreparedInputs,
    LadderRunConfig,
    LoadedRunConfig,
    PilotRunConfig,
    PreparedInputs,
    RunConfig,
    SliceSamplingConfig,
    VerifiedConcat,
)
from atlas_tools.relation.eval.prompt import (
    FEW_SHOT,
    HOLDOUT,
    PromptPrefix,
    build_prompt_prefix,
    prompt_pack_hash,
)
from atlas_tools.relation.eval.provenance import panel_hash
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    BundleId,
    FramingId,
    ShellId,
    SliceDerivation,
    SliceRow,
)
from atlas_tools.relation_cards.common.cards import RelationId, RelationNamespace

_JSON_VALUE_ADAPTER: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)


def load_run_config(path: str | PathLike[str]) -> LoadedRunConfig:
    """Load a pilot (schema-v3) or ladder (schema-v4) YAML config strictly."""
    config_path = Path(path).resolve()
    try:
        raw = config_path.read_bytes()
        payload = yaml.safe_load(raw.decode("utf-8"))
        json_payload = _JSON_VALUE_ADAPTER.validate_python(payload, strict=True)
        config = RUN_CONFIG_ADAPTER.validate_json(
            canonical_json_bytes(json_payload),
            strict=True,
        )
    except (OSError, TypeError, UnicodeDecodeError, ValidationError, yaml.YAMLError) as error:
        raise ValueError(f"invalid run config {config_path}: {error}") from error

    return LoadedRunConfig(
        path=config_path,
        config=config,
        content_hash=sha256_bytes(raw),
    )


def read_cards(path: Path) -> Iterator[EvaluationCard]:
    """Read and validate non-empty records from a concatenated card JSONL file."""
    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                yield EvaluationCard.model_validate_json(line)
            except ValidationError as error:
                raise ValueError(f"invalid cards.jsonl line {line_number}: {error}") from error


def verify_concat(cards_dir: Path) -> VerifiedConcat:
    """Verify a concat manifest and its bound card content."""
    cards_path = cards_dir / "cards.jsonl"
    manifest_path = cards_dir / "cards.manifest.json"
    if not cards_path.is_file() or not manifest_path.is_file():
        raise ValueError("evaluation requires a concat directory with cards and manifest")
    manifest_bytes = manifest_path.read_bytes()
    provenance = ConcatProvenance.model_validate_json(manifest_bytes)
    if provenance.producer != "relation.concat":
        raise ValueError("evaluation accepts only relation.concat card artifacts")
    if provenance.details.schema_version != CONCAT_SCHEMA_VERSION:
        raise ValueError(f"unsupported concat schema {provenance.details.schema_version}")
    recorded_hash = (provenance.content_hashes or {}).get("cards.jsonl")
    cards_hash = sha256_file(cards_path)
    if recorded_hash != cards_hash:
        raise ValueError("cards.jsonl does not match its concat manifest")
    return VerifiedConcat(
        cards_path=cards_path,
        manifest_path=manifest_path,
        source_hashes={
            "cards.jsonl": cards_hash,
            "cards.manifest.json": sha256_bytes(manifest_bytes),
        },
        row_count=provenance.details.row_count,
        source_namespaces=frozenset(provenance.details.sources),
    )


def _card_candidates(
    cards_path: Path,
    expected_rows: int,
    source_namespaces: set[RelationNamespace],
) -> tuple[list[CardCandidate], set[RelationId]]:
    candidates: list[CardCandidate] = []
    relation_ids: set[RelationId] = set()
    shot_ids = {relation_id for relation_id, _ in FEW_SHOT}
    for card in read_cards(cards_path):
        if card.producer not in source_namespaces:
            raise ValueError(
                f"cards.jsonl relation {card.relation_id} references undeclared source "
                f"{card.producer!r}"
            )
        if card.relation_id in relation_ids:
            raise ValueError(f"cards.jsonl contains duplicate relation_id {card.relation_id}")
        relation_ids.add(card.relation_id)
        if card.relation_id not in shot_ids:
            candidates.append(
                CardCandidate(
                    relation_id=card.relation_id,
                    producer=card.producer,
                    card_hash=card.card_hash,
                    token_count=card.token_count,
                    prescreen_stratum=card.prescreen_stratum,
                    pilot_strata=tuple(sorted(set(card.pilot_strata))),
                )
            )
    if len(relation_ids) != expected_rows:
        raise ValueError(
            f"concat manifest row_count={expected_rows} but cards.jsonl contains "
            f"{len(relation_ids)} rows"
        )
    missing_shots = sorted(shot_ids - relation_ids)
    if missing_shots:
        raise ValueError(f"cards.jsonl is missing qualified few-shot cards: {missing_shots}")
    return candidates, relation_ids


def _length_quartiles(candidates: Sequence[CardCandidate]) -> dict[RelationId, int]:
    ordered = sorted(candidates, key=lambda card: (card.token_count, card.relation_id))
    count = len(ordered)
    return {card.relation_id: min(4, index * 4 // count + 1) for index, card in enumerate(ordered)}


def _sampling_stratum(card: CardCandidate, quartile: int) -> str:
    trouble = ",".join(card.pilot_strata) if card.pilot_strata else "ordinary"
    return f"{card.producer}|{card.prescreen_stratum}|length-q{quartile}|{trouble}"


def _selection_key(
    card: CardCandidate,
    *,
    cards_hash: Sha256Hex,
    sampling_hash: Sha256Hex,
    seed: int,
) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "card_hash": card.card_hash,
                "cards_hash": cards_hash,
                "relation_id": card.relation_id,
                "sampling_config_hash": sampling_hash,
                "seed": seed,
            }
        )
    )


def _apportion(sizes: Mapping[str, int], target: int) -> dict[str, int]:
    quotas = dict.fromkeys(sizes, 0)
    if target >= len(sizes):
        for stratum in sizes:
            quotas[stratum] = 1
    remaining = target - sum(quotas.values())

    while remaining:
        capacities = {
            stratum: size - quotas[stratum]
            for stratum, size in sizes.items()
            if size > quotas[stratum]
        }
        if not capacities:
            break
        total_capacity = sum(capacities.values())
        shares = {
            stratum: remaining * capacity / total_capacity
            for stratum, capacity in capacities.items()
        }
        allocated = 0
        for stratum, share in shares.items():
            amount = min(capacities[stratum], math.floor(share))
            quotas[stratum] += amount
            allocated += amount
        remaining -= allocated
        if remaining:
            ranked = sorted(
                capacities,
                key=lambda stratum: (-(shares[stratum] % 1), stratum),
            )
            for stratum in ranked:
                if remaining == 0:
                    break
                if quotas[stratum] < sizes[stratum]:
                    quotas[stratum] += 1
                    remaining -= 1
    return quotas


def derive_slice(
    candidates: Sequence[CardCandidate],
    *,
    cards_hash: Sha256Hex,
    config: SliceSamplingConfig,
) -> DerivedSlice:
    """Derive a byte-stable, stratified pilot slice."""
    if not candidates:
        raise ValueError("cards artifact contains no pilot-eligible relations")
    holdouts = dict(HOLDOUT)
    by_id = {card.relation_id: card for card in candidates}
    missing_holdouts = sorted(set(holdouts) - set(by_id))
    if missing_holdouts:
        raise ValueError(f"cards.jsonl is missing qualified holdout cards: {missing_holdouts}")

    quartiles = _length_quartiles(candidates)
    sampling_hash = sha256_bytes(canonical_json_bytes(config.model_dump(mode="json")))
    selection_keys = {
        card.relation_id: _selection_key(
            card,
            cards_hash=cards_hash,
            sampling_hash=sampling_hash,
            seed=config.seed,
        )
        for card in candidates
    }
    ordinary = [card for card in candidates if card.relation_id not in holdouts]
    target = min(config.non_holdout_count, len(ordinary))
    by_stratum: dict[str, list[CardCandidate]] = defaultdict(list)
    for card in ordinary:
        by_stratum[_sampling_stratum(card, quartiles[card.relation_id])].append(card)
    quotas = _apportion({stratum: len(cards) for stratum, cards in by_stratum.items()}, target)

    selected: list[CardCandidate] = []
    for stratum, cards in sorted(by_stratum.items()):
        ranked = sorted(
            cards,
            key=lambda card: (selection_keys[card.relation_id], card.relation_id),
        )
        selected.extend(ranked[: quotas[stratum]])
    selected.extend(by_id[relation_id] for relation_id in holdouts)

    rows = tuple(
        sorted(
            (
                SliceRow(
                    relation_id=card.relation_id,
                    card_hash=card.card_hash,
                    prescreen_stratum=card.prescreen_stratum,
                    sampling_stratum=_sampling_stratum(card, quartiles[card.relation_id]),
                    length_quartile=cast("Literal[1, 2, 3, 4]", quartiles[card.relation_id]),
                    pilot_strata=list(card.pilot_strata),
                    token_count=card.token_count,
                    is_holdout=card.relation_id in holdouts,
                    holdout_verdict=holdouts.get(card.relation_id),
                    sampling_seed=config.seed,
                    selection_key=selection_keys[card.relation_id],
                )
                for card in selected
            ),
            key=lambda row: row.relation_id,
        )
    )
    selection_hash = sha256_bytes(
        canonical_json_bytes([row.model_dump(mode="json") for row in rows])
    )
    return DerivedSlice(
        rows=rows,
        derivation=SliceDerivation(
            algorithm=config.algorithm,
            sampling_seed=config.seed,
            requested_non_holdouts=config.non_holdout_count,
            eligible_non_holdouts=len(ordinary),
            selected_non_holdouts=target,
            cards_hash=cards_hash,
            sampling_config_hash=sampling_hash,
            selection_hash=selection_hash,
        ),
    )


def _load_required_cards(
    cards_path: Path,
    required: set[RelationId],
) -> dict[RelationId, EvaluationCard]:
    cards = {
        card.relation_id: card for card in read_cards(cards_path) if card.relation_id in required
    }
    missing = sorted(required - set(cards))
    if missing:
        raise ValueError(f"cards.jsonl is missing required cards: {missing}")
    return cards


def bundle_parts(bundle_id: BundleId) -> BundleParts:
    """Split a validated bundle identifier into its shell and framing identifiers."""
    shell, framing = bundle_id.split("x")
    return BundleParts(
        shell=cast("ShellId", shell),
        framing=cast("FramingId", framing),
    )


def prepare_prompt_prefixes(
    cards: Mapping[RelationId, EvaluationCard],
) -> dict[BundleId, PromptPrefix]:
    """Build every deterministic rubric prompt prefix."""
    prefixes: dict[BundleId, PromptPrefix] = {}
    for bundle in BUNDLES:
        parts = bundle_parts(bundle)
        prefixes[bundle] = build_prompt_prefix(
            system_prompt=cast("Literal[1, 2, 3]", int(parts.shell[1])),
            framing=cast("Literal[1, 2, 3]", int(parts.framing[1])),
            cards=cards,
        )
    return prefixes


def prepare_pilot_inputs(
    cards_dir: str | PathLike[str],
    config: PilotRunConfig,
) -> PreparedInputs:
    """Verify cards, derive the pilot slice, and prepare its prompt pack."""
    cards_directory = Path(cards_dir)
    verified = verify_concat(cards_directory)
    candidates, _ = _card_candidates(
        verified.cards_path,
        verified.row_count,
        set(verified.source_namespaces),
    )
    derived = derive_slice(
        candidates,
        cards_hash=verified.source_hashes["cards.jsonl"],
        config=config.sampling,
    )
    required = {row.relation_id for row in derived.rows} | {
        relation_id for relation_id, _ in FEW_SHOT
    }
    cards = _load_required_cards(verified.cards_path, required)
    pack_hash = prompt_pack_hash(cards)
    if sha256_file(verified.cards_path) != verified.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed while preparing the pilot")
    return PreparedInputs(
        cards_dir=cards_directory,
        cards_path=verified.cards_path,
        manifest_path=verified.manifest_path,
        source_hashes=verified.source_hashes,
        cards=cards,
        prefixes=prepare_prompt_prefixes(cards),
        pack_hash=pack_hash,
        full_grid_card_count=len(candidates),
        slice_rows=derived.rows,
        slice_derivation=derived.derivation,
    )


def prepare_ladder_inputs(
    cards_dir: str | PathLike[str],
    loaded_config: LoadedRunConfig,
) -> LadderPreparedInputs:
    """Verify the corpus and derive the ladder's deterministic voting population.

    Every verified non-few-shot card is eligible, in ascending ``relation_id``
    order. The fixed few-shot cards remain in the prompt pack but never
    receive votes.
    """
    cards_directory = Path(cards_dir)
    verified = verify_concat(cards_directory)
    candidates, _ = _card_candidates(
        verified.cards_path,
        verified.row_count,
        set(verified.source_namespaces),
    )
    if not candidates:
        raise ValueError("cards.jsonl contains no eligible (non-few-shot) cards")
    required = {candidate.relation_id for candidate in candidates} | {
        relation_id for relation_id, _ in FEW_SHOT
    }
    cards = _load_required_cards(verified.cards_path, required)
    pack_hash = prompt_pack_hash(cards)
    if sha256_file(verified.cards_path) != verified.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed while preparing the ladder")
    eligible = tuple(
        cards[candidate.relation_id]
        for candidate in sorted(candidates, key=lambda candidate: candidate.relation_id)
    )
    return LadderPreparedInputs(
        cards_dir=cards_directory,
        cards_path=verified.cards_path,
        manifest_path=verified.manifest_path,
        source_hashes=verified.source_hashes,
        cards=cards,
        prefixes=prepare_prompt_prefixes(cards),
        pack_hash=pack_hash,
        panel_hash=panel_hash(loaded_config.ladder()),
        eligible=eligible,
    )


def prepare_inputs(
    cards_dir: str | PathLike[str],
    loaded_config: LoadedRunConfig,
) -> PreparedInputs | LadderPreparedInputs:
    """Prepare mode-specific inputs from one loaded run config."""
    config: RunConfig = loaded_config.config
    match config:
        case PilotRunConfig():
            return prepare_pilot_inputs(cards_dir, config)
        case LadderRunConfig():
            return prepare_ladder_inputs(cards_dir, loaded_config)
        case unexpected:
            assert_never(unexpected)
