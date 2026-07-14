"""Shared deterministic fixtures for production-grid tests and the kill-resume runner.

The deck, panel, and verdict script are constants so that every process —
test process or SIGKILLed subprocess — derives byte-identical plans and
journals from the same inputs.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from threading import Lock
from typing import Literal

import yaml
from openrouter.components import (
    ChatMessages,
    ChatResult,
    ChatUsage,
    ChatUsageCompletionTokensDetails,
    ChatUsagePromptTokensDetails,
    ChatUserMessage,
)
from pydantic import JsonValue

from atlas_tools.common import (
    Provenance,
    Sha256Hex,
    canonical_json_bytes,
    sha256_bytes,
    sha256_file,
)
from atlas_tools.relation.concat import concat_relations
from atlas_tools.relation.eval.contract import (
    ClassifierConfig,
    ConcurrencyConfig,
    EmbeddingConfig,
    GridJudge,
    GridRunConfig,
    GuardConfig,
    JudgeConfig,
    PanelConfig,
    TransientRetryConfig,
)
from atlas_tools.relation.eval.prompt import FEW_SHOT, HOLDOUT, RETRY_INSTRUCTION
from atlas_tools.relation.eval.schema import (
    AgreementResults,
    AnalysisDecisions,
    AnalysisPolicy,
    AxisStatistics,
    BundleId,
    DataHealth,
    Estimate,
    OrderingCheck,
    PilotRunContract,
    QualificationResult,
    ReasoningEffort,
    Verdict,
)
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationId,
    RelationSourceSpec,
    qualify_relation_id,
)
from tests.relation.test_eval_run import ScriptedProviderError, _result

MALFORMED = "MALFORMED"
type ScriptedAnswer = Verdict | Literal["MALFORMED"]
type VerdictScript = Callable[[str, str], ScriptedAnswer]
"""(judge model, relation local id) -> scripted answer for every repeat."""

CARD_A = "P9000001"
"""Unanimous proximal: five baseline votes, never refined."""
CARD_B = "P9000002"
"""Unanimous overlay: five baseline votes, never refined."""
CARD_C = "P9000003"
"""One coincident dissent: refined, and the coincident review queue member."""
CARD_D = "P9000004"
"""A 3-2 proximal/overlay split: refined by non-unanimity."""
CARD_E = "P9000005"
"""One family abstains (malformed twice): refined by the abstention."""

LIVE_CARDS: dict[str, str] = {
    CARD_A: "fam-a",
    CARD_B: "fam-a",
    CARD_C: "fam-b",
    CARD_D: "fam-c",
    CARD_E: "fam-c",
}

_HOLDOUT_VERDICTS: dict[str, Verdict] = {
    relation_id.removeprefix("wikidata:"): verdict for relation_id, verdict in HOLDOUT
}
# P3403's canonical verdict is coincident, and any C vote triggers refinement
# and the review queue. Its accepted alternate (proximal, HOLDOUT_ALTERNATES)
# keeps every holdout unanimous and unrefined while still passing the
# holdout-drift gate, so exactly cards C, D, and E are refined.
_HOLDOUT_VERDICTS["P3403"] = "proximal"
HOLDOUT_FAMILIES: dict[str, str] = {
    local_id: f"fam-h{index}" for index, local_id in enumerate(sorted(_HOLDOUT_VERDICTS), start=1)
}

POOL_CARDS: dict[str, str] = LIVE_CARDS | HOLDOUT_FAMILIES
"""Every voted (non-few-shot) card: the five scripted cards plus six holdouts."""
POOL_SIZE = len(POOL_CARDS)

JUDGE_MODELS = ("test/j1", "test/j2", "test/j3", "test/j4", "test/j5")
COINCIDENT_JUDGE = "test/j2"
ABSTAIN_JUDGE = "test/j3"
SPLIT_OVERLAY_JUDGES = ("test/j4", "test/j5")

_UNANIMOUS: dict[str, Verdict] = {CARD_A: "proximal", CARD_B: "overlay"}

# Hand-computed run shape for the default deck: 11 pool cards x 5 seats = 55
# baseline votes; cards C, D, and E trigger refinement (3 x 5 x 2 = 30 repeat
# votes); the abstaining family pays one extra repair call per cardE vote.
EXPECTED_BASELINE_VOTES = 55
EXPECTED_REFINED_CARDS = 3
EXPECTED_REFINEMENT_VOTES = 30
EXPECTED_TOTAL_VOTES = EXPECTED_BASELINE_VOTES + EXPECTED_REFINEMENT_VOTES
EXPECTED_FRESH_CALLS = EXPECTED_TOTAL_VOTES + 3
EXPECTED_IMPORT_RUN_CALLS = EXPECTED_REFINEMENT_VOTES + 2


def scripted_answer(model: str, local_id: str) -> ScriptedAnswer:
    """Default deck: holdouts answered canonically, cardE's abstainer malformed."""
    holdout = _HOLDOUT_VERDICTS.get(local_id)
    if holdout is not None:
        return holdout
    if local_id == CARD_C:
        return "coincident" if model == COINCIDENT_JUDGE else "proximal"
    if local_id == CARD_D:
        return "overlay" if model in SPLIT_OVERLAY_JUDGES else "proximal"
    if local_id == CARD_E:
        return MALFORMED if model == ABSTAIN_JUDGE else "unclear"
    return _UNANIMOUS[local_id]


