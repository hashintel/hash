//! Role-specific validation for mapped generation artifacts.

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
        ArtifactRole::RelationIndexes => validate_relations(artifact, manifest),
        ArtifactRole::LandmarkSkeleton => validate_landmarks(artifact, manifest),
        ArtifactRole::ProjectorCheckpoint => Err("projector checkpoint is not an mmap artifact"),
        ArtifactRole::CanonicalBase => validate_base(artifact, manifest),
        ArtifactRole::CanonicalAnalytics => validate_analytics(artifact, manifest),
        ArtifactRole::LegacyLayout
        | ArtifactRole::LegacyIdentities
        | ArtifactRole::LegacyExportManifest => Err("legacy exports are not mmap artifacts"),
    }
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

fn validate_relations(
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let rows = row_count(manifest)?;
    if hash(artifact, 1)? != manifest.relations.policy_hash.as_bytes() {
        return Err("relation policy provenance differs from the manifest");
    }
    let counts = vector(artifact, 2, ScalarType::U64, 2)?
        .as_u64()
        .expect("section scalar type should be validated");
    let &[attraction, protection] = counts else {
        return Err("relation count section has an invalid length");
    };
    let attraction =
        usize::try_from(attraction).map_err(|_error| "attraction count does not fit")?;
    let protection =
        usize::try_from(protection).map_err(|_error| "protection count does not fit")?;

    let link_web_ids = matrix(artifact, 3, ScalarType::U8, attraction, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let link_entity_uuids = matrix(artifact, 4, ScalarType::U8, attraction, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let draft_present = vector(artifact, 5, ScalarType::U8, attraction)?
        .as_u8()
        .expect("section scalar type should be validated");
    let draft_ids = matrix(artifact, 6, ScalarType::U8, attraction, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let relation_types = vector(artifact, 7, ScalarType::U32, attraction)?
        .as_u32()
        .expect("section scalar type should be validated");
    let left = vector(artifact, 8, ScalarType::U32, attraction)?
        .as_u32()
        .expect("section scalar type should be validated");
    let right = vector(artifact, 9, ScalarType::U32, attraction)?
        .as_u32()
        .expect("section scalar type should be validated");
    let confidence = vector(artifact, 10, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");
    let confidence_provenance = vector(artifact, 11, ScalarType::U8, attraction)?
        .as_u8()
        .expect("section scalar type should be validated");
    let degree = vector(artifact, 12, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");
    let strength = vector(artifact, 13, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");
    let coincident = vector(artifact, 14, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");
    let proximal = vector(artifact, 15, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");

    for index in 0..attraction {
        if left[index] as usize >= rows
            || right[index] as usize >= rows
            || left[index] == right[index]
        {
            return Err("relation attraction contains an invalid endpoint");
        }
        if draft_present[index] > 1
            || (draft_present[index] == 0 && draft_ids[index * 16..index * 16 + 16] != [0; 16])
        {
            return Err("relation attraction contains an invalid draft identity");
        }
        if !unit(confidence[index])
            || !nonnegative(degree[index])
            || !nonnegative(strength[index])
            || !unit(coincident[index])
            || !unit(proximal[index])
            || coincident[index] + proximal[index] > 1.0 + 1.0e-12
        {
            return Err("relation attraction contains an invalid numeric value");
        }
    }

    let first = vector(artifact, 16, ScalarType::U32, protection)?
        .as_u32()
        .expect("section scalar type should be validated");
    let second = vector(artifact, 17, ScalarType::U32, protection)?
        .as_u32()
        .expect("section scalar type should be validated");
    let hard_mass = vector(artifact, 18, ScalarType::F64, protection)?
        .as_f64()
        .expect("section scalar type should be validated");
    let ordinary_mass = vector(artifact, 19, ScalarType::F64, protection)?
        .as_f64()
        .expect("section scalar type should be validated");
    let flags = vector(artifact, 20, ScalarType::U8, protection)?
        .as_u8()
        .expect("section scalar type should be validated");
    let declared_edge_snapshot = hash(artifact, 21)?;
    if declared_edge_snapshot != manifest.relations.edge_snapshot_hash.as_bytes() {
        return Err("relation edge snapshot differs from the manifest");
    }
    let mut previous = None;
    for index in 0..protection {
        let pair = (first[index], second[index]);
        if pair.0 >= pair.1
            || pair.1 as usize >= rows
            || previous.is_some_and(|previous| previous >= pair)
        {
            return Err("relation protection pairs are invalid or unordered");
        }
        if !unit(hard_mass[index]) || !unit(ordinary_mass[index]) || flags[index] & !0b11 != 0 {
            return Err("relation protection contains an invalid mass or flag");
        }
        previous = Some(pair);
    }
    let mut edge_snapshot = ContentHasher::new(b"hash.graph.atlas.salt.relation-edge-snapshot.v1");
    for index in 0..attraction {
        edge_snapshot.update(&link_web_ids[index * 16..index * 16 + 16]);
        edge_snapshot.update(&link_entity_uuids[index * 16..index * 16 + 16]);
        edge_snapshot.update(&[draft_present[index]]);
        edge_snapshot.update(&draft_ids[index * 16..index * 16 + 16]);
        edge_snapshot.update(&relation_types[index].to_le_bytes());
        edge_snapshot.update(&left[index].to_le_bytes());
        edge_snapshot.update(&right[index].to_le_bytes());
        edge_snapshot.update(&confidence[index].to_bits().to_le_bytes());
        edge_snapshot.update(&[confidence_provenance[index]]);
        for value in [
            degree[index],
            strength[index],
            coincident[index],
            proximal[index],
        ] {
            edge_snapshot.update(&value.to_bits().to_le_bytes());
        }
    }
    if edge_snapshot.finish().as_bytes() != declared_edge_snapshot {
        return Err("relation edge snapshot hash does not describe the persisted table");
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
        bucket_hash.update(&buckets[index].to_le_bytes());
        bucket_hash.update(&priorities[index].to_le_bytes());
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
    let mut merge_tree = ContentHasher::new(b"hash.graph.atlas.salt.merge-tree.v1");
    merge_tree.update(&density_maximum.to_bits().to_le_bytes());
    for (&birth, &death) in births.iter().zip(deaths) {
        merge_tree.update(&birth.to_bits().to_le_bytes());
        merge_tree.update(&death.to_bits().to_le_bytes());
    }
    if merge_tree.finish() != canonical.merge_tree_hash {
        return Err("analytic merge tree differs from the manifest");
    }
    let pixels = grid
        .checked_mul(grid)
        .ok_or("analytic grid dimensions overflow")?;
    if peak_pixels.iter().any(|&pixel| pixel >= pixels as u64)
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
    {
        return Err("analytic artifact contains an out-of-range index");
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
