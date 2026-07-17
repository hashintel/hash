use camino::Utf8Path;

use super::{
    APPLICABILITY_INVERSE_SCALES, APPLICABILITY_MEAN, APPLICABILITY_TRAINING_DISTANCES,
    CLASS_COUNT, CLASS_ORDER, CLASSIFIER_FORMAT, COEFFICIENTS, FittedClassifier, INTERCEPTS,
    TEMPERATURE,
};
use crate::salt::{
    policy::PlacementClass,
    representation::CANONICAL_DIMENSIONS,
    storage::mmap::{
        ArtifactFormat, ArtifactSection, ArtifactWriteError, PublishedArtifact, publish_artifact,
    },
};

/// Atomically publishes fitted parameters in the zero-copy classifier schema.
///
/// # Errors
///
/// This returns an error when a fitted vector has an inconsistent shape, the
/// destination cannot be written, or different immutable content already
/// occupies the destination.
pub(crate) fn publish_fitted_classifier(
    path: &Utf8Path,
    classifier: &FittedClassifier,
) -> Result<PublishedArtifact, ArtifactWriteError> {
    publish_fitted_classifier_with_format(path, classifier, CLASSIFIER_FORMAT)
}

/// Atomically publishes fitted parameters under a purpose-specific schema.
///
/// # Errors
///
/// This returns an error when a fitted vector has an inconsistent shape, the
/// destination cannot be written, or different immutable content already
/// occupies the destination.
pub(crate) fn publish_fitted_classifier_with_format(
    path: &Utf8Path,
    classifier: &FittedClassifier,
    format: ArtifactFormat,
) -> Result<PublishedArtifact, ArtifactWriteError> {
    let class_order = [
        PlacementClass::Coincident as u8,
        PlacementClass::Proximal as u8,
        PlacementClass::Overlay as u8,
    ];
    let temperature = [classifier.temperature];
    let sections = [
        ArtifactSection::new(CLASS_ORDER, &[CLASS_COUNT], &class_order),
        ArtifactSection::new(
            COEFFICIENTS,
            &[CLASS_COUNT, CANONICAL_DIMENSIONS],
            &classifier.coefficients,
        ),
        ArtifactSection::new(INTERCEPTS, &[CLASS_COUNT], &classifier.intercepts),
        ArtifactSection::new(TEMPERATURE, &[1], &temperature),
        ArtifactSection::new(
            APPLICABILITY_MEAN,
            &[CANONICAL_DIMENSIONS],
            &classifier.applicability_mean,
        ),
        ArtifactSection::new(
            APPLICABILITY_INVERSE_SCALES,
            &[CANONICAL_DIMENSIONS],
            &classifier.applicability_inverse_scales,
        ),
        ArtifactSection::new(
            APPLICABILITY_TRAINING_DISTANCES,
            &[classifier.applicability_training_distances.len()],
            &classifier.applicability_training_distances,
        ),
    ];
    let mut validated = Vec::with_capacity(sections.len());
    for section in sections {
        validated.push(section.map_err(|error| ArtifactWriteError::InvalidSection {
            index: validated.len(),
            error,
        })?);
    }
    publish_artifact(path, format, &validated)
}
