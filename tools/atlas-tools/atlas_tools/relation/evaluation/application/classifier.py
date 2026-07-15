"""Fit or revalidate one deterministic policy-classifier bundle."""

from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.analysis.api import fit_policy_classifier
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierBundle,
    ClassifierCoincidentReviewBinding,
    ClassifierTargetResolutionBinding,
    EmbeddingsArtifact,
    SoftLabelsArtifact,
)
from atlas_tools.relation.evaluation.application.analysis_codec import (
    load_classifier_bundle_async,
    load_embeddings_async,
    load_soft_labels_async,
    write_classifier_bundle_async,
)
from atlas_tools.relation.evaluation.application.coincident_classifier import (
    classifier_coincident_review_binding,
    classifier_coincident_review_source_hashes,
    load_classifier_coincident_reviews,
)
from atlas_tools.relation.evaluation.application.coincident_review import (
    VerifiedCoincidentReviewArtifact,
)
from atlas_tools.relation.evaluation.application.identity import panel_hash
from atlas_tools.relation.evaluation.application.source import hash_paths
from atlas_tools.relation.evaluation.application.target_resolution import (
    VerifiedTargetResolutionArtifact,
    classifier_target_resolution_binding,
    classifier_target_resolution_source_hashes,
    load_target_resolutions,
)
from atlas_tools.relation.evaluation.storage.api import LoadedConfig, load_config_async
from atlas_tools.relation.family_closure.api import (
    VerifiedFamilyClosure,
    verify_family_closure,
)


async def _load_inputs(
    *,
    config_path: Path,
    soft_labels_path: Path,
    embeddings_path: Path,
    closure_directory: Path,
    resolutions_directory: Path | None,
    coincident_reviews_directory: Path | None,
    deliverables_directory: Path | None,
) -> tuple[
    LoadedConfig,
    SoftLabelsArtifact,
    EmbeddingsArtifact,
    VerifiedFamilyClosure,
    VerifiedTargetResolutionArtifact | None,
    VerifiedCoincidentReviewArtifact | None,
]:
    configs: list[LoadedConfig] = []
    labels: list[SoftLabelsArtifact] = []
    embeddings: list[EmbeddingsArtifact] = []
    closures: list[VerifiedFamilyClosure] = []
    resolutions: list[VerifiedTargetResolutionArtifact] = []

    async def load_config() -> None:
        configs.append(await load_config_async(config_path))

    async def load_labels() -> None:
        labels.append(await load_soft_labels_async(soft_labels_path))

    async def load_embedding_rows() -> None:
        embeddings.append(await load_embeddings_async(embeddings_path))

    async def load_closure() -> None:
        closures.append(
            await trio.to_thread.run_sync(
                verify_family_closure,
                closure_directory,
                abandon_on_cancel=False,
            )
        )

    async with trio.open_nursery() as nursery:
        nursery.start_soon(load_config)
        nursery.start_soon(load_labels)
        nursery.start_soon(load_embedding_rows)
        nursery.start_soon(load_closure)
    counts = (len(configs), len(labels), len(embeddings), len(closures))
    if counts != (1, 1, 1, 1):
        raise AssertionError("parallel classifier loaders did not each return once")
    if resolutions_directory is not None:
        operation = partial(
            load_target_resolutions,
            resolutions_directory,
            soft_labels=labels[0],
            expected_cards_hash=closures[0].manifest.details.concat.cards_hash,
            expected_cards_manifest_hash=closures[0].manifest.details.concat.manifest_hash,
        )
        resolutions.append(await trio.to_thread.run_sync(operation, abandon_on_cancel=False))
    resolution = None if not resolutions else resolutions[0]
    if (coincident_reviews_directory is None) != (deliverables_directory is None):
        raise ValueError("Coincident reviews and grid deliverables must be provided together")
    reviews: list[VerifiedCoincidentReviewArtifact] = []
    if coincident_reviews_directory is not None and deliverables_directory is not None:
        operation = partial(
            load_classifier_coincident_reviews,
            coincident_reviews_directory,
            deliverables=deliverables_directory,
            soft_labels=labels[0],
            expected_cards_hash=closures[0].manifest.details.concat.cards_hash,
            expected_config_hash=configs[0].content_hash,
        )
        reviews.append(await trio.to_thread.run_sync(operation, abandon_on_cancel=False))
    review = None if not reviews else reviews[0]
    return configs[0], labels[0], embeddings[0], closures[0], resolution, review


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
    closure: VerifiedFamilyClosure,
    resolutions: VerifiedTargetResolutionArtifact | None,
    coincident_reviews: VerifiedCoincidentReviewArtifact | None,
) -> dict[str, str]:
    paths = {
        "embeddings.meta.json": embeddings.sidecar_path,
        "embeddings.parquet": embeddings.path,
        "soft-labels.meta.json": labels.sidecar_path,
        "soft-labels.parquet": labels.path,
        "family-closure/families.jsonl": closure.families_path,
        "family-closure/families.manifest.json": closure.manifest_path,
    }
    files = await hash_paths(paths)
    resolution_sources = (
        {} if resolutions is None else classifier_target_resolution_source_hashes(resolutions)
    )
    review_sources = (
        {}
        if coincident_reviews is None
        else classifier_coincident_review_source_hashes(coincident_reviews)
    )
    grid_sources = {
        f"grid/{name}": content_hash for name, content_hash in labels.metadata.source_hashes.items()
    }
    return {
        **files,
        **resolution_sources,
        **review_sources,
        **grid_sources,
        "grid-config": loaded.content_hash,
    }


