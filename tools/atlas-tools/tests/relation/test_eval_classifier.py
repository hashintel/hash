"""Gates arithmetic, embedding cache, classifier harness, and grouped-CV leakage."""

import struct
from dataclasses import dataclass, field
from datetime import timedelta
from fractions import Fraction
from hashlib import sha256
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from atlas_tools.relation.eval.aggregate import (
    _SOFT_LABELS_SCHEMA,
    SoftLabelRow,
    aggregate_soft_labels,
    read_soft_labels,
)
from atlas_tools.relation.eval.classifier import (
    TrainingData,
    fit_classifier,
    load_bundle,
    out_of_fold_logits,
    read_predictions,
    soft_cross_entropy,
)
from atlas_tools.relation.eval.contract import ClassifierConfig, EmbeddingConfig
from atlas_tools.relation.eval.embeddings import (
    EmbeddingBudgetExceededError,
    EmbeddingVector,
    embed_cards,
    read_embeddings,
)
from atlas_tools.relation.eval.gates import (
    dirichlet_posterior_mean,
    minimum_feedable_count,
    normalized_posterior_entropy,
    wilson_lower_bound,
)
from atlas_tools.relation.eval.ladder_report import write_report
from atlas_tools.relation.eval.run import load_run_config, run_ladder
from atlas_tools.relation.eval.schema import GoldRow
from tests.relation.ladder_fixtures import (
    CARD_C,
    CARD_O,
    CARD_P,
    CARD_U,
    LIVE_CARDS,
    MappingTransport,
    ladder_config,
    live_relation_id,
    write_ladder_concat,
    write_ladder_config,
)


@pytest.fixture
def cards_dir(tmp_path: Path) -> Path:
    return write_ladder_concat(tmp_path / "concat")


# --- Gates (acceptance 7 arithmetic) ---------------------------------------------


def test_dirichlet_posterior_matches_hand_computed_fractions() -> None:
    posterior = dirichlet_posterior_mean({"coincident": 7, "proximal": 1, "overlay": 0})
    assert posterior["coincident"] == pytest.approx(float(Fraction(8, 11)))
    assert posterior["proximal"] == pytest.approx(float(Fraction(2, 11)))
    assert posterior["overlay"] == pytest.approx(float(Fraction(1, 11)))


def test_empty_counts_yield_the_uniform_prior_with_full_entropy() -> None:
    posterior = dirichlet_posterior_mean({})
    assert posterior["coincident"] == pytest.approx(1 / 3)
    assert normalized_posterior_entropy(posterior) == pytest.approx(1.0)


def test_wilson_lower_bound_is_monotone_in_evidence() -> None:
    assert wilson_lower_bound(10, 10) < wilson_lower_bound(100, 100)
    assert wilson_lower_bound(90, 100) < wilson_lower_bound(95, 100)
    assert 0.0 <= wilson_lower_bound(0, 10) < wilson_lower_bound(10, 10) < 1.0


def test_minimum_feedable_count_for_the_coincident_gate() -> None:
    minimum = minimum_feedable_count(0.98, confidence=0.95)
    assert minimum == 133
    assert wilson_lower_bound(minimum, minimum, confidence=0.95) >= 0.98
    assert wilson_lower_bound(minimum - 1, minimum - 1, confidence=0.95) < 0.98


# --- Embeddings -------------------------------------------------------------------


def _vector_for(text: str, dimension: int) -> EmbeddingVector:
    digest = sha256(text.encode("utf-8")).digest()
    return [struct.unpack_from(">I", digest, 4 * index)[0] / 2**32 for index in range(dimension)]


@dataclass
class CountingEmbeddingTransport:
    dimension: int = 4
    batch_sizes: list[int] = field(default_factory=list)

    def embed(self, texts: list[str]) -> list[EmbeddingVector]:
        self.batch_sizes.append(len(texts))
        return [_vector_for(text, self.dimension) for text in texts]


def _embedding_config(*, max_texts: int | None = None) -> EmbeddingConfig:
    return EmbeddingConfig(
        endpoint_url="http://embedding.invalid/v1/embeddings",
        model="test-embed-1",
        api_key_env=None,
        dimension=4,
        batch_size=2,
        max_texts=max_texts,
        request_timeout=timedelta(seconds=5),
    )


