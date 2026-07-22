"""Prove the annotation-corpus wire contract against real renderings."""

import dataclasses
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.application.annotation_corpus import (
    ANNOTATION_CORPUS_SCHEMA,
    AnnotationCorpusDocument,
    ResolvedCardContent,
    build_annotation_corpus_document,
)
from atlas_tools.relation.evaluation.application.annotation_corpus_export import (
    WIKIDATA_ENTITY_URL_PREFIX,
    load_wikidata_intermediate,
    publish_annotation_corpus,
    resolve_hash_contents,
    resolve_wikidata_contents,
)
from atlas_tools.relation.evaluation.domain.api import (
    AttemptId,
    CardHash,
    CorpusRecord,
    EvaluationCard,
    JudgeRequestSpec,
    ModelId,
    PromptPackHash,
    ProviderName,
    ProviderSlug,
    RelationId,
    Vote,
    VoteAccounting,
    VoteDecision,
    VoteEvidence,
    VoteId,
    VoteIdentity,
    VoteProvenance,
    VoteRequest,
    VoteTiming,
    VoteVerdict,
)
from atlas_tools.relation.family_closure.api import FamilyAssignmentRow, family_id_for_relations
from atlas_tools.relation_cards.common.card import build_card, slugify
from atlas_tools.relation_cards.common.model import RelationCardInput
from atlas_tools.relation_cards.common.sentence import make_sentence_splitter
from atlas_tools.relation_cards.common.tokens import make_token_counter
from atlas_tools.relation_cards.hash.cards import HashCardsConfig
from atlas_tools.relation_cards.hash.model import HashRelationRecord
from atlas_tools.wikidata.config import Config as WikidataConfig
from atlas_tools.wikidata.model import PropertyRecord

_NOW = datetime(2026, 7, 20, tzinfo=UTC)
_PROMPT_PACK_HASH = PromptPackHash(sha256_bytes(b"annotation prompt pack"))


def _wikidata_record(pid: str, **overrides: object) -> PropertyRecord:
    number = pid.removeprefix("P")
    payload: dict[str, object] = {
        "pid": pid,
        "datatype": "wikibase-item",
        "labels": {"en": f"fixture relation number {number}"},
        "descriptions": {"en": "connects a fixture subject to a fixture object"},
        "retrieved_at": "Sat, 11 Jul 2026 21:49:16 GMT",
    }
    payload.update(overrides)
    return PropertyRecord.model_validate(payload)


def _write_intermediate(directory: Path, records: list[PropertyRecord]) -> Path:
    directory.mkdir()
    records_path = directory / "records.jsonl"
    records_path.write_bytes(
        b"".join(canonical_json_bytes(record) + b"\n" for record in records)
    )
    labels_path = directory / "entity_labels.json"
    labels_path.write_bytes(canonical_json_bytes({"P9000710": {"label": "counterpart"}}))
    meta = {
        "producer": "wikidata.extract-properties",
        "created_at": _NOW.isoformat(),
        "details": {
            "records_format_version": 3,
            "excluded": {"P9000999": "external-id"},
            "content_hashes": {
                "records.jsonl": sha256_bytes(records_path.read_bytes()),
                "entity_labels.json": sha256_bytes(labels_path.read_bytes()),
            },
        },
    }
    (directory / "records.meta.json").write_bytes(canonical_json_bytes(meta) + b"\n")
    return directory


def _hash_record() -> HashRelationRecord:
    return HashRelationRecord.model_validate_json(
        canonical_json_bytes({
            "base_url": "https://hash.ai/@h/types/entity-type/employed-by/",
            "version": 3,
            "versioned_url": "https://hash.ai/@h/types/entity-type/employed-by/v/3",
            "card_input": {
                "language": "en",
                "title": "Employed By",
                "description": "The employer of a person.",
                "source_types": [{"label": "Person"}],
                "target_types": [{"label": "Organization"}],
                "constraints": {"single_value": False, "direction": "source -> target"},
                "slug": "employed-by",
            },
        })
    )


def _rendered_hash(card_input: RelationCardInput, config: HashCardsConfig) -> str:
    card = build_card(
        card_input,
        config=config.cards,
        counter=make_token_counter(config.cards.tokenizer),
        splitter=make_sentence_splitter(config.cards.sentence_splitter),
    )
    return card.card_hash


