//! Role-specific validation for mapped generation artifacts.

#![expect(
    clippy::self_named_module_files,
    reason = "the schema facade predates its role-specific child modules and remains their stable \
              parent"
)]
#![expect(
    clippy::little_endian_bytes,
    reason = "artifact validators recompute canonical cross-platform content identities"
)]

mod legacy;
mod persistence;
mod relation;
mod representation;

use super::{ArtifactRole, GenerationManifest};
use crate::salt::{
    classifier::ClassifierView,
    hash::ContentHasher,
    storage::mmap::{ArtifactView, ScalarType, SectionId, SectionView},
};

pub(super) fn validate_role_schema(
    role: ArtifactRole,
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    match role {
        ArtifactRole::Representations => representation::validate(artifact, manifest),
        ArtifactRole::RelationClassifier => ClassifierView::new(artifact)
            .map(|_| ())
            .map_err(|_error| "classifier parameters or invariants are invalid"),
        ArtifactRole::StrengthHead => ClassifierView::new_with_format(
            artifact,
            crate::salt::format::STRENGTH_CLASSIFIER_FORMAT,
        )
        .map(|_| ())
        .map_err(|_error| "strength-head parameters or invariants are invalid"),
        ArtifactRole::SemanticGraph => validate_graph(artifact, manifest),
        ArtifactRole::RelationIndexes => relation::validate(artifact, manifest),
        ArtifactRole::LandmarkSkeleton => validate_landmarks(artifact, manifest),
        ArtifactRole::LandmarkReferencePersistence => {
            persistence::validate_reference(artifact, manifest)
        }
        ArtifactRole::ProjectorCheckpoint => Err("projector checkpoint is not an mmap artifact"),
        ArtifactRole::CanonicalBase => validate_base(artifact, manifest),
        ArtifactRole::CanonicalAnalytics => validate_analytics(artifact, manifest),
        ArtifactRole::LegacyLayout
        | ArtifactRole::LegacyIdentities
        | ArtifactRole::LegacyExportManifest => Err("legacy exports are not mmap artifacts"),
    }
}

pub(super) fn validate_opaque_role(
    role: ArtifactRole,
    bytes: &[u8],
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    legacy::validate(role, bytes, manifest)
}

pub(super) fn validate_legacy_layout_coordinates(
    layout: &[u8],
    canonical_base: ArtifactView<'_>,
) -> Result<(), &'static str> {
    legacy::validate_layout_coordinates(layout, canonical_base)
}

fn validate_graph(
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let rows = row_count(manifest)?;
    let neighbors = manifest.semantic_graph.neighbors;
    let indices = matrix(artifact, 1, ScalarType::U32, rows, neighbors)?
        .as_u32()
        .expect("section scalar type should be validated");
    let distances = matrix(artifact, 2, ScalarType::F32, rows, neighbors)?
        .as_f32()
        .expect("section scalar type should be validated");
    let weights = matrix(artifact, 3, ScalarType::F32, rows, neighbors)?
        .as_f32()
        .expect("section scalar type should be validated");
    if hash(artifact, 4)? != manifest.semantic_graph.backend_hash.as_bytes()
        || hash(artifact, 5)? != manifest.semantic_graph.configuration_hash.as_bytes()
        || hash(artifact, 6)? != manifest.semantic_graph.weight_hash.as_bytes()
    {
        return Err("semantic graph provenance differs from the manifest");
    }

    for row in 0..rows {
        let start = row
            .checked_mul(neighbors)
            .ok_or("semantic graph dimensions overflow")?;
        let end = start + neighbors;
        let mut previous = None;
        for (&neighbor, (&distance, &weight)) in indices[start..end]
            .iter()
            .zip(distances[start..end].iter().zip(&weights[start..end]))
        {
            if neighbor as usize >= rows || neighbor as usize == row {
                return Err("semantic graph contains an invalid neighbor row");
            }
            if !distance.is_finite() || !(0.0..=2.0).contains(&distance) {
                return Err("semantic graph contains an invalid cosine distance");
            }
            if !weight.is_finite() || weight <= 0.0 {
                return Err("semantic graph contains an invalid edge weight");
            }
            let key = (distance.to_bits(), neighbor);
            if let Some((previous_distance, previous_row)) = previous
                && (distance
                    .total_cmp(&f32::from_bits(previous_distance))
                    .is_lt()
                    || (distance.to_bits() == previous_distance && neighbor <= previous_row))
            {
                return Err("semantic graph rows are not canonically ordered");
            }
            previous = Some(key);
        }
    }
    Ok(())
}

