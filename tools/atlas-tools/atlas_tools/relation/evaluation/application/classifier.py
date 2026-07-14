"""Fit or revalidate one deterministic policy-classifier bundle."""

from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.analysis.api import fit_policy_classifier
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierBundle,
    EmbeddingsArtifact,
    SoftLabelsArtifact,
)
from atlas_tools.relation.evaluation.application.analysis_codec import (
    load_classifier_bundle_async,
    load_embeddings_async,
    load_soft_labels_async,
    write_classifier_bundle_async,
)
from atlas_tools.relation.evaluation.application.identity import panel_hash
from atlas_tools.relation.evaluation.application.source import hash_paths
from atlas_tools.relation.evaluation.storage.api import LoadedConfig, load_config_async


async def _load_inputs(
    *,
    config_path: Path,
    soft_labels_path: Path,
    embeddings_path: Path,
) -> tuple[LoadedConfig, SoftLabelsArtifact, EmbeddingsArtifact]:
    configs: list[LoadedConfig] = []
    labels: list[SoftLabelsArtifact] = []
    embeddings: list[EmbeddingsArtifact] = []

    async def load_config() -> None:
        configs.append(await load_config_async(config_path))

    async def load_labels() -> None:
        labels.append(await load_soft_labels_async(soft_labels_path))

    async def load_embedding_rows() -> None:
        embeddings.append(await load_embeddings_async(embeddings_path))

    async with trio.open_nursery() as nursery:
        nursery.start_soon(load_config)
        nursery.start_soon(load_labels)
        nursery.start_soon(load_embedding_rows)
    if len(configs) != 1 or len(labels) != 1 or len(embeddings) != 1:
        raise AssertionError("parallel classifier loaders did not each return once")
    return configs[0], labels[0], embeddings[0]


def _validate_sources(
    loaded: LoadedConfig,
    labels: SoftLabelsArtifact,
    embeddings: EmbeddingsArtifact,
) -> None:
    config = loaded.grid()
    label_sources = labels.metadata.source_hashes
    embedding_sources = embeddings.metadata.source_hashes
    if label_sources.get("cards.jsonl") != embedding_sources.get("cards.jsonl"):
        raise ValueError("soft labels and embeddings belong to different card artifacts")
    if label_sources.get("judges-panel") != panel_hash(config):
        raise ValueError("soft labels belong to a different grid panel")
    if embedding_sources.get("grid-config") != loaded.content_hash:
        raise ValueError("embeddings belong to a different grid configuration")


async def _source_hashes(
    *,
    loaded: LoadedConfig,
    labels: SoftLabelsArtifact,
    embeddings: EmbeddingsArtifact,
) -> dict[str, str]:
    files = await hash_paths(
        {
            "embeddings.meta.json": embeddings.sidecar_path,
            "embeddings.parquet": embeddings.path,
            "soft-labels.meta.json": labels.sidecar_path,
            "soft-labels.parquet": labels.path,
        }
    )
    grid_sources = {
        f"grid/{name}": content_hash for name, content_hash in labels.metadata.source_hashes.items()
    }
    return {**files, **grid_sources, "grid-config": loaded.content_hash}


async def fit_classifier_async(
    *,
    soft_labels_path: Path,
    embeddings_path: Path,
    config_path: Path,
    output_directory: Path,
) -> ClassifierBundle:
    """Fit every card with grouped folds or validate an existing bundle.

    Soft labels and embeddings must bind the same card artifact, and each must
    bind the requested grid configuration through its semantic panel or exact
    source hash. Existing output is reused only after complete bundle and
    source validation.

    Raises:
        ValueError: Sources, training identities, folds, optimizer convergence,
            or a durable bundle violate the classifier contract.
        OSError: An input or output artifact cannot be accessed durably.

    """
    loaded, labels, embeddings = await _load_inputs(
        config_path=config_path,
        soft_labels_path=soft_labels_path,
        embeddings_path=embeddings_path,
    )
    _validate_sources(loaded, labels, embeddings)
    sources = await _source_hashes(
        loaded=loaded,
        labels=labels,
        embeddings=embeddings,
    )
    metadata_path = output_directory / "classifier.json"
    if await trio.to_thread.run_sync(
        metadata_path.is_file,
        abandon_on_cancel=False,
    ):
        return await load_classifier_bundle_async(
            output_directory,
            expected_source_hashes=sources,
        )

    fit = partial(
        fit_policy_classifier,
        labels.rows,
        embeddings.rows,
        loaded.grid().classifier,
    )
    fitted = await trio.to_thread.run_sync(fit, abandon_on_cancel=False)
    return await write_classifier_bundle_async(
        output_directory,
        fitted,
        source_hashes=sources,
    )


def fit_classifier(
    *,
    soft_labels_path: Path,
    embeddings_path: Path,
    config_path: Path,
    output_directory: Path,
) -> ClassifierBundle:
    """Run classifier fitting from a synchronous process boundary."""
    operation = partial(
        fit_classifier_async,
        soft_labels_path=soft_labels_path,
        embeddings_path=embeddings_path,
        config_path=config_path,
        output_directory=output_directory,
    )
    return trio.run(operation)