def _resolved(
    relation_id: RelationId,
    *,
    card_input: RelationCardInput | None = None,
    identity: str | None = None,
) -> tuple[EvaluationCard, ResolvedCardContent]:
    config = HashCardsConfig()
    if card_input is None:
        number = relation_id.rpartition(":")[2].removeprefix("P")
        card_input = RelationCardInput.model_validate_json(
            canonical_json_bytes(
                {
                    "language": "en",
                    "title": f"fixture relation number {number}",
                    "constraints": {"direction": "source -> target"},
                }
            )
        )
    card = build_card(
        card_input,
        config=config.cards,
        counter=make_token_counter(config.cards.tokenizer),
        splitter=make_sentence_splitter(config.cards.sentence_splitter),
    )
    evaluation_card = EvaluationCard(
        relation_id=relation_id,
        producer=relation_id.partition(":")[0],
        card_text=card.card_text,
        card_hash=CardHash(card.card_hash),
        token_count=card.token_count,
    )
    resolved = ResolvedCardContent(
        source="wikidata",
        identity=identity or f"{WIKIDATA_ENTITY_URL_PREFIX}{relation_id.rpartition(':')[2]}",
        base_url=identity or f"{WIKIDATA_ENTITY_URL_PREFIX}{relation_id.rpartition(':')[2]}",
        publisher="wikidata",
        inverse_of=(),
        retrieved_at="Sat, 11 Jul 2026 21:49:16 GMT",
        source_record_hash=sha256_bytes(relation_id.encode()),
        slug=card_input.slug if card_input.slug is not None else slugify(card_input.title),
        card_input=card_input,
        rendered_card_hash=card.card_hash,
    )
    return evaluation_card, resolved


def _corpus_record(card: EvaluationCard, **overrides: object) -> CorpusRecord:
    payload: dict[str, object] = {
        "relation_id": card.relation_id,
        "card_hash": card.card_hash,
        "prescreen_stratum": "unstratified",
        "token_count": card.token_count,
        "is_holdout": False,
        "holdout_verdict": None,
        "is_shot_excluded": False,
    }
    payload.update(overrides)
    return CorpusRecord.model_validate(payload)


def _family(card: EvaluationCard) -> FamilyAssignmentRow:
    return FamilyAssignmentRow(
        relation_id=card.relation_id,
        card_hash=card.card_hash,
        family_id=family_id_for_relations((card.relation_id,)),
    )


def _vote(
    card: EvaluationCard,
    *,
    verdict: VoteVerdict = "proximal",
    repeat_index: int = 0,
    model: str = "test/judge-a",
) -> Vote:
    vote_id = VoteId(
        sha256_bytes(f"{card.relation_id}|{model}|{repeat_index}|{verdict}".encode())
    )
    return Vote(
        identity=VoteIdentity(vote_id=vote_id, relation_id=card.relation_id),
        provenance=VoteProvenance(
            card_hash=card.card_hash,
            rubric_version="rubric-v1",
            prompt_pack_hash=_PROMPT_PACK_HASH,
        ),
        request=VoteRequest(
            judge=JudgeRequestSpec(
                provider_name=ProviderName("Test Provider"),
                provider_slug=ProviderSlug("test-provider"),
                model=ModelId(model),
            ),
            bundle_id="S1xF1",
            effort="minimal",
            temperature=0.0,
            seed=7,
            repeat_index=repeat_index,
        ),
        decision=VoteDecision(
            verdict=verdict,
            reason="fixture evidence",
            raw_completion=f'{{"verdict":"{verdict}"}}',
        ),
        evidence=VoteEvidence(
            accepted_attempt_ids=(AttemptId(sha256_bytes(f"attempt:{vote_id}".encode())),),
            model_returned=ModelId(model),
        ),
        accounting=VoteAccounting(
            tokens_in=3,
            tokens_out=2,
            tokens_cached=0,
            known_cost_usd=0.01,
            cost_complete=True,
        ),
        timing=VoteTiming(request_at=_NOW, response_at=_NOW, latency=timedelta()),
    )


def _document_inputs() -> tuple[
    list[CorpusRecord],
    dict[RelationId, EvaluationCard],
    dict[RelationId, ResolvedCardContent],
    dict[RelationId, FamilyAssignmentRow],
    list[Vote],
]:
    card_a, resolved_a = _resolved("wikidata:P9000101")
    card_b, resolved_b = _resolved("wikidata:P9000102")
    corpus = [
        _corpus_record(card_a),
        _corpus_record(card_b, is_shot_excluded=True),
    ]
    deck = {card.relation_id: card for card in (card_a, card_b)}
    resolved = {card_a.relation_id: resolved_a, card_b.relation_id: resolved_b}
    families = {card.relation_id: _family(card) for card in (card_a, card_b)}
    votes = [
        _vote(card_a, verdict="overlay"),
        _vote(card_a, verdict="ABSTAIN", model="test/judge-b"),
    ]
    return corpus, deck, resolved, families, votes


