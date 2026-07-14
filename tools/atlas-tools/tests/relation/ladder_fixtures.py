"""Shared deterministic fixtures for vote-ladder tests and the kill-resume runner.

The deck, panel, and verdict script are constants so that every process —
test process or SIGKILLed subprocess — derives byte-identical plans and
journals from the same inputs.
"""

import time
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from threading import Lock

import yaml
from openrouter.components import ChatMessages, ChatResult, ChatUserMessage
from pydantic import JsonValue

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat import concat_relations
from atlas_tools.relation.eval.contract import (
    ClassifierConfig,
    ConcurrencyConfig,
    EmbeddingConfig,
    JudgeConfig,
    LadderJudge,
    LadderRunConfig,
    PanelConfig,
    TransientRetryConfig,
)
from atlas_tools.relation.eval.prompt import FEW_SHOT
from atlas_tools.relation.eval.schema import FramingId, ReasoningEffort, Verdict
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationId,
    RelationSourceSpec,
    qualify_relation_id,
)
from tests.relation.test_eval_run import _result

type VoterKey = tuple[str, str, FramingId]
"""(judge model, relation local id, framing) — one scripted voter answer."""

CARD_P = "P9000001"
CARD_O = "P9000002"
CARD_C = "P9000003"
CARD_MIXED = "P9000004"
CARD_U = "P9000005"

LIVE_CARDS: dict[str, str] = {
    CARD_P: "fam-a",
    CARD_O: "fam-a",
    CARD_C: "fam-b",
    CARD_MIXED: "fam-c",
    CARD_U: "fam-c",
}

RUNG1_MODELS = ("test/j1", "test/j2")
RUNG2_MODELS = ("test/j3", "test/j4")
ALL_MODELS = RUNG1_MODELS + RUNG2_MODELS

_FRAMING_MARKERS: dict[FramingId, str] = {
    "F1": "Where should B be relative to A",
    "F2": "single placement policy",
    "F3": "decision tests in order",
}

_DEFAULT_VERDICTS: dict[str, Verdict] = {
    CARD_P: "proximal",
    CARD_O: "overlay",
    CARD_C: "coincident",
    CARD_MIXED: "proximal",
    CARD_U: "unclear",
}

# Rung-1 exceptions: cardC gets one proximal dissent (coincident still leads
# 3-1, so it joins the review queue and runs the full panel) and cardMixed
# gets one overlay dissent (no unanimity, no coincident lead, so it simply
# continues to rung 2).
VERDICT_OVERRIDES: dict[VoterKey, Verdict] = {
    ("test/j2", CARD_C, "F2"): "proximal",
    ("test/j2", CARD_MIXED, "F2"): "overlay",
}

# Final hand-computed vote counts per card over {C, P, O, U}, and the
# Dirichlet(1,1,1) posterior denominators they imply (n_votes + 3).
EXPECTED_TOTAL_VOTES = 32
EXPECTED_COUNTS: dict[str, dict[Verdict, int]] = {
    CARD_P: {"coincident": 0, "proximal": 4, "overlay": 0, "unclear": 0},
    CARD_O: {"coincident": 0, "proximal": 0, "overlay": 4, "unclear": 0},
    CARD_C: {"coincident": 7, "proximal": 1, "overlay": 0, "unclear": 0},
    CARD_MIXED: {"coincident": 0, "proximal": 7, "overlay": 1, "unclear": 0},
    CARD_U: {"coincident": 0, "proximal": 0, "overlay": 0, "unclear": 8},
}


def scripted_verdict(model: str, local_id: str, framing: FramingId) -> Verdict:
    override = VERDICT_OVERRIDES.get((model, local_id, framing))
    if override is not None:
        return override
    return _DEFAULT_VERDICTS[local_id]


def live_relation_id(local_id: str) -> RelationId:
    return qualify_relation_id("wikidata", local_id)


def write_ladder_concat(directory: Path) -> Path:
    """Write a verified concat artifact: the few-shot cards plus the live deck."""
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
    for local_id, family_id in LIVE_CARDS.items():
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


def _judge(model: str, *, rung: int) -> LadderJudge:
    slug = model.removeprefix("test/")
    return LadderJudge(
        provider_slug=f"test-provider/{slug}",
        provider_name=f"Provider {slug}",
        model=model,
        temperature=0.0,
        seed=17,
        rung=rung,
        cost_tier="standard",
        framings=("F1", "F2"),
    )


def ladder_config(
    *,
    max_cost_usd: float | None = None,
    frozen: bool = True,
    concurrency: ConcurrencyConfig | None = None,
    embedding: EmbeddingConfig | None = None,
    classifier: ClassifierConfig | None = None,
) -> LadderRunConfig:
    return LadderRunConfig(
        panel=PanelConfig(
            version=1,
            frozen=frozen,
            pruning_floor="fixture floor: gold agreement >= 0.75" if frozen else None,
        ),
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
            *(_judge(model, rung=1) for model in RUNG1_MODELS),
            *(_judge(model, rung=2) for model in RUNG2_MODELS),
        ],
    )


def write_ladder_config(path: Path, config: LadderRunConfig) -> Path:
    path.write_text(
        yaml.safe_dump(config.model_dump(mode="json"), sort_keys=True),
        encoding="utf-8",
    )
    return path


class UnscriptedCallError(AssertionError):
    """The mapping transport received a prompt it cannot attribute."""


@dataclass(frozen=True)
class MappingCall:
    """One observed judge request, kept for post-run assertions."""

    model: str
    effort: ReasoningEffort
    session_id: str
    timeout: timedelta


@dataclass
class MappingTransport:
    """Deterministic judge: verdicts keyed by (model, card, framing).

    ``fail_after`` raises a transport error on the Nth call (0-based) and
    every later call, which exhausts the single-attempt retry budget and
    stops the run cleanly with all prior votes durable. ``call_delay``
    widens the kill window for the SIGKILL test.
    """

    fail_after: int | None = None
    call_delay: timedelta = timedelta()
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
        if self.fail_after is not None and call_index >= self.fail_after:
            raise ConnectionError("scripted mid-run interruption")
        if self.call_delay > timedelta():
            time.sleep(self.call_delay.total_seconds())
        local_id, framing = _attribute_prompt(messages)
        verdict = scripted_verdict(judge.model, local_id, framing)
        return _result(
            content=f'{{"reason": "scripted", "verdict": "{verdict}"}}',
            completion_id="completion",
            model=judge.model,
            route_model=judge.model,
            route_provider=judge.provider_name,
            requested_model=judge.model,
        )

    def close(self) -> None:
        return None


def _attribute_prompt(messages: list[ChatMessages]) -> tuple[str, FramingId]:
    last = messages[-1]
    if not isinstance(last, ChatUserMessage) or not isinstance(last.content, str):
        raise UnscriptedCallError("prompt does not end in a text user message")
    content = last.content
    local_id = next(
        (local for local in LIVE_CARDS if f"wikidata:{local}" in content),
        None,
    )
    framing = next(
        (framing for framing, marker in _FRAMING_MARKERS.items() if marker in content),
        None,
    )
    if local_id is None or framing is None:
        raise UnscriptedCallError(f"cannot attribute prompt: {content[:120]!r}")
    return local_id, framing


@dataclass(frozen=True)
class MappingTransportFactory:
    """Give each worker its own deterministic mapping transport."""

    call_delay: timedelta = timedelta()

    def __call__(self) -> MappingTransport:
        return MappingTransport(call_delay=self.call_delay)