fn validate_landmarks(
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let row_count = row_count(manifest)?;
    let landmarks = manifest.landmarks.actual_count;
    let rows = vector(artifact, 1, ScalarType::U32, landmarks)?
        .as_u32()
        .expect("section scalar type should be validated");
    let assignments = vector(artifact, 2, ScalarType::U32, row_count)?
        .as_u32()
        .expect("section scalar type should be validated");
    let coordinates = matrix(artifact, 3, ScalarType::F64, landmarks, 2)?
        .as_f64()
        .expect("section scalar type should be validated");
    if rows.is_empty()
        || !rows.windows(2).all(|pair| pair.first() < pair.last())
        || rows.iter().any(|&row| row as usize >= row_count)
    {
        return Err("landmark rows are empty, unordered, or out of range");
    }
    if assignments
        .iter()
        .any(|&assignment| assignment as usize >= landmarks)
    {
        return Err("landmark assignment is out of range");
    }
    for (ordinal, &row) in rows.iter().enumerate() {
        if assignments[row as usize] as usize != ordinal {
            return Err("selected landmark does not assign to itself");
        }
    }
    if coordinates.iter().any(|value| !value.is_finite()) {
        return Err("landmark coordinates are non-finite");
    }
    Ok(())
}

#[expect(
    clippy::too_many_lines,
    reason = "all base delivery columns are cross-validated at one artifact trust boundary"
)]
fn validate_base(
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let rows = row_count(manifest)?;
    let delivery_rows = vector(artifact, 1, ScalarType::U32, rows)?
        .as_u32()
        .expect("section scalar type should be validated");
    let coordinates = matrix(artifact, 2, ScalarType::F32, rows, 2)?
        .as_f32()
        .expect("section scalar type should be validated");
    let buckets = vector(artifact, 3, ScalarType::U32, rows)?
        .as_u32()
        .expect("section scalar type should be validated");
    let priorities = vector(artifact, 4, ScalarType::U32, rows)?
        .as_u32()
        .expect("section scalar type should be validated");
    let morton = vector(artifact, 5, ScalarType::U32, rows)?
        .as_u32()
        .expect("section scalar type should be validated");
    let offsets = variable_vector(artifact, 6, ScalarType::U64)?
        .as_u64()
        .expect("section scalar type should be validated");
    let web_ids = matrix(artifact, 7, ScalarType::U8, rows, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let entity_uuids = matrix(artifact, 8, ScalarType::U8, rows, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let draft_present = vector(artifact, 9, ScalarType::U8, rows)?
        .as_u8()
        .expect("section scalar type should be validated");
    let draft_ids = matrix(artifact, 10, ScalarType::U8, rows, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let field_hash = vector(artifact, 11, ScalarType::U8, 32)?
        .as_u8()
        .expect("section scalar type should be validated");
    let condition = vector(artifact, 12, ScalarType::F64, 1)?
        .as_f64()
        .expect("section scalar type should be validated")[0];
    let domain_hash = vector(artifact, 13, ScalarType::U8, 32)?
        .as_u8()
        .expect("section scalar type should be validated");
    let evidence_hash = vector(artifact, 14, ScalarType::U8, 32)?
        .as_u8()
        .expect("section scalar type should be validated");
    let transform = vector(artifact, 15, ScalarType::F64, 5)?
        .as_f64()
        .expect("section scalar type should be validated");
    let identity_hash = hash(artifact, 16)?;
    let quantization_step = vector(artifact, 17, ScalarType::F64, 1)?
        .as_f64()
        .expect("section scalar type should be validated")[0];
    let canonical = manifest
        .variants
        .entries
        .iter()
        .find(|entry| entry.id == manifest.variants.canonical_variant)
        .ok_or("manifest has no canonical variant")?;
    if field_hash != canonical.canonical_field_hash.as_bytes()
        || condition.to_bits() != canonical.global_relation_condition.to_bits()
        || domain_hash != canonical.condition_domain_hash.as_bytes()
        || evidence_hash != canonical.selection_evidence_hash.as_bytes()
        || transform != canonical.procrustes_transform
        || quantization_step.to_bits() != canonical.quantization_step.to_bits()
    {
        return Err("base canonical provenance differs from the manifest");
    }

    let mut seen_rows = vec![false; rows];
    let mut seen_priorities = vec![false; rows];
    let mut previous = None;
    let mut bucket_hash = ContentHasher::new(b"hash.graph.atlas.salt.bucket-index.v1");
    let mut morton_hash = ContentHasher::new(b"hash.graph.atlas.salt.morton-index.v1");
    for index in 0..rows {
        let row = delivery_rows[index] as usize;
        let priority = priorities[index] as usize;
        if row >= rows || seen_rows[row] || priority >= rows || seen_priorities[priority] {
            return Err("base row or priority columns are not permutations");
        }
        seen_rows[row] = true;
        seen_priorities[priority] = true;
        let key = (
            buckets[index],
            morton[index],
            priorities[index],
            delivery_rows[index],
        );
        if previous.is_some_and(|previous| previous >= key) {
            return Err("base delivery rows are not canonically ordered");
        }
        previous = Some(key);
        bucket_hash.update(&delivery_rows[index].to_le_bytes());
        bucket_hash.update(&buckets[index].to_le_bytes());
        bucket_hash.update(&priorities[index].to_le_bytes());
        morton_hash.update(&delivery_rows[index].to_le_bytes());
        morton_hash.update(&morton[index].to_le_bytes());
        if draft_present[index] > 1
            || (draft_present[index] == 0 && draft_ids[index * 16..index * 16 + 16] != [0; 16])
        {
            return Err("base contains an invalid draft identity");
        }
    }
    if coordinates.iter().any(|value| !value.is_finite()) {
        return Err("base coordinates are non-finite");
    }
    if bucket_hash.finish() != canonical.bucket_index_hash
        || morton_hash.finish() != canonical.morton_index_hash
    {
        return Err("base delivery indexes differ from the manifest");
    }
    let mut identities = ContentHasher::new(b"hash.graph.atlas.salt.identity-directory.v1");
    for row in 0..rows {
        identities.update(
            &u32::try_from(row)
                .map_err(|_error| "base identity row does not fit u32")?
                .to_le_bytes(),
        );
        identities.update(&web_ids[row * 16..row * 16 + 16]);
        identities.update(&entity_uuids[row * 16..row * 16 + 16]);
        identities.update(&[draft_present[row]]);
        identities.update(&draft_ids[row * 16..row * 16 + 16]);
    }
    let identities = identities.finish();
    if identity_hash != identities.as_bytes()
        || identities != manifest.storage.identity_directory_hash
    {
        return Err("base identity directory differs from the manifest");
    }
    if offsets.len() < 2
        || offsets[0] != 0
        || offsets.last().copied() != Some(rows as u64)
        || !offsets.windows(2).all(|pair| pair.first() <= pair.last())
        || offsets.iter().any(|&offset| offset > rows as u64)
    {
        return Err("base bucket offsets are invalid");
    }
    Ok(())
}

#[expect(
    clippy::too_many_lines,
    reason = "all analytic columns are cross-validated at one artifact trust boundary"
)]
fn validate_analytics(
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let canonical = manifest
        .variants
        .entries
        .iter()
        .find(|entry| entry.id == manifest.variants.canonical_variant)
        .ok_or("manifest has no canonical variant")?;
    if hash(artifact, 1)? != canonical.analytic_configuration_hash.as_bytes() {
        return Err("analytic configuration differs from the manifest");
    }
    let bounds = matrix(artifact, 2, ScalarType::F64, 2, 2)?
        .as_f64()
        .expect("section scalar type should be validated");
    let density_section = variable_square(artifact, 3, ScalarType::F64)?;
    let grid = usize::try_from(density_section.descriptor.shape[0])
        .map_err(|_error| "analytic grid does not fit")?;
    let density = density_section
        .as_f64()
        .expect("section scalar type should be validated");
    let births = variable_vector(artifact, 4, ScalarType::F64)?
        .as_f64()
        .expect("section scalar type should be validated");
    let deaths = vector(artifact, 5, ScalarType::F64, births.len())?
        .as_f64()
        .expect("section scalar type should be validated");
    let pixel_regions = matrix(artifact, 6, ScalarType::U32, grid, grid)?
        .as_u32()
        .expect("section scalar type should be validated");
    let point_regions = vector(artifact, 7, ScalarType::U32, row_count(manifest)?)?
        .as_u32()
        .expect("section scalar type should be validated");
    let peak_pixels = variable_vector(artifact, 8, ScalarType::U64)?
        .as_u64()
        .expect("section scalar type should be validated");
    let peak_densities = vector(artifact, 9, ScalarType::F64, peak_pixels.len())?
        .as_f64()
        .expect("section scalar type should be validated");
    let label_regions = variable_vector(artifact, 10, ScalarType::U32)?
        .as_u32()
        .expect("section scalar type should be validated");
    let label_rows = vector(artifact, 11, ScalarType::U32, label_regions.len())?
        .as_u32()
        .expect("section scalar type should be validated");
    let label_offsets = vector(artifact, 12, ScalarType::U64, label_regions.len() + 1)?
        .as_u64()
        .expect("section scalar type should be validated");
    let label_text = variable_vector(artifact, 13, ScalarType::U8)?
        .as_u8()
        .expect("section scalar type should be validated");
    let leaf_parents = vector(artifact, 14, ScalarType::U64, births.len())?
        .as_u64()
        .expect("section scalar type should be validated");
    let leaf_representative_pixels = vector(artifact, 15, ScalarType::U64, births.len())?
        .as_u64()
        .expect("section scalar type should be validated");
    let leaf_regions = vector(artifact, 16, ScalarType::U32, births.len())?
        .as_u32()
        .expect("section scalar type should be validated");
    let region_parents = vector(artifact, 17, ScalarType::U32, peak_pixels.len())?
        .as_u32()
        .expect("section scalar type should be validated");
    let region_persistence = vector(artifact, 18, ScalarType::F64, peak_pixels.len())?
        .as_f64()
        .expect("section scalar type should be validated");
    let region_leaves = vector(artifact, 19, ScalarType::U64, peak_pixels.len())?
        .as_u64()
        .expect("section scalar type should be validated");
    let region_representative_rows = vector(artifact, 20, ScalarType::U32, peak_pixels.len())?
        .as_u32()
        .expect("section scalar type should be validated");

    let &[minimum_x, minimum_y, maximum_x, maximum_y] = bounds else {
        return Err("analytic bounds have an invalid length");
    };
    if bounds.iter().any(|value| !value.is_finite())
        || minimum_x > maximum_x
        || minimum_y > maximum_y
        || density.iter().any(|&value| !nonnegative(value))
        || births
            .iter()
            .zip(deaths)
            .any(|(&birth, &death)| !nonnegative(birth) || !nonnegative(death) || death > birth)
        || peak_densities.iter().any(|&value| !nonnegative(value))
    {
        return Err("analytic artifact contains invalid numeric values");
    }
    let density_maximum = density
        .iter()
        .copied()
        .reduce(f64::max)
        .ok_or("analytic density grid is empty")?;
    let total_persistence = births
        .iter()
        .zip(deaths)
        .map(|(&birth, &death)| birth - death)
        .sum::<f64>();
    let normalized_persistence = if density_maximum > 0.0 {
        total_persistence / density_maximum
    } else {
        0.0
    };
    if normalized_persistence.to_bits() != canonical.normalized_persistence.to_bits()
        || normalized_persistence.to_bits()
            != canonical
                .persistence_comparison
                .candidate_normalized_total
                .to_bits()
    {
        return Err("analytic persistence differs from the manifest");
    }
    for (index, threshold) in canonical
        .persistence_comparison
        .fixed_thresholds
        .iter()
        .enumerate()
    {
        let count = births
            .iter()
            .zip(deaths)
            .filter(|&(&birth, &death)| birth - death >= *threshold * density_maximum)
            .count();
        if u64::try_from(count).map_err(|_error| "candidate leaf count does not fit")?
            != canonical.persistence_comparison.candidate_leaf_counts[index]
        {
            return Err("candidate leaf counts differ from the comparison report");
        }
    }
    let mut merge_tree = ContentHasher::new(b"hash.graph.atlas.salt.merge-tree.v2");
    merge_tree.update(&density_maximum.to_bits().to_le_bytes());
    for (leaf, (((&birth, &death), &parent), &representative_pixel)) in births
        .iter()
        .zip(deaths)
        .zip(leaf_parents)
        .zip(leaf_representative_pixels)
        .enumerate()
    {
        merge_tree.update(
            &u64::try_from(leaf)
                .map_err(|_error| "analytic leaf identity does not fit")?
                .to_le_bytes(),
        );
        merge_tree.update(&parent.to_le_bytes());
        merge_tree.update(&representative_pixel.to_le_bytes());
        merge_tree.update(&birth.to_bits().to_le_bytes());
        merge_tree.update(&death.to_bits().to_le_bytes());
    }
    if merge_tree.finish() != canonical.merge_tree_hash {
        return Err("analytic merge tree differs from the manifest");
    }
    let pixels = grid
        .checked_mul(grid)
        .ok_or("analytic grid dimensions overflow")?;
    validate_analytic_topology(AnalyticTopology {
        births,
        deaths,
        leaf_parents,
        leaf_representative_pixels,
        leaf_regions,
        peak_pixels,
        peak_densities,
        region_parents,
        region_persistence,
        region_leaves,
    })?;
    if peak_pixels.iter().any(|&pixel| pixel >= pixels as u64)
        || leaf_representative_pixels
            .iter()
            .any(|&pixel| pixel >= pixels as u64)
        || pixel_regions
            .iter()
            .chain(point_regions)
            .any(|&region| region != u32::MAX && region as usize >= peak_pixels.len())
        || label_regions
            .iter()
            .any(|&region| region as usize >= peak_pixels.len())
        || label_rows
            .iter()
            .any(|&row| u64::from(row) >= manifest.storage.row_count)
        || region_representative_rows
            .iter()
            .any(|&row| row != u32::MAX && u64::from(row) >= manifest.storage.row_count)
    {
        return Err("analytic artifact contains an out-of-range index");
    }
    for (region, &representative) in region_representative_rows.iter().enumerate() {
        let mut rows = label_regions
            .iter()
            .zip(label_rows)
            .filter_map(|(&label_region, &row)| (label_region as usize == region).then_some(row));
        let expected = rows.next().unwrap_or(u32::MAX);
        if rows.next().is_some() || representative != expected {
            return Err("analytic representative rows differ from region labels");
        }
    }
    if label_offsets.first().copied() != Some(0)
        || label_offsets.last().copied() != Some(label_text.len() as u64)
        || !label_offsets
            .windows(2)
            .all(|pair| pair.first() <= pair.last())
        || core::str::from_utf8(label_text).is_err()
    {
        return Err("analytic label offsets or UTF-8 are invalid");
    }
    Ok(())
}

#[derive(Copy, Clone)]
struct AnalyticTopology<'artifact> {
    births: &'artifact [f64],
    deaths: &'artifact [f64],
    leaf_parents: &'artifact [u64],
    leaf_representative_pixels: &'artifact [u64],
    leaf_regions: &'artifact [u32],
    peak_pixels: &'artifact [u64],
    peak_densities: &'artifact [f64],
    region_parents: &'artifact [u32],
    region_persistence: &'artifact [f64],
    region_leaves: &'artifact [u64],
}

