"""Tests for verified SALT fit-input export."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.concat.api import ConcatCardRow
from atlas_tools.relation.evaluation.analysis.api import EmbeddingRow
from atlas_tools.relation.evaluation.application import fit_inputs
from atlas_tools.relation.evaluation.domain.api import CardHash

VERSIONED_URL = "https://hash.ai/@h/types/entity-type/owns/v/3"


def _card() -> ConcatCardRow:
    card_text = "Ownership links an owner to an asset."
    base_url = "https://hash.ai/@h/types/entity-type/owns/"
    return ConcatCardRow(
        relation_id=f"hash:{base_url}",
        producer="hash",
        card_text=card_text,
        card_hash=sha256_bytes(card_text.encode()),
        token_count=9,
        truncations=[],
        severely_truncated=False,
        versioned_url=VERSIONED_URL,
    )


def test_export_fit_inputs_keeps_real_url_and_embedding(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    card = _card()
    projected = SimpleNamespace(relation_id=card.relation_id, card_hash=card.card_hash)
    deck = SimpleNamespace(
        cards_path=tmp_path / "cards.jsonl",
        cards=(projected,),
        source_hashes={"cards.jsonl": "11" * 32, "cards.manifest.json": "22" * 32},
    )
    embedding = EmbeddingRow.from_values(
        relation_id=card.relation_id,
        card_hash=CardHash(card.card_hash),
        values=[0.0] * 3_072,
    )
    embeddings = SimpleNamespace(
        metadata=SimpleNamespace(source_hashes=dict(deck.source_hashes)),
        rows=(embedding,),
    )
    monkeypatch.setattr(
        fit_inputs,
        "load_atlas_classifier",
        lambda _path: SimpleNamespace(content_hash="33" * 32),
    )
    monkeypatch.setattr(fit_inputs, "load_deck", lambda _path: deck)
    monkeypatch.setattr(fit_inputs, "load_embeddings", lambda _path: embeddings)
    monkeypatch.setattr(fit_inputs, "_raw_cards", lambda _path: (card,))
    output = tmp_path / "relation-policy-inputs.json"

    artifact = fit_inputs.export_fit_inputs(
        classifier_path=tmp_path / "classifier.salt",
        cards_directory=tmp_path / "cards",
        embeddings_path=tmp_path / "embeddings.parquet",
        output_path=output,
    )

    document = json.loads(output.read_bytes())
    entry = document["relations"][VERSIONED_URL]
    assert document["schemaVersion"] == 1
    assert len(entry["embedding"]) == 3_072
    assert entry["humanOverride"] is None
    assert entry["humanReviewed"] is None
    assert entry["synthetic"] is None
    assert artifact.relation_count == 1
    assert artifact.content_hash == sha256_bytes(output.read_bytes())


def test_export_fit_inputs_rejects_noncanonical_embedding_dimension(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    card = _card()
    projected = SimpleNamespace(relation_id=card.relation_id, card_hash=card.card_hash)
    deck = SimpleNamespace(
        cards_path=tmp_path / "cards.jsonl",
        cards=(projected,),
        source_hashes={"cards.jsonl": "11" * 32},
    )
    embedding = EmbeddingRow.from_values(
        relation_id=card.relation_id,
        card_hash=CardHash(card.card_hash),
        values=[0.0] * 512,
    )
    monkeypatch.setattr(
        fit_inputs,
        "load_atlas_classifier",
        lambda _path: SimpleNamespace(content_hash="33" * 32),
    )
    monkeypatch.setattr(fit_inputs, "load_deck", lambda _path: deck)
    monkeypatch.setattr(
        fit_inputs,
        "load_embeddings",
        lambda _path: SimpleNamespace(
            metadata=SimpleNamespace(source_hashes=dict(deck.source_hashes)),
            rows=(embedding,),
        ),
    )
    monkeypatch.setattr(fit_inputs, "_raw_cards", lambda _path: (card,))

    with pytest.raises(ValueError, match="expected 3072"):
        fit_inputs.export_fit_inputs(
            classifier_path=tmp_path / "classifier.salt",
            cards_directory=tmp_path / "cards",
            embeddings_path=tmp_path / "embeddings.parquet",
            output_path=tmp_path / "relation-policy-inputs.json",
        )
