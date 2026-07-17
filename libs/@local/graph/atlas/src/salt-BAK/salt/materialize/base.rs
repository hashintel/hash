use camino::Utf8Path;
use uuid::Uuid;

use super::{RankedPoint, error::BaseArtifactError};
use crate::salt::{
    format::BASE_ARTIFACT_FORMAT,
    hash::ContentHash,
    identity::IdentityDirectory,
    storage::mmap::{ArtifactSection, PublishedArtifact, SectionId, publish_artifact},
};

pub(super) const ROWS: SectionId = SectionId::new(1);
pub(super) const COORDINATES: SectionId = SectionId::new(2);
pub(super) const BUCKETS: SectionId = SectionId::new(3);
pub(super) const PRIORITY_RANKS: SectionId = SectionId::new(4);
pub(super) const MORTON_KEYS: SectionId = SectionId::new(5);
pub(super) const BUCKET_OFFSETS: SectionId = SectionId::new(6);
pub(super) const WEB_IDS: SectionId = SectionId::new(7);
pub(super) const ENTITY_UUIDS: SectionId = SectionId::new(8);
pub(super) const DRAFT_PRESENT: SectionId = SectionId::new(9);
pub(super) const DRAFT_IDS: SectionId = SectionId::new(10);
pub(super) const CANONICAL_FIELD_HASH: SectionId = SectionId::new(11);
pub(super) const CONDITION: SectionId = SectionId::new(12);
pub(super) const CONDITION_DOMAIN_HASH: SectionId = SectionId::new(13);
pub(super) const SELECTION_EVIDENCE_HASH: SectionId = SectionId::new(14);
pub(super) const PROCRUSTES_TRANSFORM: SectionId = SectionId::new(15);
pub(super) const IDENTITY_DIRECTORY_HASH: SectionId = SectionId::new(16);
pub(super) const QUANTIZATION_STEP: SectionId = SectionId::new(17);

/// Selection identity retained beside the narrowed canonical coordinates.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CanonicalProvenance {
    pub field_hash: ContentHash,
    pub condition: f64,
    pub condition_domain_hash: ContentHash,
    pub selection_evidence_hash: ContentHash,
    pub procrustes_transform: [f64; 5],
    pub quantization_step: f64,
}

