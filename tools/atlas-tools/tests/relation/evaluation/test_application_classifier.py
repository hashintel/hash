from pathlib import Path

import pytest
import yaml

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.application.analysis_codec import (
    write_embeddings,
    write_soft_labels,
)
from atlas_tools.relation.evaluation.application.classifier import fit_classifier
from atlas_tools.relation.evaluation.application.identity import panel_hash
from atlas_tools.relation.evaluation.domain.api import (
    ClassifierConfig,
    GridJudge,
    GridRunConfig,
    PanelConfig,
)
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
                provider_slug="fixture/provider",
                provider_name="Fixture Provider",
                model="fixture/model",
                pilot_cost_per_vote_usd=0.01,
            ),
        ),
    )
    payload = yaml.safe_dump(config.model_dump(mode="json"), sort_keys=True).encode()
    path.write_bytes(payload)
    return config, sha256_bytes(payload)


def test_classifier_application_binds_sources_and_reuses_a_valid_bundle(
    tmp_path: Path,
) -> None:
    labels, embeddings = _dataset()
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
        embedding_model="fixture-embedding",
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
        config_path=config_path,
        output_directory=output,
    )
    second = fit_classifier(
        soft_labels_path=soft_labels.path,
        embeddings_path=embedded.path,
        config_path=config_path,
        output_directory=output,
    )

    assert second.fit == first.fit
    assert first.metadata.metrics.training_cards == len(labels)
    assert first.metadata.config == config.classifier
    assert set(first.metadata.source_hashes) == {
        "embeddings.meta.json",
        "embeddings.parquet",
        "grid/cards.jsonl",
        "grid/imported-votes.jsonl",
        "grid/judges-panel",
        "grid/votes.jsonl",
        "grid-config",
        "soft-labels.meta.json",
        "soft-labels.parquet",
    }

    _write_config(
        config_path,
        config.classifier.model_copy(update={"max_iterations": 501}),
    )
    with pytest.raises(ValueError, match="embeddings belong to a different grid"):
        fit_classifier(
            soft_labels_path=soft_labels.path,
            embeddings_path=embedded.path,
            config_path=config_path,
            output_directory=output,
        )