def _coincident_binding(
    artifact: VerifiedCoincidentReviewArtifact,
) -> ClassifierCoincidentReviewBinding:
    return classifier_coincident_review_binding(artifact)


def _resolution_binding(
    artifact: VerifiedTargetResolutionArtifact,
    *,
    sources: dict[str, str],
    labels: SoftLabelsArtifact,
    embeddings: EmbeddingsArtifact,
) -> ClassifierTargetResolutionBinding:
    expected_sources = {
        "soft-labels.parquet": sources["soft-labels.parquet"],
        "soft-labels.parquet.meta.json": sources["soft-labels.meta.json"],
        "cards.jsonl": labels.metadata.source_hashes.get("cards.jsonl"),
        "cards.manifest.json": embeddings.metadata.source_hashes.get("cards.manifest.json"),
    }
    if (
        None in expected_sources.values()
        or dict(artifact.manifest.source_hashes) != expected_sources
    ):
        raise ValueError("target resolutions belong to different classifier inputs")
    return classifier_target_resolution_binding(artifact)


async def fit_classifier_async(
    *,
    soft_labels_path: Path,
    embeddings_path: Path,
    closure_directory: Path,
    config_path: Path,
    output_directory: Path,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
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
    loaded, labels, embeddings, closure, resolutions, coincident_reviews = await _load_inputs(
        config_path=config_path,
        soft_labels_path=soft_labels_path,
        embeddings_path=embeddings_path,
        closure_directory=closure_directory,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
    )
    _validate_sources(loaded, labels, embeddings)
    sources = await _source_hashes(
        loaded=loaded,
        labels=labels,
        embeddings=embeddings,
        closure=closure,
        resolutions=resolutions,
        coincident_reviews=coincident_reviews,
    )
    resolution_binding = (
        None
        if resolutions is None
        else _resolution_binding(
            resolutions,
            sources=sources,
            labels=labels,
            embeddings=embeddings,
        )
    )
    coincident_binding = (
        None if coincident_reviews is None else _coincident_binding(coincident_reviews)
    )
    metadata_path = output_directory / "classifier.json"
    if await trio.to_thread.run_sync(
        metadata_path.is_file,
        abandon_on_cancel=False,
    ):
        return await load_classifier_bundle_async(
            output_directory,
            closure=closure,
            expected_source_hashes=sources,
            soft_labels=(
                None
                if resolutions_directory is None and coincident_reviews_directory is None
                else labels
            ),
            resolutions_directory=resolutions_directory,
            coincident_reviews_directory=coincident_reviews_directory,
            deliverables_directory=deliverables_directory,
        )

    fit = partial(
        fit_policy_classifier,
        labels.rows,
        embeddings.rows,
        closure.rows,
        loaded.grid().classifier,
        resolutions=() if resolutions is None else resolutions.rows,
        coincident_reviews=() if coincident_reviews is None else coincident_reviews.rows,
    )
    fitted = await trio.to_thread.run_sync(fit, abandon_on_cancel=False)
    return await write_classifier_bundle_async(
        output_directory,
        fitted,
        source_hashes=sources,
        closure=closure,
        target_resolutions=resolution_binding,
        coincident_reviews=coincident_binding,
    )


def fit_classifier(
    *,
    soft_labels_path: Path,
    embeddings_path: Path,
    closure_directory: Path,
    config_path: Path,
    output_directory: Path,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
) -> ClassifierBundle:
    """Run classifier fitting from a synchronous process boundary."""
    operation = partial(
        fit_classifier_async,
        soft_labels_path=soft_labels_path,
        embeddings_path=embeddings_path,
        closure_directory=closure_directory,
        config_path=config_path,
        output_directory=output_directory,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
    )
    return trio.run(operation)