#[expect(
    clippy::float_cmp,
    reason = "persisted topology uses exact density equality for its deterministic elder-rule \
              tie-break"
)]
fn validate_analytic_topology(topology: AnalyticTopology<'_>) -> Result<(), &'static str> {
    let leaf_count = topology.births.len();
    let region_count = topology.peak_pixels.len();
    for leaf in 0..leaf_count {
        let parent = topology.leaf_parents[leaf];
        if parent != u64::MAX {
            let parent =
                usize::try_from(parent).map_err(|_error| "analytic parent does not fit usize")?;
            if parent >= leaf_count
                || parent == leaf
                || topology.births[parent] < topology.births[leaf]
                || (topology.births[parent] == topology.births[leaf]
                    && topology.leaf_representative_pixels[parent]
                        >= topology.leaf_representative_pixels[leaf])
            {
                return Err("analytic merge-tree parentage is invalid");
            }
        }
        let region = topology.leaf_regions[leaf];
        if region != u32::MAX && region as usize >= region_count {
            return Err("analytic leaf names an out-of-range region");
        }
    }
    for region in 0..region_count {
        let leaf = usize::try_from(topology.region_leaves[region])
            .map_err(|_error| "analytic region leaf does not fit usize")?;
        if leaf >= leaf_count
            || topology.leaf_regions[leaf] as usize != region
            || topology.peak_pixels[region] != topology.leaf_representative_pixels[leaf]
            || topology.peak_densities[region].to_bits() != topology.births[leaf].to_bits()
            || topology.region_persistence[region].to_bits()
                != (topology.births[leaf] - topology.deaths[leaf]).to_bits()
        {
            return Err("analytic region does not describe its persistent leaf");
        }
        let expected_parent = selected_ancestor_region(
            topology.leaf_parents[leaf],
            topology.leaf_parents,
            topology.leaf_regions,
        )?
        .unwrap_or(u32::MAX);
        if topology.region_parents[region] != expected_parent {
            return Err("analytic region parent differs from the merge tree");
        }
    }
    for (leaf, &region) in topology.leaf_regions.iter().enumerate() {
        if region != u32::MAX
            && topology.region_leaves[region as usize]
                != u64::try_from(leaf).map_err(|_error| "analytic leaf does not fit u64")?
        {
            return Err("analytic leaf-to-region mapping is not invertible");
        }
    }
    Ok(())
}

fn selected_ancestor_region(
    mut parent: u64,
    leaf_parents: &[u64],
    leaf_regions: &[u32],
) -> Result<Option<u32>, &'static str> {
    while parent != u64::MAX {
        let parent_index =
            usize::try_from(parent).map_err(|_error| "analytic parent does not fit usize")?;
        if parent_index >= leaf_parents.len() {
            return Err("analytic parent is outside the leaf domain");
        }
        let region = leaf_regions[parent_index];
        if region != u32::MAX {
            return Ok(Some(region));
        }
        parent = leaf_parents[parent_index];
    }
    Ok(None)
}

