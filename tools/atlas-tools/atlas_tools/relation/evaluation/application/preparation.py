"""Prepare verified pilot and grid inputs before any provider work begins.

Configuration and deck bytes are validated by storage, prompt conditioning and
task streams come from modes, and this module builds the immutable indexes that
application runners reuse. Async entry points load independent files in
parallel and perform no blocking filesystem access on Trio's event loop.
"""

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import assert_never

import trio

from atlas_tools.relation.evaluation.application.identity import panel_hash
from atlas_tools.relation.evaluation.domain.api import (
    CorpusRecord,
    EvaluationCard,
    GridRunConfig,
    PhysicalAttempt,
    PilotRunConfig,
    RelationId,
    Sha256Hex,
    SliceDerivation,
    SliceRecord,
    Vote,
    VoteTask,
)
from atlas_tools.relation.evaluation.modes.api import (
    BASELINE_REPEAT_INDEX,
    FEW_SHOTS,
    HOLDOUTS,
    GridCard,
    GridPhaseAPlan,
    PilotCard,
    PilotPlan,
    PilotSliceRow,
    PromptCard,
    PromptPack,
    SamplingCard,
    derive_pilot_slice,
    grid_task,
)
from atlas_tools.relation.evaluation.modes.api import (
    SliceDerivation as SampleSliceDerivation,
)
from atlas_tools.relation.evaluation.storage.api import (
    LoadedConfig,
    PilotImport,
    VerifiedDeck,
    load_config,
    load_config_async,
    load_deck,
    load_deck_async,
    load_pilot_import,
    load_pilot_import_async,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class PreparedPilot:
    """Carry all verified pilot inputs and their reusable indexes.

    `slice_by_relation_id` and the deck's `by_relation_id` map are immutable and
    built once. The plan is replayable and retains only the compact sampled card
    projection rather than copying full card text into every task.
    """

    loaded_config: LoadedConfig
    deck: VerifiedDeck
    prompt_pack: PromptPack
    slice_records: tuple[SliceRecord, ...]
    slice_derivation: SliceDerivation
    slice_by_relation_id: MappingProxyType[RelationId, SliceRecord]
    plan: PilotPlan
    full_grid_card_count: int

    @property
    def config(self) -> PilotRunConfig:
        """Return the pilot config already narrowed at preparation time."""
        return self.plan.config


@dataclass(frozen=True, slots=True, kw_only=True)
class PreparedGrid:
    """Carry the verified grid corpus, paid import, and fresh baseline plan.

    Cards and baseline tasks are indexed once for execution and validation.
    Imported votes retain their physical evidence grouped by vote ID, so later
    stages do not repeatedly scan paid journals.
    """

    loaded_config: LoadedConfig
    deck: VerifiedDeck
    prompt_pack: PromptPack
    panel_hash: Sha256Hex
    pool: tuple[EvaluationCard, ...]
    pool_by_relation_id: MappingProxyType[RelationId, EvaluationCard]
    corpus: tuple[CorpusRecord, ...]
    baseline_by_vote_id: MappingProxyType[Sha256Hex, VoteTask]
    pilot_import: PilotImport
    imported_by_vote_id: MappingProxyType[Sha256Hex, Vote]
    attempts_by_vote_id: MappingProxyType[Sha256Hex, tuple[PhysicalAttempt, ...]]
    phase_a: GridPhaseAPlan

    @property
    def config(self) -> GridRunConfig:
        """Return the grid config already narrowed at preparation time."""
        return self.phase_a.config


@dataclass(frozen=True, slots=True, kw_only=True)
class _GridBase:
    loaded_config: LoadedConfig
    deck: VerifiedDeck
    config: GridRunConfig
    prompt_pack: PromptPack
    panel_hash: Sha256Hex
    pool: tuple[EvaluationCard, ...]
    pool_by_relation_id: MappingProxyType[RelationId, EvaluationCard]
    grid_cards: tuple[GridCard, ...]
    corpus: tuple[CorpusRecord, ...]
    baseline_by_vote_id: MappingProxyType[Sha256Hex, VoteTask]


def _pilot_config(loaded: LoadedConfig) -> PilotRunConfig:
    config = loaded.config
    if not isinstance(config, PilotRunConfig):
        raise TypeError("loaded run config is not a pilot config")
    return config


def _grid_config(loaded: LoadedConfig) -> GridRunConfig:
    config = loaded.config
    if not isinstance(config, GridRunConfig):
        raise TypeError("loaded run config is not a grid config")
    return config


def _prompt_pack(deck: VerifiedDeck) -> PromptPack:
    return PromptPack.from_cards(
        PromptCard(relation_id=card.relation_id, card_text=card.card_text) for card in deck.cards
    )


def _sampling_card(card: EvaluationCard) -> SamplingCard:
    return SamplingCard(
        relation_id=card.relation_id,
        producer=card.producer,
        card_hash=card.card_hash,
        token_count=card.token_count,
        prescreen_stratum=card.prescreen_stratum,
        pilot_strata=card.pilot_strata,
    )


def _slice_record(row: PilotSliceRow) -> SliceRecord:
    return SliceRecord(
        relation_id=row.relation_id,
        card_hash=row.card_hash,
        prescreen_stratum=row.prescreen_stratum,
        sampling_stratum=row.sampling_stratum,
        length_quartile=row.length_quartile,
        pilot_strata=row.pilot_strata,
        token_count=row.token_count,
        is_holdout=row.is_holdout,
        holdout_verdict=row.holdout_verdict,
        sampling_seed=row.sampling_seed,
        selection_key=row.selection_key,
    )


def _slice_derivation(derivation: SampleSliceDerivation) -> SliceDerivation:
    return SliceDerivation(
        algorithm=derivation.algorithm,
        sampling_seed=derivation.sampling_seed,
        requested_non_holdouts=derivation.requested_non_holdouts,
        eligible_non_holdouts=derivation.eligible_non_holdouts,
        selected_non_holdouts=derivation.selected_non_holdouts,
        cards_hash=derivation.cards_hash,
        sampling_config_hash=derivation.sampling_config_hash,
        selection_hash=derivation.selection_hash,
    )


def _prepare_pilot(loaded: LoadedConfig, deck: VerifiedDeck) -> PreparedPilot:
    config = _pilot_config(loaded)
    prompt_pack = _prompt_pack(deck)
    cards_hash = deck.source_hashes["cards.jsonl"]
    selected = derive_pilot_slice(
        (_sampling_card(card) for card in deck.cards),
        cards_hash=cards_hash,
        config=config.sampling,
    )
    records = tuple(_slice_record(row) for row in selected.rows)
    by_relation_id = {row.relation_id: row for row in records}
    if len(by_relation_id) != len(records):
        raise ValueError("derived pilot slice contains duplicate relations")
    plan = PilotPlan(
        config=config,
        cards=tuple(
            PilotCard(
                relation_id=row.relation_id,
                card_hash=row.card_hash,
                is_holdout=row.is_holdout,
            )
            for row in records
        ),
        prompt_pack_hash=prompt_pack.content_hash,
    )
    return PreparedPilot(
        loaded_config=loaded,
        deck=deck,
        prompt_pack=prompt_pack,
        slice_records=records,
        slice_derivation=_slice_derivation(selected.derivation),
        slice_by_relation_id=MappingProxyType(by_relation_id),
        plan=plan,
        full_grid_card_count=len(deck.cards) - len(FEW_SHOTS),
    )


def _grid_pool(deck: VerifiedDeck) -> tuple[EvaluationCard, ...]:
    shot_ids = frozenset(shot.relation_id for shot in FEW_SHOTS)
    pool = tuple(
        sorted(
            (card for card in deck.cards if card.relation_id not in shot_ids),
            key=lambda card: card.relation_id,
        )
    )
    if not pool:
        raise ValueError("deck contains no grid-eligible cards")
    return pool


def _corpus(deck: VerifiedDeck) -> tuple[CorpusRecord, ...]:
    shot_ids = frozenset(shot.relation_id for shot in FEW_SHOTS)
    holdout_verdicts = {holdout.relation_id: holdout.verdict for holdout in HOLDOUTS}
    missing_holdouts = tuple(
        relation_id for relation_id in holdout_verdicts if relation_id not in deck.by_relation_id
    )
    if missing_holdouts:
        raise ValueError(f"deck lacks fixed holdout relations: {missing_holdouts}")
    return tuple(
        CorpusRecord(
            relation_id=card.relation_id,
            card_hash=card.card_hash,
            prescreen_stratum=card.prescreen_stratum,
            token_count=card.token_count,
            is_holdout=card.relation_id in holdout_verdicts,
            holdout_verdict=holdout_verdicts.get(card.relation_id),
            is_shot_excluded=card.relation_id in shot_ids,
        )
        for card in sorted(deck.cards, key=lambda card: card.relation_id)
    )


def _baseline_index(
    *,
    config: GridRunConfig,
    cards: tuple[GridCard, ...],
    prompt_pack_hash: Sha256Hex,
) -> MappingProxyType[Sha256Hex, VoteTask]:
    baseline: dict[Sha256Hex, VoteTask] = {}
    for judge in config.judges:
        for card in cards:
            task = grid_task(
                config=config,
                judge=judge,
                card=card,
                repeat_index=BASELINE_REPEAT_INDEX,
                prompt_pack_hash=prompt_pack_hash,
            )
            if task.vote_id in baseline:
                raise ValueError(f"grid baseline repeats logical vote ID {task.vote_id}")
            baseline[task.vote_id] = task
    return MappingProxyType(baseline)


def _prepare_grid_base(loaded: LoadedConfig, deck: VerifiedDeck) -> _GridBase:
    config = _grid_config(loaded)
    prompt_pack = _prompt_pack(deck)
    pool = _grid_pool(deck)
    pool_index = {card.relation_id: card for card in pool}
    if len(pool_index) != len(pool):
        raise ValueError("grid pool contains duplicate relations")
    grid_cards = tuple(
        GridCard(relation_id=card.relation_id, card_hash=card.card_hash) for card in pool
    )
    return _GridBase(
        loaded_config=loaded,
        deck=deck,
        config=config,
        prompt_pack=prompt_pack,
        panel_hash=panel_hash(config),
        pool=pool,
        pool_by_relation_id=MappingProxyType(pool_index),
        grid_cards=grid_cards,
        corpus=_corpus(deck),
        baseline_by_vote_id=_baseline_index(
            config=config,
            cards=grid_cards,
            prompt_pack_hash=prompt_pack.content_hash,
        ),
    )


def _validate_imported_vote(task: VoteTask, vote: Vote) -> None:
    expected = {
        "relation_id": task.relation_id,
        "card_hash": task.card_hash,
        "family_id": task.judge.family_id,
        "provider": task.judge.provider_name,
        "model_returned": task.judge.model,
        "bundle_id": task.bundle_id,
        "rubric_version": task.rubric_version,
        "prompt_pack_hash": task.prompt_pack_hash,
        "effort": task.effort,
        "temperature": task.judge.temperature,
        "seed": task.judge.seed,
        "repeat_index": task.repeat_index,
    }
    observed = {name: getattr(vote, name) for name in expected}
    if observed != expected:
        differing = tuple(name for name in expected if observed[name] != expected[name])
        raise ValueError(f"imported vote {vote.vote_id} differs in fields {differing}")


def _import_indexes(
    imported: PilotImport,
    baseline: Mapping[Sha256Hex, VoteTask],
) -> tuple[
    MappingProxyType[Sha256Hex, Vote],
    MappingProxyType[Sha256Hex, tuple[PhysicalAttempt, ...]],
]:
    votes: dict[Sha256Hex, Vote] = {}
    for vote in imported.votes:
        if vote.vote_id in votes:
            raise ValueError(f"pilot import repeats logical vote ID {vote.vote_id}")
        task = baseline.get(vote.vote_id)
        if task is None:
            raise ValueError(f"pilot import contains vote outside baseline {vote.vote_id}")
        _validate_imported_vote(task, vote)
        votes[vote.vote_id] = vote

    grouped: dict[Sha256Hex, list[PhysicalAttempt]] = defaultdict(list)
    for attempt in imported.attempts:
        task = baseline.get(attempt.vote_id)
        if task is None or attempt.vote_id not in votes:
            raise ValueError(f"pilot import contains unbound attempt {attempt.attempt_id}")
        if (
            attempt.family_id != task.judge.family_id
            or attempt.provider_slug != task.judge.provider_slug
            or attempt.model_requested != task.judge.model
        ):
            raise ValueError(f"pilot attempt {attempt.attempt_id} differs from its baseline task")
        grouped[attempt.vote_id].append(attempt)

    attempts = {vote_id: tuple(rows) for vote_id, rows in grouped.items()}
    for vote_id, vote in votes.items():
        evidence = attempts.get(vote_id)
        if evidence is None:
            raise ValueError(f"imported vote {vote_id} lacks physical attempts")
        accepted = tuple(
            attempt.result
            for attempt in evidence
            if attempt.result is not None and attempt.failure is None
        )
        if accepted != vote.attempt_results:
            raise ValueError(f"imported vote {vote_id} differs from its physical evidence")
    return MappingProxyType(votes), MappingProxyType(attempts)


def _complete_grid(base: _GridBase, imported: PilotImport) -> PreparedGrid:
    imported_by_id, attempts_by_id = _import_indexes(imported, base.baseline_by_vote_id)
    imported_ids = frozenset(imported_by_id)
    phase_a = GridPhaseAPlan(
        config=base.config,
        cards=base.grid_cards,
        prompt_pack_hash=base.prompt_pack.content_hash,
        imported_vote_ids=imported_ids,
    )
    return PreparedGrid(
        loaded_config=base.loaded_config,
        deck=base.deck,
        prompt_pack=base.prompt_pack,
        panel_hash=base.panel_hash,
        pool=base.pool,
        pool_by_relation_id=base.pool_by_relation_id,
        corpus=base.corpus,
        baseline_by_vote_id=base.baseline_by_vote_id,
        pilot_import=imported,
        imported_by_vote_id=imported_by_id,
        attempts_by_vote_id=attempts_by_id,
        phase_a=phase_a,
    )


def prepare_pilot_inputs(config_path: Path, deck_directory: Path) -> PreparedPilot:
    """Load and prepare a strict pilot config and verified concat deck."""
    return _prepare_pilot(load_config(config_path), load_deck(deck_directory))


def prepare_grid_inputs(
    config_path: Path,
    deck_directory: Path,
    *,
    pilot_directory: Path,
) -> PreparedGrid:
    """Prepare the grid and admit only paid votes matching baseline identities."""
    base = _prepare_grid_base(load_config(config_path), load_deck(deck_directory))
    imported = load_pilot_import(
        pilot_directory,
        planned_vote_ids=frozenset(base.baseline_by_vote_id),
        prompt_pack_hash=base.prompt_pack.content_hash,
    )
    return _complete_grid(base, imported)


async def _load_inputs_async(
    config_path: Path,
    deck_directory: Path,
) -> tuple[LoadedConfig, VerifiedDeck]:
    configs: list[LoadedConfig] = []
    decks: list[VerifiedDeck] = []

    async def load_run_config() -> None:
        configs.append(await load_config_async(config_path))

    async def load_verified_deck() -> None:
        decks.append(await load_deck_async(deck_directory))

    async with trio.open_nursery() as nursery:
        nursery.start_soon(load_run_config)
        nursery.start_soon(load_verified_deck)
    if len(configs) != 1 or len(decks) != 1:
        raise AssertionError("parallel input loaders did not each produce one result")
    return configs[0], decks[0]


async def prepare_pilot_inputs_async(
    config_path: Path,
    deck_directory: Path,
) -> PreparedPilot:
    """Prepare pilot inputs without serializing independent filesystem reads."""
    loaded, deck = await _load_inputs_async(config_path, deck_directory)
    return _prepare_pilot(loaded, deck)


async def prepare_grid_inputs_async(
    config_path: Path,
    deck_directory: Path,
    *,
    pilot_directory: Path,
) -> PreparedGrid:
    """Prepare grid inputs without blocking Trio on config, deck, or pilot I/O."""
    loaded, deck = await _load_inputs_async(config_path, deck_directory)
    base = _prepare_grid_base(loaded, deck)
    imported = await load_pilot_import_async(
        pilot_directory,
        planned_vote_ids=frozenset(base.baseline_by_vote_id),
        prompt_pack_hash=base.prompt_pack.content_hash,
    )
    return _complete_grid(base, imported)


type PreparedEvaluation = PreparedPilot | PreparedGrid


def prepare_evaluation_inputs(
    config_path: Path,
    deck_directory: Path,
    *,
    pilot_directory: Path | None = None,
) -> PreparedEvaluation:
    """Prepare exactly one mode after loading config and deck once."""
    loaded = load_config(config_path)
    deck = load_deck(deck_directory)
    match loaded.config:
        case PilotRunConfig():
            if pilot_directory is not None:
                raise ValueError("a pilot run does not accept a pilot handoff")
            return _prepare_pilot(loaded, deck)
        case GridRunConfig():
            if pilot_directory is None:
                raise ValueError("a grid run requires the pilot handoff directory")
            base = _prepare_grid_base(loaded, deck)
            imported = load_pilot_import(
                pilot_directory,
                planned_vote_ids=frozenset(base.baseline_by_vote_id),
                prompt_pack_hash=base.prompt_pack.content_hash,
            )
            return _complete_grid(base, imported)
        case unexpected:
            assert_never(unexpected)


async def prepare_evaluation_inputs_async(
    config_path: Path,
    deck_directory: Path,
    *,
    pilot_directory: Path | None = None,
) -> PreparedEvaluation:
    """Prepare one discriminated mode with parallel independent file reads."""
    loaded, deck = await _load_inputs_async(config_path, deck_directory)
    match loaded.config:
        case PilotRunConfig():
            if pilot_directory is not None:
                raise ValueError("a pilot run does not accept a pilot handoff")
            return _prepare_pilot(loaded, deck)
        case GridRunConfig():
            if pilot_directory is None:
                raise ValueError("a grid run requires the pilot handoff directory")
            base = _prepare_grid_base(loaded, deck)
            imported = await load_pilot_import_async(
                pilot_directory,
                planned_vote_ids=frozenset(base.baseline_by_vote_id),
                prompt_pack_hash=base.prompt_pack.content_hash,
            )
            return _complete_grid(base, imported)
        case unexpected:
            assert_never(unexpected)
