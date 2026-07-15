from datetime import UTC, datetime
from pathlib import Path
from types import MappingProxyType

import pytest
import yaml

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import SoftLabel
from atlas_tools.relation.evaluation.application.analysis_codec import (
    ClassifierBundleMetadata,
    EmbeddingProducerIdentity,
    SoftLabelsArtifact,
    load_classifier_bundle,
    write_embeddings,
    write_soft_labels,
)
from atlas_tools.relation.evaluation.application.api import (
    CoincidentReviewPaths,
    VerifiedCoincidentReviewArtifact,
)
from atlas_tools.relation.evaluation.application.classifier import fit_classifier
from atlas_tools.relation.evaluation.application.identity import panel_hash
from atlas_tools.relation.evaluation.domain.api import (
    ClassifierConfig,
    CoincidentReviewManifest,
    CoincidentReviewRow,
    CoincidentReviewSourceName,
    GridJudge,
    GridRunConfig,
    ModelId,
    PanelConfig,
    ProviderName,
    ProviderSlug,
    Sha256Hex,
    coincident_review_artifact_id,
    coincident_review_counts,
    coincident_review_decisions_hash,
)
from tests.relation.evaluation.classifier_fixtures import write_verified_family_closure
from tests.relation.evaluation.test_analysis_classifier import _dataset


def _write_config(path: Path, classifier: ClassifierConfig) -> tuple[GridRunConfig, str]:
    config = GridRunConfig(
        panel=PanelConfig(
            version=1,
            frozen=True,
            pruning_floor="fixture qualification",
        ),
        classifier=classifier,
        judges=(
            GridJudge(
                provider_slug=ProviderSlug("fixture/provider"),
                provider_name=ProviderName("Fixture Provider"),
                model=ModelId("fixture/model"),
                effort="minimal",
                pilot_cost_per_vote_usd=0.01,
            ),
        ),
    )
    payload = yaml.safe_dump(config.model_dump(mode="json"), sort_keys=True).encode()
    path.write_bytes(payload)
    return config, sha256_bytes(payload)


def _coincident_artifact(
    directory: Path,
    labels: tuple[SoftLabel, ...],
) -> VerifiedCoincidentReviewArtifact:
    reviewed_labels = tuple(label for label in labels if label.review)
    rows = tuple(
        CoincidentReviewRow(
            relation_id=label.relation_id,
            card_hash=label.card_hash,
            action="confirmed",
        )
        for label in reviewed_labels
    )
    decisions_hash = coincident_review_decisions_hash(rows)
    counts = coincident_review_counts(rows)
    source_hashes: dict[CoincidentReviewSourceName, Sha256Hex] = {
        "grid-deliverables/gates.json": "a" * 64,
        "grid-deliverables/coincident-queue.jsonl": "b" * 64,
        "cards.jsonl": "c" * 64,
        "cards.manifest.json": "d" * 64,
    }
    reviewer = "Ada Reviewer"
    manifest = CoincidentReviewManifest(
        reviewer=reviewer,
        source_hashes=source_hashes,
        decisions_hash=decisions_hash,
        counts=counts,
        artifact_id=coincident_review_artifact_id(
            reviewer=reviewer,
            source_hashes=source_hashes,
            decisions_hash=decisions_hash,
            counts=counts,
        ),
        created_at=datetime.now(UTC),
    )
    paths = CoincidentReviewPaths.in_directory(directory)
    return VerifiedCoincidentReviewArtifact(
        paths=paths,
        manifest=manifest,
        rows=rows,
        by_relation_id=MappingProxyType({row.relation_id: row for row in rows}),
        rows_hash=decisions_hash,
        manifest_hash="e" * 64,
    )


def test_classifier_application_binds_sources_and_reuses_a_valid_bundle(
    tmp_path: Path,
) -> None:
    labels, embeddings = _dataset()
    closure = write_verified_family_closure(tmp_path / "closure", labels)
    config_path = tmp_path / "grid.yaml"
    config, config_hash = _write_config(
        config_path,
        ClassifierConfig(folds=3, max_iterations=500, seed=17),
    )
    card_hash = "a" * 64
    soft_labels = write_soft_labels(
        tmp_path / "soft-labels.parquet",
        labels,
        source_hashes={
            "cards.jsonl": card_hash,
            "imported-votes.jsonl": "b" * 64,
            "judges-panel": panel_hash(config),
            "votes.jsonl": "c" * 64,
        },
    )
    embedded = write_embeddings(
        tmp_path / "embeddings.parquet",
        embeddings,
        producer=EmbeddingProducerIdentity.verified(
            endpoint_url="https://embedding.test/v1/embeddings",
            model="fixture-embedding",
            dimension=embeddings[0].dimension,
        ),
        source_hashes={
            "cards.jsonl": card_hash,
            "cards.manifest.json": "d" * 64,
            "grid-config": config_hash,
        },
    )
    output = tmp_path / "classifier"

    first = fit_classifier(
        soft_labels_path=soft_labels.path,
        embeddings_path=embedded.path,
        closure_directory=closure.directory,
        config_path=config_path,
        output_directory=output,
    )
    second = fit_classifier(
        soft_labels_path=soft_labels.path,
        embeddings_path=embedded.path,
        closure_directory=closure.directory,
        config_path=config_path,
        output_directory=output,
    )

    assert second.fit == first.fit
    assert first.metadata.metrics.training_cards == len(labels)
    assert first.metadata.config == config.classifier
    assert set(first.metadata.source_hashes) == {
        "embeddings.meta.json",
        "embeddings.parquet",
        "family-closure/families.jsonl",
        "family-closure/families.manifest.json",
        "grid/cards.jsonl",
        "grid/imported-votes.jsonl",
        "grid/judges-panel",
        "grid/votes.jsonl",
        "grid-config",
        "soft-labels.meta.json",
        "soft-labels.parquet",
    }
    assert first.metadata.closure.artifact_id == closure.manifest.details.artifact_id
    assert tuple(row.family_id for row in first.fit.out_of_fold) == tuple(
        row.family_id for row in closure.rows
    )

    mismatched_closure = write_verified_family_closure(
        tmp_path / "mismatched-closure",
        labels,
        provenance_seed="mismatched",
    )
    with pytest.raises(ValueError, match="different family closure"):
        fit_classifier(
            soft_labels_path=soft_labels.path,
            embeddings_path=embedded.path,
            closure_directory=mismatched_closure.directory,
            config_path=config_path,
            output_directory=output,
        )

    _write_config(
        config_path,
        config.classifier.model_copy(update={"max_iterations": 501}),
    )
    with pytest.raises(ValueError, match="embeddings belong to a different grid"):
        fit_classifier(
            soft_labels_path=soft_labels.path,
            embeddings_path=embedded.path,
            closure_directory=closure.directory,
            config_path=config_path,
            output_directory=output,
        )