fn row_count(manifest: &GenerationManifest) -> Result<usize, &'static str> {
    usize::try_from(manifest.storage.row_count)
        .map_err(|_error| "generation row count does not fit")
}

fn hash(artifact: ArtifactView<'_>, id: u16) -> Result<&[u8], &'static str> {
    vector(artifact, id, ScalarType::U8, 32)?
        .as_u8()
        .map_err(|_error| "hash section scalar type is invalid")
}

fn vector(
    artifact: ArtifactView<'_>,
    id: u16,
    scalar: ScalarType,
    length: usize,
) -> Result<SectionView<'_>, &'static str> {
    fixed(
        artifact,
        id,
        scalar,
        1,
        [
            u64::try_from(length).map_err(|_error| "section length does not fit")?,
            0,
            0,
        ],
    )
}

fn variable_vector(
    artifact: ArtifactView<'_>,
    id: u16,
    scalar: ScalarType,
) -> Result<SectionView<'_>, &'static str> {
    let section = required(artifact, id, scalar)?;
    if section.descriptor.rank != 1 || section.descriptor.shape[1..] != [0, 0] {
        return Err("section is not a vector");
    }
    Ok(section)
}

fn matrix(
    artifact: ArtifactView<'_>,
    id: u16,
    scalar: ScalarType,
    rows: usize,
    columns: usize,
) -> Result<SectionView<'_>, &'static str> {
    fixed(
        artifact,
        id,
        scalar,
        2,
        [
            u64::try_from(rows).map_err(|_error| "section rows do not fit")?,
            u64::try_from(columns).map_err(|_error| "section columns do not fit")?,
            0,
        ],
    )
}

fn variable_square(
    artifact: ArtifactView<'_>,
    id: u16,
    scalar: ScalarType,
) -> Result<SectionView<'_>, &'static str> {
    let section = required(artifact, id, scalar)?;
    if section.descriptor.rank != 2
        || section.descriptor.shape[0] == 0
        || section.descriptor.shape[0] != section.descriptor.shape[1]
        || section.descriptor.shape[2] != 0
    {
        return Err("section is not a non-empty square matrix");
    }
    Ok(section)
}

fn fixed(
    artifact: ArtifactView<'_>,
    id: u16,
    scalar: ScalarType,
    rank: u8,
    shape: [u64; 3],
) -> Result<SectionView<'_>, &'static str> {
    let section = required(artifact, id, scalar)?;
    if section.descriptor.rank != rank || section.descriptor.shape != shape {
        return Err("section rank or shape is invalid");
    }
    Ok(section)
}

fn required(
    artifact: ArtifactView<'_>,
    id: u16,
    scalar: ScalarType,
) -> Result<SectionView<'_>, &'static str> {
    let section = artifact
        .section(SectionId::new(id))
        .ok_or("required section is absent")?;
    if section.descriptor.scalar != scalar {
        return Err("section scalar type is invalid");
    }
    Ok(section)
}

#[inline]
fn unit(value: f64) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

#[inline]
const fn nonnegative(value: f64) -> bool {
    value.is_finite() && !value.is_sign_negative()
}
