//! Validation of the persisted landmark-reference merge tree.

use super::{hash, nonnegative, variable_vector, vector};
use crate::salt::{
    hash::ContentHasher,
    manifest::GenerationManifest,
    storage::mmap::{ArtifactView, ScalarType},
};

pub(super) fn validate_reference(
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let canonical = manifest
        .variants
        .entries
        .iter()
        .find(|entry| entry.id == manifest.variants.canonical_variant)
        .ok_or("canonical variant is missing")?;
    let report = &canonical.persistence_comparison;
    if hash(artifact, 1)? != canonical.analytic_configuration_hash.as_bytes()
        || hash(artifact, 2)? != report.reference_source_hash.as_bytes()
        || hash(artifact, 6)? != report.reference_tree_hash.as_bytes()
    {
        return Err("reference persistence provenance differs from the manifest");
    }
    let density_maximum = vector(artifact, 3, ScalarType::F64, 1)?
        .as_f64()
        .expect("section scalar type should be validated")[0];
    let births = variable_vector(artifact, 4, ScalarType::F64)?
        .as_f64()
        .expect("section scalar type should be validated");
    let deaths = vector(artifact, 5, ScalarType::F64, births.len())?
        .as_f64()
        .expect("section scalar type should be validated");
    let parents = vector(artifact, 7, ScalarType::U64, births.len())?
        .as_u64()
        .expect("section scalar type should be validated");
    let representative_pixels = vector(artifact, 8, ScalarType::U64, births.len())?
        .as_u64()
        .expect("section scalar type should be validated");
    if !nonnegative(density_maximum)
        || births
            .iter()
            .zip(deaths)
            .any(|(&birth, &death)| !nonnegative(death) || !birth.is_finite() || birth < death)
    {
        return Err("reference persistence tree contains an invalid leaf");
    }
    validate_parentage(parents, births)?;
    let mut tree_hash = ContentHasher::new(b"hash.graph.atlas.salt.merge-tree.v2");
    tree_hash.update(&density_maximum.to_bits().to_le_bytes());
    for (leaf, (((&birth, &death), &parent), &representative_pixel)) in births
        .iter()
        .zip(deaths)
        .zip(parents)
        .zip(representative_pixels)
        .enumerate()
    {
        tree_hash.update(
            &u64::try_from(leaf)
                .map_err(|_error| "reference leaf identity does not fit")?
                .to_le_bytes(),
        );
        tree_hash.update(&parent.to_le_bytes());
        tree_hash.update(&representative_pixel.to_le_bytes());
        tree_hash.update(&birth.to_bits().to_le_bytes());
        tree_hash.update(&death.to_bits().to_le_bytes());
    }
    if tree_hash.finish() != report.reference_tree_hash {
        return Err("reference persistence hash does not describe the stored tree");
    }
    let normalized_total = if density_maximum > 0.0 {
        births
            .iter()
            .zip(deaths)
            .map(|(&birth, &death)| birth - death)
            .sum::<f64>()
            / density_maximum
    } else {
        0.0
    };
    if normalized_total.to_bits() != report.reference_normalized_total.to_bits() {
        return Err("reference total persistence differs from the comparison report");
    }
    for (index, threshold) in report.fixed_thresholds.iter().enumerate() {
        let count = births
            .iter()
            .zip(deaths)
            .filter(|&(&birth, &death)| birth - death >= *threshold * density_maximum)
            .count();
        if u64::try_from(count).map_err(|_error| "reference leaf count does not fit")?
            != report.reference_leaf_counts[index]
        {
            return Err("reference leaf counts differ from the comparison report");
        }
    }
    Ok(())
}

fn validate_parentage(parents: &[u64], births: &[f64]) -> Result<(), &'static str> {
    for (leaf, &parent) in parents.iter().enumerate() {
        if parent == u64::MAX {
            continue;
        }
        let parent =
            usize::try_from(parent).map_err(|_error| "reference parent does not fit usize")?;
        if parent >= parents.len() || parent == leaf || births[parent] < births[leaf] {
            return Err("reference persistence parentage is invalid");
        }
        let mut ancestor = leaf;
        let mut terminated = false;
        for _depth in 0..=parents.len() {
            let next = parents[ancestor];
            if next == u64::MAX {
                terminated = true;
                break;
            }
            ancestor =
                usize::try_from(next).map_err(|_error| "reference parent does not fit usize")?;
            if ancestor >= parents.len() {
                return Err("reference persistence parent is outside the leaf domain");
            }
        }
        if !terminated {
            return Err("reference persistence parentage contains a cycle");
        }
    }
    Ok(())
}