class TestWikidataResolution:
    def test_resolves_content_identity_and_inverse_union(self, tmp_path: Path) -> None:
        records = [
            _wikidata_record(
                "P9000101",
                inverse_pid="P9000710",
                p1696_inverse_pids=("P9000101", "P9000720"),
            ),
            _wikidata_record("P9000102"),
        ]
        directory = _write_intermediate(tmp_path / "records", records)
        intermediate = load_wikidata_intermediate(directory)
        config = WikidataConfig()
        resolved = resolve_wikidata_contents(
            intermediate=intermediate,
            config=config,
            record_hashes={
                record.pid: sha256_bytes(canonical_json_bytes(record)) for record in records
            },
        )

        entry = resolved["wikidata:P9000101"]
        assert entry.identity == f"{WIKIDATA_ENTITY_URL_PREFIX}P9000101"
        assert entry.base_url == entry.identity
        assert entry.publisher == "wikidata"
        # Union of inverse_pid and P1696 facts, self-reference dropped.
        assert entry.inverse_of == (
            f"{WIKIDATA_ENTITY_URL_PREFIX}P9000710",
            f"{WIKIDATA_ENTITY_URL_PREFIX}P9000720",
        )
        assert entry.retrieved_at == "Sat, 11 Jul 2026 21:49:16 GMT"
        assert entry.source_record_hash == sha256_bytes(canonical_json_bytes(records[0]))
        assert entry.slug == slugify("fixture relation number 9000101")
        # The rendered hash is reproducible from the exported content alone.
        rendered = build_card(
            entry.card_input,
            config=config.cards,
            counter=make_token_counter(config.cards.tokenizer),
            splitter=make_sentence_splitter(config.cards.sentence_splitter),
        )
        assert rendered.card_hash == entry.rendered_card_hash

    def test_missing_row_hash_fails(self, tmp_path: Path) -> None:
        directory = _write_intermediate(tmp_path / "records", [_wikidata_record("P9000101")])
        intermediate = load_wikidata_intermediate(directory)
        with pytest.raises(ValueError, match="no pinned row hash"):
            resolve_wikidata_contents(
                intermediate=intermediate,
                config=WikidataConfig(),
                record_hashes={},
            )


class TestWikidataIntermediateLoader:
    def test_rejects_content_drift(self, tmp_path: Path) -> None:
        directory = _write_intermediate(tmp_path / "records", [_wikidata_record("P9000101")])
        (directory / "records.jsonl").write_bytes(b"{}\n")
        with pytest.raises(ValueError, match="does not match the hash"):
            load_wikidata_intermediate(directory)

    def test_rejects_unsupported_format(self, tmp_path: Path) -> None:
        directory = _write_intermediate(tmp_path / "records", [_wikidata_record("P9000101")])
        meta_path = directory / "records.meta.json"
        meta = json.loads(meta_path.read_text())
        meta["details"]["records_format_version"] = 2
        meta_path.write_bytes(canonical_json_bytes(meta) + b"\n")
        with pytest.raises(ValueError, match="unsupported"):
            load_wikidata_intermediate(directory)


class TestHashResolution:
    def test_resolves_versioned_identity_and_publisher(self, tmp_path: Path) -> None:
        record = _hash_record()
        link_types = tmp_path / "link-types.jsonl"
        link_types.write_bytes(canonical_json_bytes(record) + b"\n")
        config = HashCardsConfig()
        resolved = resolve_hash_contents(link_types_path=link_types, config=config)

        entry = resolved["hash:https://hash.ai/@h/types/entity-type/employed-by/"]
        assert entry.identity == "https://hash.ai/@h/types/entity-type/employed-by/v/3"
        assert entry.base_url == "https://hash.ai/@h/types/entity-type/employed-by/"
        assert entry.publisher == "hash.ai/@h"
        assert entry.inverse_of == ()
        assert entry.retrieved_at is None
        assert entry.source_record_hash is None
        assert entry.slug == "employed-by"
        assert entry.rendered_card_hash == _rendered_hash(record.card_input, config)

    def test_rejects_base_url_without_web_segment(self, tmp_path: Path) -> None:
        record = _hash_record()
        payload = json.loads(canonical_json_bytes(record))
        payload["base_url"] = "https://hash.ai/types/entity-type/employed-by/"
        link_types = tmp_path / "link-types.jsonl"
        link_types.write_bytes(canonical_json_bytes(payload) + b"\n")
        with pytest.raises(ValueError, match="@web segment"):
            resolve_hash_contents(link_types_path=link_types, config=HashCardsConfig())