/// Publishes canonical coordinates, delivery indexes, and external identities.
///
/// Delivery sections are ordered by `(importance bucket, Morton key, priority
/// rank, row)`, supporting contiguous bucket scans and spatial range lookups.
/// `ranked` is reordered in place into that persisted delivery order.
/// Identity sections use generation-row order, allowing every dense internal
/// row to be translated back to its durable graph [`EntityId`] without a
/// sidecar lookup.
///
/// [`EntityId`]: type_system::knowledge::entity::id::EntityId
///
/// # Errors
///
/// This returns an error unless ranked rows form a complete permutation of the
/// identity directory, coordinates are finite and representable as `f32`, and
/// immutable publication succeeds.
#[expect(
    clippy::too_many_lines,
    reason = "the writer keeps one explicit, auditable section-construction transaction"
)]
pub(crate) fn publish_base_artifact(
    path: &Utf8Path,
    identities: &IdentityDirectory,
    coordinates: &[[f64; 2]],
    ranked: &mut [RankedPoint],
    provenance: CanonicalProvenance,
) -> Result<PublishedArtifact, BaseArtifactError> {
    let row_count = identities.len();
    if row_count == 0 {
        return Err(BaseArtifactError::Empty);
    }
    if coordinates.len() != row_count || ranked.len() != row_count {
        return Err(BaseArtifactError::RowCount {
            identities: row_count,
            coordinates: coordinates.len(),
            ranked: ranked.len(),
        });
    }

    ranked.sort_unstable_by(|left, right| {
        left.bucket
            .cmp(&right.bucket)
            .then_with(|| left.morton.cmp(&right.morton))
            .then_with(|| left.priority_rank.cmp(&right.priority_rank))
            .then_with(|| left.row.cmp(&right.row))
    });
    let mut seen = vec![false; row_count];
    let mut rows = Vec::with_capacity(row_count);
    let mut coordinate_values = Vec::with_capacity(row_count * 2);
    let mut buckets = Vec::with_capacity(row_count);
    let mut priority_ranks = Vec::with_capacity(row_count);
    let mut morton_keys = Vec::with_capacity(row_count);
    for point in ranked.iter() {
        let row = point.row.as_usize();
        if row >= row_count {
            return Err(BaseArtifactError::UnknownRow {
                row: point.row.as_u32(),
                row_count,
            });
        }
        if seen[row] {
            return Err(BaseArtifactError::DuplicateRow {
                row: point.row.as_u32(),
            });
        }
        seen[row] = true;
        rows.push(point.row.as_u32());
        for axis in 0..2 {
            coordinate_values.push(coordinate_f32(
                point.row.as_u32(),
                axis,
                coordinates[row][axis],
            )?);
        }
        buckets.push(u32::from(point.bucket));
        priority_ranks.push(point.priority_rank);
        morton_keys.push(point.morton.get());
    }
    if let Some(row) = seen.iter().position(|seen| !seen) {
        return Err(BaseArtifactError::MissingRow {
            row: u32::try_from(row).expect("identity directory should fit u32"),
        });
    }
    let bucket_offsets = bucket_offsets(ranked);

    let mut web_ids = Vec::with_capacity(row_count * 16);
    let mut entity_uuids = Vec::with_capacity(row_count * 16);
    let mut draft_present = Vec::<u8>::with_capacity(row_count);
    let mut draft_ids = Vec::with_capacity(row_count * 16);
    for (_, entity) in identities.iter() {
        let web_id: Uuid = entity.web_id.into();
        let entity_uuid: Uuid = entity.entity_uuid.into();
        web_ids.extend_from_slice(web_id.as_bytes());
        entity_uuids.extend_from_slice(entity_uuid.as_bytes());
        if let Some(draft_id) = entity.draft_id {
            let draft_id: Uuid = draft_id.into();
            draft_present.push(1);
            draft_ids.extend_from_slice(draft_id.as_bytes());
        } else {
            draft_present.push(0);
            draft_ids.extend_from_slice(&[0; 16]);
        }
    }

    let condition = [provenance.condition];
    let quantization_step = [provenance.quantization_step];
    let identity_directory_hash = identities.content_hash();
    let sections = [
        ArtifactSection::new(ROWS, &[row_count], &rows),
        ArtifactSection::new(COORDINATES, &[row_count, 2], &coordinate_values),
        ArtifactSection::new(BUCKETS, &[row_count], &buckets),
        ArtifactSection::new(PRIORITY_RANKS, &[row_count], &priority_ranks),
        ArtifactSection::new(MORTON_KEYS, &[row_count], &morton_keys),
        ArtifactSection::new(BUCKET_OFFSETS, &[bucket_offsets.len()], &bucket_offsets),
        ArtifactSection::new(WEB_IDS, &[row_count, 16], &web_ids),
        ArtifactSection::new(ENTITY_UUIDS, &[row_count, 16], &entity_uuids),
        ArtifactSection::new(DRAFT_PRESENT, &[row_count], &draft_present),
        ArtifactSection::new(DRAFT_IDS, &[row_count, 16], &draft_ids),
        ArtifactSection::new(
            CANONICAL_FIELD_HASH,
            &[32],
            provenance.field_hash.as_bytes(),
        ),
        ArtifactSection::new(CONDITION, &[1], &condition),
        ArtifactSection::new(
            CONDITION_DOMAIN_HASH,
            &[32],
            provenance.condition_domain_hash.as_bytes(),
        ),
        ArtifactSection::new(
            SELECTION_EVIDENCE_HASH,
            &[32],
            provenance.selection_evidence_hash.as_bytes(),
        ),
        ArtifactSection::new(PROCRUSTES_TRANSFORM, &[5], &provenance.procrustes_transform),
        ArtifactSection::new(
            IDENTITY_DIRECTORY_HASH,
            &[32],
            identity_directory_hash.as_bytes(),
        ),
        ArtifactSection::new(QUANTIZATION_STEP, &[1], &quantization_step),
    ];
    let mut validated = Vec::with_capacity(sections.len());
    for section in sections {
        validated.push(section.map_err(|error| {
            crate::salt::storage::mmap::ArtifactWriteError::InvalidSection {
                index: validated.len(),
                error,
            }
        })?);
    }
    publish_artifact(path, BASE_ARTIFACT_FORMAT, &validated).map_err(Into::into)
}

fn bucket_offsets(ranked: &[RankedPoint]) -> Vec<u64> {
    let bucket_count = usize::from(
        ranked
            .last()
            .expect("validated ranked rows should be non-empty")
            .bucket,
    ) + 1;
    let mut offsets = Vec::with_capacity(bucket_count + 1);
    let mut index = 0;
    for bucket in 0..bucket_count {
        while index < ranked.len() && usize::from(ranked[index].bucket) < bucket {
            index += 1;
        }
        offsets.push(u64::try_from(index).expect("row count should fit u64"));
    }
    offsets.push(u64::try_from(ranked.len()).expect("row count should fit u64"));
    offsets
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "finite f64 values are checked again after conversion to the persisted f32 format"
)]
fn coordinate_f32(row: u32, axis: usize, value: f64) -> Result<f32, BaseArtifactError> {
    if !value.is_finite() {
        return Err(BaseArtifactError::NonFiniteCoordinate { row, axis, value });
    }
    let converted = value as f32;
    if !converted.is_finite() || f64::from(converted).to_bits() != value.to_bits() {
        return Err(BaseArtifactError::CoordinateOverflow { row, axis, value });
    }
    Ok(converted)
}