def gates_clean_answer(model: str, local_id: str) -> ScriptedAnswer:
    """Answer the same deck without the abstention; cardE stays refined by its split."""
    if local_id == CARD_E:
        return "proximal" if model == ABSTAIN_JUDGE else "unclear"
    return scripted_answer(model, local_id)


DRIFTED_JUDGE = "test/j5"
_DRIFTED_HOLDOUTS = ("P6", "P47")


def drifted_answer(model: str, local_id: str) -> ScriptedAnswer:
    """One family misses two holdout anchors: the drift canary must halt."""
    if model == DRIFTED_JUDGE and local_id in _DRIFTED_HOLDOUTS:
        return "unclear"
    return gates_clean_answer(model, local_id)


def live_relation_id(local_id: str) -> RelationId:
    return qualify_relation_id("wikidata", local_id)


def write_grid_concat(directory: Path) -> Path:
    """Write a verified concat artifact: few-shot cards plus the voting pool.

    The holdout anchors are part of the deck and are voted; every pool card
    carries a ``family_id`` extra so classifier fitting can group by relation
    family.
    """
    source = directory.with_name(f"{directory.name}-source")
    source.mkdir()
    cards_path = source / "cards.jsonl"
    rows: list[CardRow] = []
    few_shot_ids = sorted({relation_id for relation_id, _ in FEW_SHOT})
    for relation_id in few_shot_ids:
        card_text = f"relation card for {relation_id}"
        rows.append(
            CardRow.model_validate(
                {
                    "relation_id": relation_id,
                    "pid": relation_id.removeprefix("wikidata:"),
                    "card_text": card_text,
                    "card_hash": sha256_bytes(card_text.encode()),
                    "token_count": len(card_text.split()),
                    "truncations": [],
                    "severely_truncated": False,
                }
            )
        )
    for local_id, family_id in POOL_CARDS.items():
        card_text = f"relation card for {live_relation_id(local_id)}"
        rows.append(
            CardRow.model_validate(
                {
                    "relation_id": live_relation_id(local_id),
                    "pid": local_id,
                    "card_text": card_text,
                    "card_hash": sha256_bytes(card_text.encode()),
                    "token_count": len(card_text.split()),
                    "truncations": [],
                    "severely_truncated": False,
                    "family_id": family_id,
                }
            )
        )
    cards_path.write_bytes(b"".join(canonical_json_bytes(row) + b"\n" for row in rows))
    Provenance[JsonValue, JsonValue].make(
        producer="test.wikidata-cards",
        content_hashes={"cards.jsonl": sha256_file(cards_path)},
        config={},
        details={
            "relation_source": RelationSourceSpec(
                namespace="wikidata",
                local_id_field="pid",
            ).model_dump(mode="json")
        },
    ).write(source / "cards.manifest.json")
    directory.mkdir()
    concat_relations([source], out=directory)
    return directory