class TestAssembly:
    def test_builds_ordered_validated_document(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        sources = {"cards.jsonl": sha256_bytes(b"cards")}
        document = build_annotation_corpus_document(
            corpus=corpus,
            deck_cards=deck,
            resolved_contents=resolved,
            families=families,
            votes=votes,
            sources=sources,
        )

        assert document.schema_id == ANNOTATION_CORPUS_SCHEMA
        identities = [card.identity for card in document.cards]
        assert identities == sorted(identities, key=lambda value: value.encode("utf-8"))
        voted = document.cards[0]
        # Sorted by canonical serialization bytes: judge-a's vote precedes
        # judge-b's; the ABSTAIN journal verdict ships as wire "abstain".
        assert [vote.verdict for vote in voted.votes] == ["overlay", "abstain"]
        assert all(vote.quantization is None for vote in voted.votes)
        assert voted.votes[0].model_pinned == "test/judge-a"
        assert voted.votes[0].model_returned == "test/judge-a"
        assert voted.votes[0].framing == "S1xF1"
        assert voted.votes[0].repeat_index == 0
        # The immutability pin sits at card level; the ``unstratified``
        # sentinel crosses the wire as null (final-inventory ruling).
        assert voted.retrieved_at is not None
        assert voted.source_record_hash is not None
        assert voted.flags.prescreen_stratum is None
        serialized = [canonical_json_bytes(vote) for vote in voted.votes]
        assert serialized == sorted(serialized)
        excluded = document.cards[1]
        assert excluded.flags.shot_excluded is True
        assert excluded.votes == ()
        # The document survives its own strict wire validation.
        payload = canonical_json_bytes(document)
        reparsed = AnnotationCorpusDocument.model_validate_json(payload)
        assert canonical_json_bytes(reparsed) == payload

    def test_shot_excluded_card_with_votes_fails(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        votes.append(_vote(deck["wikidata:P9000102"]))
        with pytest.raises(ValueError, match="shot-excluded card"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=votes,
                sources={},
            )

    def test_abstain_only_card_fails(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        votes = [vote for vote in votes if vote.verdict == "ABSTAIN"]
        with pytest.raises(ValueError, match="no non-abstain vote"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=votes,
                sources={},
            )

    def test_rendered_hash_drift_fails(self) -> None:
        corpus, deck, resolved, families, _votes = _document_inputs()
        relation_id = corpus[0].relation_id
        drifted, _ = _resolved(relation_id)
        object.__setattr__(drifted, "card_hash", sha256_bytes(b"someone else's rendering"))
        deck = {**deck, relation_id: drifted}
        corpus[0] = _corpus_record(drifted)
        with pytest.raises(ValueError, match="re-rendered content"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=[],
                sources={},
            )

    def test_vote_on_foreign_card_hash_fails(self) -> None:
        corpus, deck, resolved, families, _ = _document_inputs()
        foreign, _ = _resolved("wikidata:P9000103")
        with pytest.raises(ValueError, match="was cast on card"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=[
                    _vote(foreign).model_copy(
                        update={
                            "identity": VoteIdentity(
                                vote_id=VoteId(sha256_bytes(b"foreign")),
                                relation_id=corpus[0].relation_id,
                            )
                        }
                    )
                ],
                sources={},
            )

    def test_duplicate_vote_ids_with_differing_payloads_fail(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        duplicate = votes[0].model_copy(
            update={
                "decision": VoteDecision(
                    verdict="coincident",
                    reason="conflicting duplicate",
                    raw_completion='{"verdict":"coincident"}',
                )
            }
        )
        with pytest.raises(ValueError, match="occurs twice"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=[*votes, duplicate],
                sources={},
            )

    def test_identical_duplicate_votes_deduplicate(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        document = build_annotation_corpus_document(
            corpus=corpus,
            deck_cards=deck,
            resolved_contents=resolved,
            families=families,
            votes=[*votes, votes[0]],
            sources={},
        )
        assert len(document.cards[0].votes) == len(votes)

    def test_population_mismatch_fails(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        families.pop(corpus[0].relation_id)
        with pytest.raises(ValueError, match="family closure does not cover"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=votes,
                sources={},
            )

    def test_wikidata_card_without_pin_fails(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        relation_id = corpus[0].relation_id
        resolved[relation_id] = dataclasses.replace(
            resolved[relation_id],
            retrieved_at=None,
            source_record_hash=None,
        )
        with pytest.raises(ValueError, match="lacks its immutability pin"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=votes,
                sources={},
            )

    def test_hash_card_with_pin_fails(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        relation_id = corpus[0].relation_id
        resolved[relation_id] = dataclasses.replace(
            resolved[relation_id],
            source="hash",
            identity=f"{resolved[relation_id].identity}/v/1",
        )
        with pytest.raises(ValueError, match="foreign immutability pin"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=votes,
                sources={},
            )

    def test_unclear_holdout_ships_verbatim(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        card = deck[corpus[0].relation_id]
        corpus[0] = _corpus_record(card, is_holdout=True, holdout_verdict="unclear")
        document = build_annotation_corpus_document(
            corpus=corpus,
            deck_cards=deck,
            resolved_contents=resolved,
            families=families,
            votes=votes,
            sources={},
        )
        assert document.cards[0].flags.holdout == "unclear"

    def test_endpoint_constraints_serialize_as_phrase_objects(self) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        relation_id = corpus[1].relation_id
        card_input = RelationCardInput.model_validate_json(
            canonical_json_bytes(
                {
                    "language": "en",
                    "title": "fixture relation number 9000102",
                    "endpoint_constraints": [
                        {
                            "source_type": {"label": "Person", "description": "a human"},
                            "target_types": [{"label": "Organization"}],
                            "maximum_targets": 1,
                        }
                    ],
                    "constraints": {"direction": "source -> target"},
                }
            )
        )
        card, entry = _resolved(relation_id, card_input=card_input)
        deck[relation_id] = card
        resolved[relation_id] = entry
        corpus[1] = _corpus_record(card, is_shot_excluded=True)
        document = build_annotation_corpus_document(
            corpus=corpus,
            deck_cards=deck,
            resolved_contents=resolved,
            families={**families, relation_id: _family(card)},
            votes=votes,
            sources={},
        )
        parsed = json.loads(canonical_json_bytes(document))
        constraint = next(
            card["content"]["endpoint_constraints"][0]
            for card in parsed["cards"]
            if card["content"]["endpoint_constraints"]
        )
        assert constraint == {
            "source_type": {"label": "Person", "description": "a human"},
            "target_types": [{"label": "Organization", "description": None}],
            "minimum_targets": None,
            "maximum_targets": 1,
        }

    def test_url_in_content_fails_the_lint(self) -> None:
        corpus, deck, resolved, families, _votes = _document_inputs()
        relation_id = corpus[0].relation_id
        leaked_input = RelationCardInput.model_validate_json(
            canonical_json_bytes(
                {
                    "language": "en",
                    "title": "fixture relation number 9000101",
                    "description": "documented at https://example.com/spec",
                    "constraints": {"direction": "source -> target"},
                }
            )
        )
        entry = resolved[relation_id]
        resolved[relation_id] = ResolvedCardContent(
            source=entry.source,
            identity=entry.identity,
            base_url=entry.base_url,
            publisher=entry.publisher,
            inverse_of=entry.inverse_of,
            retrieved_at=entry.retrieved_at,
            source_record_hash=entry.source_record_hash,
            slug=entry.slug,
            card_input=leaked_input,
            rendered_card_hash=entry.rendered_card_hash,
        )
        with pytest.raises(ValueError, match="forbidden URL"):
            build_annotation_corpus_document(
                corpus=corpus,
                deck_cards=deck,
                resolved_contents=resolved,
                families=families,
                votes=[],
                sources={},
            )


class TestPublication:
    def test_publishes_canonical_bytes_and_counts(self, tmp_path: Path) -> None:
        corpus, deck, resolved, families, votes = _document_inputs()
        document = build_annotation_corpus_document(
            corpus=corpus,
            deck_cards=deck,
            resolved_contents=resolved,
            families=families,
            votes=votes,
            sources={"cards.jsonl": sha256_bytes(b"cards")},
        )
        output_path = tmp_path / "annotation-corpus.json"
        artifact = publish_annotation_corpus(document, output_path=output_path)

        payload = output_path.read_bytes()
        assert payload == canonical_json_bytes(document) + b"\n"
        assert artifact.content_hash == sha256_bytes(payload)
        assert artifact.card_count == 2
        assert artifact.wikidata_card_count == 2
        assert artifact.hash_card_count == 0
        assert artifact.vote_count == 2
        assert artifact.verdict_counts == {"abstain": 1, "overlay": 1}
        assert artifact.shot_excluded_count == 1
        assert artifact.holdout_count == 0
        parsed = json.loads(payload)
        assert parsed["schema"] == ANNOTATION_CORPUS_SCHEMA
