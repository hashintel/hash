//! Validation of full and projector representation columns.

use super::{hash, matrix, row_count, vector};
use crate::salt::{
    manifest::GenerationManifest,
    representation::{
        AUDITED_PREFIX_DIMENSIONS, CANONICAL_DIMENSIONS, CanonicalEmbedding, NORMALIZATION_EPSILON,
        PROJECTOR_DIMENSIONS, canonical_corpus_hash, prefix_corpus_hash, projector_corpus_hash,
    },
    storage::mmap::{ArtifactView, ScalarType},
};

pub(super) fn validate(
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let rows = row_count(manifest)?;
    let canonical = matrix(artifact, 1, ScalarType::F32, rows, CANONICAL_DIMENSIONS)?
        .as_f32()
        .expect("section scalar type should be validated");
    let projector = matrix(artifact, 2, ScalarType::F32, rows, PROJECTOR_DIMENSIONS)?
        .as_f32()
        .expect("section scalar type should be validated");
    let roles = vector(artifact, 3, ScalarType::U32, rows)?
        .as_u32()
        .expect("section scalar type should be validated");
    let canonical_hash = hash(artifact, 4)?;
    let projector_hash = hash(artifact, 5)?;
    let identity_hash = hash(artifact, 6)?;
    let normalization_floor = vector(artifact, 7, ScalarType::F64, 1)?
        .as_f64()
        .expect("section scalar type should be validated")[0];
    if normalization_floor.to_bits() != NORMALIZATION_EPSILON.to_bits() {
        return Err("representation normalization floor is unsupported");
    }
    if roles.iter().any(|&role| role > 2) {
        return Err("representation point role is outside the canonical vocabulary");
    }
    if canonical_hash != manifest.embedding.canonical_corpus_hash.as_bytes()
        || canonical_corpus_hash(canonical) != manifest.embedding.canonical_corpus_hash
    {
        return Err("canonical representation corpus hash differs from the manifest");
    }
    if projector_hash != manifest.embedding.projector_corpus_hash.as_bytes()
        || projector_corpus_hash(projector) != manifest.embedding.projector_corpus_hash
    {
        return Err("projector representation corpus hash differs from the manifest");
    }
    if identity_hash != manifest.storage.identity_directory_hash.as_bytes() {
        return Err("representation identity directory differs from the manifest");
    }
    for (index, dimensions) in AUDITED_PREFIX_DIMENSIONS.into_iter().enumerate() {
        if prefix_corpus_hash(canonical, dimensions)
            != manifest.embedding.representation_audit.prefix_corpus_hashes[index]
        {
            return Err("representation audit prefix identity differs from persisted vectors");
        }
    }
    let mut expected = [0.0_f32; PROJECTOR_DIMENSIONS];
    for (canonical, projector) in canonical
        .chunks_exact(CANONICAL_DIMENSIONS)
        .zip(projector.chunks_exact(PROJECTOR_DIMENSIONS))
    {
        let _normalization = CanonicalEmbedding::new(canonical)
            .map_err(|_error| "canonical representation row is invalid")?
            .normalize_prefix(&mut expected);
        if expected
            .iter()
            .zip(projector)
            .any(|(expected, actual)| expected.to_bits() != actual.to_bits())
        {
            return Err("projector representation is not the canonical normalized prefix");
        }
    }
    Ok(())
}