def test_classifier_application_applies_and_binds_coincident_reviews(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    labels, embeddings = _dataset()
    closure = write_verified_family_closure(tmp_path / "closure-reviewed", labels)
    config_path = tmp_path / "reviewed-grid.yaml"
    config, config_hash = _write_config(
        config_path,
        ClassifierConfig(folds=3, max_iterations=500, seed=17),
    )
    cards_hash = closure.manifest.details.concat.cards_hash
    cards_manifest_hash = closure.manifest.details.concat.manifest_hash
    soft_labels = write_soft_labels(
        tmp_path / "reviewed-soft-labels.parquet",
        labels,
        source_hashes={
            "cards.jsonl": cards_hash,
            "imported-votes.jsonl": "b" * 64,
            "judges-panel": panel_hash(config),
            "votes.jsonl": "c" * 64,
        },
    )
    embedded = write_embeddings(
        tmp_path / "reviewed-embeddings.parquet",
        embeddings,
        producer=EmbeddingProducerIdentity.verified(
            endpoint_url="https://embedding.test/v1/embeddings",
            model="fixture-embedding",
            dimension=embeddings[0].dimension,
        ),
        source_hashes={
            "cards.jsonl": cards_hash,
            "cards.manifest.json": cards_manifest_hash,
            "grid-config": config_hash,
        },
    )
    reviews_directory = tmp_path / "reviews"
    deliverables_directory = tmp_path / "deliverables"
    reviews_directory.mkdir()
    deliverables_directory.mkdir()
    artifact = _coincident_artifact(reviews_directory, labels)

    def load_reviews(
        directory: Path,
        *,
        deliverables: Path,
        soft_labels: SoftLabelsArtifact,
        expected_cards_hash: Sha256Hex,
        expected_config_hash: Sha256Hex | None = None,
    ) -> VerifiedCoincidentReviewArtifact:
        assert directory == reviews_directory
        assert deliverables == deliverables_directory
        assert soft_labels.path.name in (
            "reviewed-soft-labels.parquet",
            "drifted-reviewed-soft-labels.parquet",
        )
        assert expected_cards_hash == cards_hash
        assert expected_config_hash in (None, config_hash)
        return artifact

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.classifier.load_classifier_coincident_reviews",
        load_reviews,
    )
    bundle = fit_classifier(
        soft_labels_path=soft_labels.path,
        embeddings_path=embedded.path,
        closure_directory=closure.directory,
        config_path=config_path,
        output_directory=tmp_path / "classifier-reviewed",
        coincident_reviews_directory=reviews_directory,
        deliverables_directory=deliverables_directory,
    )

    assert isinstance(bundle.metadata, ClassifierBundleMetadata)
    assert bundle.metadata.coincident_reviews is not None
    assert bundle.metadata.coincident_reviews.artifact_id == artifact.manifest.artifact_id
    assert (
        bundle.metadata.source_hashes["coincident-reviews/coincident-reviews.jsonl"]
        == artifact.rows_hash
    )
    assert (
        bundle.metadata.source_hashes["coincident-reviews/coincident-reviews.manifest.json"]
        == artifact.manifest_hash
    )
    expected_weight = sum(label.n_votes for label in labels)
    assert bundle.metadata.metrics.training_vote_weight == expected_weight

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.analysis_codec."
        "load_classifier_coincident_reviews",
        load_reviews,
    )
    loaded = load_classifier_bundle(
        bundle.directory,
        closure=closure,
        soft_labels=soft_labels,
        coincident_reviews_directory=reviews_directory,
        deliverables_directory=deliverables_directory,
    )
    assert loaded.metadata == bundle.metadata
    assert loaded.fit == bundle.fit

    drifted_rows = (
        *labels[:2],
        labels[2].model_copy(update={"prescreen_stratum": "drifted fixture"}),
        *labels[3:],
    )
    drifted_soft_labels = write_soft_labels(
        tmp_path / "drifted-reviewed-soft-labels.parquet",
        drifted_rows,
        source_hashes=dict(soft_labels.metadata.source_hashes),
    )
    with pytest.raises(ValueError, match="different soft-label artifact bytes"):
        load_classifier_bundle(
            bundle.directory,
            closure=closure,
            soft_labels=drifted_soft_labels,
            coincident_reviews_directory=reviews_directory,
            deliverables_directory=deliverables_directory,
        )
