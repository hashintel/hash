use std::time::Instant;

use camino::Utf8Path;

use super::error::GenerationError;
use crate::salt::{
    analytic::{
        AnalyticPoint, MergeTree, MergeTreeConfig, RasterConfig, RegionConfig,
        RegionLabelCandidate, density_raster, density_regions, merge_tree,
        publish_analytic_artifact, select_region_labels,
    },
    evaluation::QuantizedCanonicalField,
    hash::ContentHash,
    identity::IdentityDirectory,
    materialize::{
        CanonicalProvenance, ImportanceConfig, MaterializedBase, materialize_base_revision,
    },
    storage::mmap::PublishedArtifact,
};

/// Row-ordered signals used by canonical delivery and analytic indexing.
#[derive(Debug, Copy, Clone)]
pub(crate) struct CanonicalSignals<'signal> {
    pub importance: &'signal [f64],
    pub semantic_priority: &'signal [f64],
    pub density_mass: &'signal [f64],
    pub labels: &'signal [Option<&'signal str>],
}

/// Versioned settings for base and analytic materialization.
#[derive(Debug, Copy, Clone)]
pub(crate) struct CanonicalMaterializationConfig<'config> {
    pub importance: ImportanceConfig<'config>,
    pub raster: RasterConfig,
    pub merge_tree: MergeTreeConfig,
    pub regions: RegionConfig,
    pub analytic_configuration: ContentHash,
}

/// Immutable artifacts and summary metrics for one canonical field.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CanonicalArtifacts {
    pub base: MaterializedBase,
    pub analytic: PublishedArtifact,
    pub region_count: usize,
    pub label_count: usize,
    pub normalized_persistence: f64,
    pub merge_tree_hash: ContentHash,
    pub merge_tree: MergeTree,
}

/// Materializes delivery, density, persistence, region, and label indexes.
///
/// Both destinations are immutable no-clobber artifacts. Publishing the base
/// before the analytic field is safe because neither becomes discoverable
/// until a complete manifest and passing release report are published.
///
/// # Errors
///
/// This returns an error for inconsistent row signals, invalid ranking or
/// analytic inputs, or failed immutable publication.
pub(crate) fn materialize_canonical(
    base_path: &Utf8Path,
    analytic_path: &Utf8Path,
    identities: &IdentityDirectory,
    field: &QuantizedCanonicalField,
    signals: CanonicalSignals<'_>,
    config: CanonicalMaterializationConfig<'_>,
) -> Result<CanonicalArtifacts, GenerationError> {
    let started = Instant::now();
    let rows = identities.len();
    if signals.importance.len() != rows
        || signals.semantic_priority.len() != rows
        || signals.density_mass.len() != rows
        || signals.labels.len() != rows
    {
        return Err(GenerationError::SignalRows {
            identities: rows,
            importance: signals.importance.len(),
            semantic: signals.semantic_priority.len(),
            density: signals.density_mass.len(),
            labels: signals.labels.len(),
        });
    }
    let base = materialize_base_revision(
        base_path,
        identities,
        field.coordinates(),
        signals.importance,
        signals.semantic_priority,
        config.importance,
        canonical_provenance(field),
    )?;

    let points = field
        .coordinates()
        .iter()
        .zip(signals.density_mass)
        .map(|(&coordinate, &mass)| AnalyticPoint { coordinate, mass })
        .collect::<Vec<_>>();
    let raster = density_raster(&points, config.raster)?;
    let tree = merge_tree(&raster, config.merge_tree)?;
    let regions = density_regions(&raster, &tree, field.coordinates(), config.regions)?;
    let labels = identities
        .iter()
        .filter_map(|(row, _)| {
            signals.labels[row.as_usize()].map(|text| RegionLabelCandidate {
                point: row.as_usize(),
                row,
                importance: signals.importance[row.as_usize()],
                text,
            })
        })
        .collect::<Vec<_>>();
    let labels = select_region_labels(&regions, labels)?;
    let analytic = publish_analytic_artifact(
        analytic_path,
        config.analytic_configuration,
        &raster,
        &tree,
        &regions,
        &labels,
    )?;

    let normalized_persistence = tree.normalized_persistence();
    let merge_tree_hash = tree.content_hash();
    let artifacts = CanonicalArtifacts {
        base,
        analytic,
        region_count: regions.peaks().len(),
        label_count: labels.len(),
        normalized_persistence,
        merge_tree_hash,
        merge_tree: tree,
    };
    tracing::info!(
        target: "hash_graph_atlas::salt",
        rows,
        regions = artifacts.region_count,
        labels = artifacts.label_count,
        normalized_persistence = artifacts.normalized_persistence,
        duration_ms = started.elapsed().as_millis(),
        "canonical atlas artifacts materialized"
    );
    Ok(artifacts)
}

fn canonical_provenance(field: &QuantizedCanonicalField) -> CanonicalProvenance {
    let selection = field.selection();
    let procrustes_transform = field
        .alignment()
        .map_or([1.0, 1.0, 0.0, 0.0, 0.0], |alignment| {
            [
                alignment.scale(),
                alignment.rotation()[0],
                alignment.rotation()[1],
                alignment.translation()[0],
                alignment.translation()[1],
            ]
        });
    CanonicalProvenance {
        field_hash: field.content_hash(),
        condition: selection.condition().get(),
        condition_domain_hash: selection.domain_version(),
        selection_evidence_hash: selection.evidence(),
        procrustes_transform,
        quantization_step: field.quantization_step(),
    }
}