def test_embeddings_are_cached_forever_by_hash(cards_dir: Path, tmp_path: Path) -> None:
    config_path = write_ladder_config(
        tmp_path / "judges.yaml", ladder_config(embedding=_embedding_config())
    )
    transport = CountingEmbeddingTransport()
    first = embed_cards(
        cards_dir=cards_dir,
        loaded_config=load_run_config(config_path),
        out_path=tmp_path / "embeddings.parquet",
        cache_dir=tmp_path / "cache",
        transport=transport,
    )
    assert first.rows == len(LIVE_CARDS)
    assert first.requested_texts == len(LIVE_CARDS)
    assert sum(transport.batch_sizes) == len(LIVE_CARDS)

    again = embed_cards(
        cards_dir=cards_dir,
        loaded_config=load_run_config(config_path),
        out_path=tmp_path / "embeddings-again.parquet",
        cache_dir=tmp_path / "cache",
        transport=transport,
    )
    assert again.requested_texts == 0
    assert again.cached_texts == len(LIVE_CARDS)
    assert (tmp_path / "embeddings.parquet").read_bytes() == (
        tmp_path / "embeddings-again.parquet"
    ).read_bytes()

    table = read_embeddings(tmp_path / "embeddings.parquet")
    assert table.details.embedding_model == "test-embed-1"
    assert table.details.dimension == 4
    assert table.matrix.shape == (len(LIVE_CARDS), 4)


def test_embedding_budget_aborts_cleanly_and_resumes_from_cache(
    cards_dir: Path, tmp_path: Path
) -> None:
    capped = write_ladder_config(
        tmp_path / "judges-capped.yaml",
        ladder_config(embedding=_embedding_config(max_texts=2)),
    )
    transport = CountingEmbeddingTransport()
    with pytest.raises(EmbeddingBudgetExceededError, match="budget of 2 uncached texts"):
        embed_cards(
            cards_dir=cards_dir,
            loaded_config=load_run_config(capped),
            out_path=tmp_path / "embeddings.parquet",
            cache_dir=tmp_path / "cache",
            transport=transport,
        )
    assert sum(transport.batch_sizes) == 2

    uncapped = write_ladder_config(
        tmp_path / "judges.yaml", ladder_config(embedding=_embedding_config())
    )
    resumed = embed_cards(
        cards_dir=cards_dir,
        loaded_config=load_run_config(uncapped),
        out_path=tmp_path / "embeddings.parquet",
        cache_dir=tmp_path / "cache",
        transport=transport,
    )
    assert resumed.cached_texts == 2
    assert resumed.requested_texts == len(LIVE_CARDS) - 2


# --- Grouped CV and leakage (acceptance 5) -----------------------------------------


def _sibling_training_data(*, families: int, siblings: int = 2) -> TrainingData:
    """Construct sibling pairs sharing a family: the leakage-test population."""
    rng = np.random.default_rng(0)
    count = families * siblings
    embeddings = rng.normal(size=(count, 6))
    raw = rng.dirichlet((1.0, 1.0, 1.0), size=count)
    labels = tuple(
        SoftLabelRow(
            relation_id=f"wikidata:P8{index:06d}",
            card_hash=sha256(f"card-{index}".encode()).hexdigest(),
            producer="wikidata",
            family_id=f"family-{index // siblings}",
            prescreen_stratum="ordinary",
            p_coincident=raw[index, 0],
            p_proximal=raw[index, 1],
            p_overlay=raw[index, 2],
            n_votes=8,
            coincident_votes=0,
            proximal_votes=8,
            overlay_votes=0,
            unclear_votes=0,
            abstentions=0,
            entropy=0.5,
            rung_reached=2,
            early_exit=False,
            review=False,
        )
        for index in range(count)
    )
    return TrainingData(
        labels=labels,
        families=tuple(label.family_id for label in labels if label.family_id is not None),
        embeddings=embeddings,
        targets=raw,
        vote_weights=np.full(count, 8.0),
    )