def grid_judge(model: str, *, pilot_cost_per_vote_usd: float = 0.01) -> GridJudge:
    slug = model.removeprefix("test/")
    return GridJudge(
        provider_slug=f"test-provider/{slug}",
        provider_name=f"Provider {slug}",
        model=model,
        temperature=0.0,
        seed=17,
        pilot_cost_per_vote_usd=pilot_cost_per_vote_usd,
    )


def grid_config(
    *,
    frozen: bool = True,
    guards: GuardConfig | None = None,
    max_cost_usd: float | None = None,
    concurrency: ConcurrencyConfig | None = None,
    embedding: EmbeddingConfig | None = None,
    classifier: ClassifierConfig | None = None,
    pilot_cost_per_vote_usd: float = 0.01,
) -> GridRunConfig:
    return GridRunConfig(
        panel=PanelConfig(
            version=1,
            frozen=frozen,
            pruning_floor="fixture floor: gold agreement >= 0.75" if frozen else None,
        ),
        guards=guards or GuardConfig(),
        max_cost_usd=max_cost_usd,
        request_timeout=timedelta(seconds=5),
        transient_retries=TransientRetryConfig(
            maximum_attempts=1,
            initial_delay=timedelta(),
            maximum_delay=timedelta(),
        ),
        concurrency=concurrency or ConcurrencyConfig(initial=1, maximum=1),
        embedding=embedding,
        classifier=classifier or ClassifierConfig(),
        judges=[
            grid_judge(model, pilot_cost_per_vote_usd=pilot_cost_per_vote_usd)
            for model in JUDGE_MODELS
        ],
    )


def write_grid_config(path: Path, config: GridRunConfig) -> Path:
    path.write_text(
        yaml.safe_dump(config.model_dump(mode="json"), sort_keys=True),
        encoding="utf-8",
    )
    return path


def write_empty_pilot(directory: Path, *, pack_hash: Sha256Hex) -> Path:
    """Write a pilot handoff with no votes: run 1 buys everything fresh."""
    directory.mkdir()
    (directory / "votes.jsonl").write_bytes(b"")
    (directory / "attempts.jsonl").write_bytes(b"")
    (directory / "manifest.json").write_text(
        json.dumps({"prompt_pack_hash": pack_hash}),
        encoding="utf-8",
    )
    return directory


class UnscriptedCallError(AssertionError):
    """The mapping transport received a prompt it cannot attribute."""


@dataclass(frozen=True)
class MappingCall:
    """One observed judge request, kept for post-run assertions."""

    model: str
    effort: ReasoningEffort
    session_id: str
    timeout: timedelta


def _mapping_usage(*, cached_tokens: int, cost: float) -> ChatUsage:
    return ChatUsage(
        prompt_tokens=100,
        completion_tokens=5,
        total_tokens=105,
        cost=cost,
        prompt_tokens_details=ChatUsagePromptTokensDetails(
            cached_tokens=cached_tokens,
            cache_write_tokens=3,
        ),
        completion_tokens_details=ChatUsageCompletionTokensDetails(reasoning_tokens=2),
    )


_ALL_LOCALS = tuple(POOL_CARDS)


