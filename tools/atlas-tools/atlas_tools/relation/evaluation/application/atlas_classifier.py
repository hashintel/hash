"""Export verified evaluation classifiers into Atlas's native model format."""

from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.application._atlas_classifier_codec import (
    AtlasClassifierArtifact,
    write_atlas_classifier,
)
from atlas_tools.relation.evaluation.application.analysis_codec import load_classifier_bundle
from atlas_tools.relation.family_closure.api import verify_family_closure


def export_atlas_classifier(
    *,
    classifier_directory: Path,
    closure_directory: Path,
    output_path: Path,
    soft_labels_path: Path | None = None,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
) -> AtlasClassifierArtifact:
    """Verify a complete fit bundle and publish its Atlas deployment model."""
    if output_path.suffix != ".salt":
        raise ValueError("Atlas classifier output must use the .salt extension")
    closure = verify_family_closure(closure_directory)
    bundle = load_classifier_bundle(
        classifier_directory,
        closure=closure,
        soft_labels=soft_labels_path,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
    )
    return write_atlas_classifier(output_path, bundle.fit.classifier)


async def export_atlas_classifier_async(
    *,
    classifier_directory: Path,
    closure_directory: Path,
    output_path: Path,
    soft_labels_path: Path | None = None,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
) -> AtlasClassifierArtifact:
    """Verify and export a classifier without blocking Trio's event loop."""
    operation = partial(
        export_atlas_classifier,
        classifier_directory=classifier_directory,
        closure_directory=closure_directory,
        output_path=output_path,
        soft_labels_path=soft_labels_path,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)


__all__ = ["export_atlas_classifier", "export_atlas_classifier_async"]