def test_grouped_cv_never_splits_a_sibling_pair() -> None:
    data = _sibling_training_data(families=8)
    _logits, fold_indices = out_of_fold_logits(data, ClassifierConfig(folds=4))
    folds_by_family: dict[str, set[int]] = {}
    for family_id, fold in zip(data.families, fold_indices, strict=True):
        folds_by_family.setdefault(family_id, set()).add(int(fold))
    # Every family — a relation and its inverse/siblings — is tested in exactly
    # one fold, so no pair ever straddles a train/test split.
    assert all(len(folds) == 1 for folds in folds_by_family.values())
    assert {fold for folds in folds_by_family.values() for fold in folds} == {0, 1, 2, 3}


def test_grouped_cv_requires_enough_families() -> None:
    data = _sibling_training_data(families=3)
    with pytest.raises(ValueError, match="at least 5 relation families"):
        out_of_fold_logits(data, ClassifierConfig(folds=5))


def test_soft_cross_entropy_weights_by_vote_count() -> None:
    probabilities = np.asarray([[0.8, 0.1, 0.1], [0.1, 0.8, 0.1]])
    targets = np.asarray([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
    balanced = soft_cross_entropy(probabilities, targets, np.asarray([1.0, 1.0]))
    assert balanced == pytest.approx(-np.log(0.8))
    skewed = soft_cross_entropy(
        np.asarray([[0.8, 0.1, 0.1], [0.1, 0.1, 0.8]]),
        targets,
        np.asarray([3.0, 1.0]),
    )
    assert skewed == pytest.approx((3 * -np.log(0.8) + -np.log(0.1)) / 4)


def test_fit_refuses_cards_without_a_relation_family(tmp_path: Path) -> None:
    data = _sibling_training_data(families=4)
    orphaned = [
        row.model_copy(update={"family_id": None}) if index == 0 else row
        for index, row in enumerate(data.labels)
    ]
    labels_path = tmp_path / "soft-labels.parquet"
    pq.write_table(
        pa.Table.from_pylist(
            [row.model_dump(mode="python") for row in orphaned], schema=_SOFT_LABELS_SCHEMA
        ),
        labels_path,
    )
    rows = read_soft_labels(labels_path)
    assert rows[0].family_id is None
    # The loud failure itself is exercised through fit_classifier in the
    # pipeline test; here the parquet boundary must preserve the null.


# --- Pipeline: run -> aggregate -> embed -> fit -> report ---------------------------


def test_pipeline_fits_calibrates_and_reports_with_the_classifier(
    cards_dir: Path, tmp_path: Path
) -> None:
    config_path = write_ladder_config(
        tmp_path / "judges.yaml",
        ladder_config(
            embedding=_embedding_config(),
            classifier=ClassifierConfig(folds=2, seed=0),
        ),
    )
    loaded = load_run_config(config_path)
    paths = run_ladder(
        cards_dir=cards_dir,
        out_dir=tmp_path / "run",
        loaded_config=loaded,
        transport=MappingTransport(),
    )
    aggregate = aggregate_soft_labels(
        run_dir=tmp_path / "run",
        cards_dir=cards_dir,
        loaded_config=loaded,
        out_path=tmp_path / "soft-labels.parquet",
    )
    embedded = embed_cards(
        cards_dir=cards_dir,
        loaded_config=loaded,
        out_path=tmp_path / "embeddings.parquet",
        cache_dir=tmp_path / "cache",
        transport=CountingEmbeddingTransport(),
    )
    fitted = fit_classifier(
        soft_labels_path=aggregate.soft_labels_parquet,
        embeddings_path=embedded.embeddings_parquet,
        loaded_config=loaded,
        out_dir=tmp_path / "classifier",
    )
    metadata = fitted.metadata
    assert metadata.rubric_version == "rubric-v1"
    assert metadata.embedding_model == "test-embed-1"
    assert metadata.embedding_dimension == 4
    assert metadata.judges_config_hash == loaded.content_hash
    assert metadata.training_cards == len(LIVE_CARDS)
    # Early exits carry four votes, full-panel cards eight, all-unclear zero.
    assert metadata.training_vote_weight == pytest.approx(4.0 + 4.0 + 8.0 + 8.0)
    assert metadata.temperature > 0.0
    assert metadata.calibrated_cross_entropy <= metadata.out_of_fold_cross_entropy + 1e-9

    reloaded_metadata, predictions = load_bundle(fitted.bundle_dir)
    assert reloaded_metadata == metadata
    assert len(predictions) == len(LIVE_CARDS)
    assert predictions == read_predictions(fitted.predictions_parquet)
    for row in predictions:
        total = row.p_cal_coincident + row.p_cal_proximal + row.p_cal_overlay
        assert total == pytest.approx(1.0)
        assert 0.0 <= row.applicability <= 1.0

    arrays = np.load(fitted.arrays_npz)
    assert arrays["coefficients"].shape == (3, 4)
    assert arrays["applicability_precision"].shape == (4, 4)

    gold_path = tmp_path / "gold.jsonl"
    gold_rows = [
        GoldRow(
            relation_id=live_relation_id(CARD_C), verdict="coincident", pass_count=3, entropy=0.0
        ),
        GoldRow(
            relation_id=live_relation_id(CARD_P), verdict="proximal", pass_count=3, entropy=0.0
        ),
        GoldRow(relation_id=live_relation_id(CARD_O), verdict="overlay", pass_count=3, entropy=0.0),
        GoldRow(relation_id=live_relation_id(CARD_U), verdict="unclear", pass_count=2, entropy=0.9),
    ]
    gold_path.write_text(
        "".join(row.model_dump_json() + "\n" for row in gold_rows), encoding="utf-8"
    )
    result = write_report(
        run_dir=paths.votes_jsonl.parent,
        cards_dir=cards_dir,
        loaded_config=loaded,
        gold_path=gold_path,
        classifier_dir=fitted.bundle_dir,
        out_dir=tmp_path / "report",
    )
    report = result.report
    assert report.classifier_gold is not None
    assert report.classifier_gold.source == "classifier"
    assert report.classifier_gold.matched == 3
    assert report.coincident_gate is not None
    assert report.coincident_gate.source == "classifier"
    assert report.coincident_gate.verdict == "UNPASSABLE BY SAMPLE SIZE"
    assert report.calibration is not None
    assert len(report.calibration) == loaded.ladder().report.calibration_bins
    assert report.applicability is not None
    assert [summary.producer for summary in report.applicability] == ["wikidata"]
    markdown = result.report_md.read_text(encoding="utf-8")
    assert "Applicability by source" in markdown
    assert "Calibration" in markdown


def test_fit_fails_loudly_when_family_ids_are_missing(cards_dir: Path, tmp_path: Path) -> None:
    config_path = write_ladder_config(
        tmp_path / "judges.yaml",
        ladder_config(embedding=_embedding_config(), classifier=ClassifierConfig(folds=2)),
    )
    loaded = load_run_config(config_path)
    run_ladder(
        cards_dir=cards_dir,
        out_dir=tmp_path / "run",
        loaded_config=loaded,
        transport=MappingTransport(),
    )
    aggregate = aggregate_soft_labels(
        run_dir=tmp_path / "run",
        cards_dir=cards_dir,
        loaded_config=loaded,
        out_path=tmp_path / "soft-labels.parquet",
    )
    orphaned = [row.model_copy(update={"family_id": None}) for row in aggregate.rows]
    labels_path = tmp_path / "orphaned.parquet"
    pq.write_table(
        pa.Table.from_pylist(
            [row.model_dump(mode="python") for row in orphaned], schema=_SOFT_LABELS_SCHEMA
        ),
        labels_path,
    )
    embedded = embed_cards(
        cards_dir=cards_dir,
        loaded_config=loaded,
        out_path=tmp_path / "embeddings.parquet",
        cache_dir=tmp_path / "cache",
        transport=CountingEmbeddingTransport(),
    )
    with pytest.raises(ValueError, match="requires family_id on every card"):
        fit_classifier(
            soft_labels_path=labels_path,
            embeddings_path=embedded.embeddings_parquet,
            loaded_config=loaded,
            out_dir=tmp_path / "classifier",
        )