def _attribute_prompt(messages: list[ChatMessages]) -> str:
    """Find the live card turn: last message, or messages[-3] on the repair path."""
    last = messages[-1]
    if not isinstance(last, ChatUserMessage) or not isinstance(last.content, str):
        raise UnscriptedCallError("prompt does not end in a text user message")
    content = last.content
    if content == RETRY_INSTRUCTION:
        card_turn = messages[-3]
        if not isinstance(card_turn, ChatUserMessage) or not isinstance(card_turn.content, str):
            raise UnscriptedCallError("repair prompt does not carry its card turn")
        content = card_turn.content
    local_id = next(
        (local for local in _ALL_LOCALS if content.endswith(f"relation card for wikidata:{local}")),
        None,
    )
    if local_id is None:
        raise UnscriptedCallError(f"cannot attribute prompt: {content[:120]!r}")
    return local_id


@dataclass
class MappingTransport:
    """Deterministic judge: verdicts keyed by (model, card local id).

    ``fail_after`` raises a failure on the Nth call (0-based) and, by
    default, every later call, which exhausts the single-attempt retry
    budget and stops the run cleanly with all prior votes durable;
    ``fail_count`` bounds the faulty window instead, modeling a transient
    provider blip that clears on retry. ``fail_status`` shapes the failure:
    ``None`` raises a plain transport fault, a status code raises a
    provider-shaped error carrying it (401 is roster-shaped, 429/5xx are
    retryable weather). ``call_delay`` widens the kill window for the
    SIGKILL test. ``cached_tokens`` and ``cost`` shape each accepted
    completion's usage report for the cache assertion and cost tripwire
    tests.
    """

    script: VerdictScript = scripted_answer
    fail_after: int | None = None
    fail_count: int | None = None
    fail_status: int | None = None
    call_delay: timedelta = timedelta()
    cached_tokens: int = 80
    cost: float = 0.01
    cache_miss_calls: frozenset[int] = frozenset()
    """Global call indices (0-based) whose usage reports zero cached tokens.

    Models a best-effort cache (Azure shard roulette): individual misses among
    hits, as opposed to the never-cached stream ``cached_tokens=0`` models.
    """
    call_log: list[MappingCall] = field(default_factory=list)
    _lock: Lock = field(default_factory=Lock, repr=False)

    @property
    def calls(self) -> int:
        return len(self.call_log)

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        with self._lock:
            call_index = self.calls
            self.call_log.append(
                MappingCall(
                    model=judge.model,
                    effort=effort,
                    session_id=session_id,
                    timeout=timeout,
                )
            )
        if (
            self.fail_after is not None
            and call_index >= self.fail_after
            and (self.fail_count is None or call_index < self.fail_after + self.fail_count)
        ):
            if self.fail_status is not None:
                raise ScriptedProviderError(
                    f"scripted provider {self.fail_status}",
                    status_code=self.fail_status,
                    body=f'{{"error": {{"code": {self.fail_status}}}}}',
                )
            raise ConnectionError("scripted mid-run interruption")
        if self.call_delay > timedelta():
            time.sleep(self.call_delay.total_seconds())
        local_id = _attribute_prompt(messages)
        answer = self.script(judge.model, local_id)
        content = (
            "not JSON"
            if answer == MALFORMED
            else f'{{"reason": "scripted", "verdict": "{answer}"}}'
        )
        result = _result(
            content=content,
            completion_id="completion",
            model=judge.model,
            route_model=judge.model,
            route_provider=judge.provider_name,
            requested_model=judge.model,
        )
        cached = 0 if call_index in self.cache_miss_calls else self.cached_tokens
        return result.model_copy(
            update={"usage": _mapping_usage(cached_tokens=cached, cost=self.cost)}
        )

    def close(self) -> None:
        return None


@dataclass(frozen=True)
class MappingTransportFactory:
    """Give each worker its own deterministic mapping transport."""

    call_delay: timedelta = timedelta()

    def __call__(self) -> MappingTransport:
        return MappingTransport(call_delay=self.call_delay)


DISSENT_FAMILY = "test/j1"
DISSENT_RELATION = qualify_relation_id("wikidata", "P6")
DISSENT_BUNDLES: tuple[BundleId, ...] = ("S1xF1", "S1xF2")
DISSENT_BUNDLE_COUNT = 3
"""Bundles recorded in the dissent family's qualification evidence."""


def _zero_estimate() -> Estimate:
    return Estimate(est=None, lo=None, hi=None, n=0)


def _qualification_result(family_id: str) -> QualificationResult:
    """One family's qualification evidence; the dissent family misses P6 twice."""
    bundle_correctness: dict[BundleId, dict[RelationId, bool]] = {}
    if family_id == DISSENT_FAMILY:
        other = qualify_relation_id("wikidata", "P47")
        bundle_correctness = {
            "S1xF1": {DISSENT_RELATION: False, other: True},
            "S1xF2": {DISSENT_RELATION: False, other: True},
            "S1xF3": {DISSENT_RELATION: True, other: True},
        }
    return QualificationResult(
        family_id=family_id,
        correct_count=len(HOLDOUT),
        total_count=len(HOLDOUT),
        p1382_correct=True,
        p2634_correct=True,
        passed=True,
        bundle_correctness=bundle_correctness,
        holdout_expected={},
        holdout_verdicts={},
    )


def analysis_decisions(cards_dir: Path, *, pack_hash: Sha256Hex) -> AnalysisDecisions:
    """Build the minimal strict pilot decisions the deliverables stage consumes.

    Only ``qualification[*].bundle_correctness`` drives the dissent ledger:
    the dissent family misses ``P6`` on two bundles, yielding exactly one
    ledger row.
    """
    zero = _zero_estimate()
    return AnalysisDecisions(
        schema_version=3,
        policy=AnalysisPolicy(),
        input_hashes={},
        pilot_run_contract=PilotRunContract(
            cards_hash=sha256_file(cards_dir / "cards.jsonl"),
            cards_manifest_hash=sha256_file(cards_dir / "cards.manifest.json"),
            full_grid_card_count=POOL_SIZE,
            judge_request_hashes={
                model: sha256_bytes(f"request:{model}".encode()) for model in JUDGE_MODELS
            },
        ),
        prompt_pack_hash=pack_hash,
        rubric_version="rubric-v1",
        sampling_seeds=[42],
        pruned_families=[],
        admitted_shells=["S1"],
        admitted_templates=["F1"],
        escalation_order=[],
        floor_error_bar=zero,
        nomination_seeds=[],
        projected_grid_cost_usd=1.0,
        projected_grid_cost=Estimate(est=1.0, lo=None, hi=None, n=1),
        per_card_posteriors=[],
        effort_policy=[],
        data_health=DataHealth(
            votes_loaded=1,
            clean_votes=1,
            duplicate_vote_ids=[],
            contaminated_vote_ids=[],
            routing_violations=0,
            reasons_over_60_words=0,
            reason_over_60_word_rate=zero,
            coverage=[],
            routing=[],
            family_bundle=[],
            family_cost=[],
            warnings=[],
        ),
        qualification=[_qualification_result(model) for model in JUDGE_MODELS],
        axis_statistics=AxisStatistics(
            entropy_tercile_cuts=(0.0, 0.0),
            marginals=[],
            noise_floor=zero,
            flips=[],
            agreement=AgreementResults(
                bundle_kappa_by_family={},
                qualification_family_kappa={},
                all_candidate_krippendorff_alpha=zero,
                qualified_panel_krippendorff_alpha=zero,
            ),
            ordering=OrderingCheck(rates={}, healthy_order_holds=True),
        ),
        admissions=[],
        escalation=[],
        cost_audit=[],
    )


def write_decisions(path: Path, decisions: AnalysisDecisions) -> Path:
    path.write_bytes(canonical_json_bytes(decisions.model_dump(mode="json")) + b"\n")
    return path
