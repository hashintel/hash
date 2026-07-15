use camino::Utf8Path;
use uuid::Uuid;

use super::RelationIndexes;
use crate::salt::{
    format::RELATION_FORMAT,
    hash::ContentHash,
    storage::mmap::{
        ArtifactScalar, ArtifactSection, ArtifactWriteError, PublishedArtifact, SectionId,
        publish_artifact,
    },
};

const CONFIGURATION_HASH: SectionId = SectionId::new(1);
const COUNTS: SectionId = SectionId::new(2);
const LINK_WEB_IDS: SectionId = SectionId::new(3);
const LINK_ENTITY_UUIDS: SectionId = SectionId::new(4);
const LINK_DRAFT_PRESENT: SectionId = SectionId::new(5);
const LINK_DRAFT_IDS: SectionId = SectionId::new(6);
const RELATION_TYPES: SectionId = SectionId::new(7);
const LEFT_ROWS: SectionId = SectionId::new(8);
const RIGHT_ROWS: SectionId = SectionId::new(9);
const CONFIDENCE: SectionId = SectionId::new(10);
const CONFIDENCE_PROVENANCE: SectionId = SectionId::new(11);
const DEGREE_NORMALIZATION: SectionId = SectionId::new(12);
const STRENGTH: SectionId = SectionId::new(13);
const COINCIDENT: SectionId = SectionId::new(14);
const PROXIMAL: SectionId = SectionId::new(15);
const PROTECTION_FIRST: SectionId = SectionId::new(16);
const PROTECTION_SECOND: SectionId = SectionId::new(17);
const HARD_MASS: SectionId = SectionId::new(18);
const ORDINARY_MASS: SectionId = SectionId::new(19);
const PROTECTION_FLAGS: SectionId = SectionId::new(20);
const EDGE_SNAPSHOT_HASH: SectionId = SectionId::new(21);

/// Publishes complete attraction instances and pair-level protection together.
///
/// Link identities are retained per attraction instance, so parallel links do
/// not collapse. Pair protection remains a separately ordered table because
/// its maximum aggregation has different multiplicity semantics.
///
/// # Errors
///
/// This returns an error when a section cannot be represented or immutable
/// publication fails.
pub(crate) fn publish_relation_indexes(
    path: &Utf8Path,
    configuration: ContentHash,
    edge_snapshot: ContentHash,
    indexes: &RelationIndexes,
) -> Result<PublishedArtifact, ArtifactWriteError> {
    let counts = [
        u64::try_from(indexes.attraction.len()).expect("usize should fit u64"),
        u64::try_from(indexes.protection.len()).expect("usize should fit u64"),
    ];
    let mut link_web_ids = Vec::with_capacity(indexes.attraction.len() * 16);
    let mut link_entity_uuids = Vec::with_capacity(indexes.attraction.len() * 16);
    let mut link_draft_present = Vec::with_capacity(indexes.attraction.len());
    let mut link_draft_ids = Vec::with_capacity(indexes.attraction.len() * 16);
    let mut relation_types = Vec::with_capacity(indexes.attraction.len());
    let mut left_rows = Vec::with_capacity(indexes.attraction.len());
    let mut right_rows = Vec::with_capacity(indexes.attraction.len());
    let mut confidence = Vec::with_capacity(indexes.attraction.len());
    let mut confidence_provenance = Vec::with_capacity(indexes.attraction.len());
    let mut degree_normalization = Vec::with_capacity(indexes.attraction.len());
    let mut strength = Vec::with_capacity(indexes.attraction.len());
    let mut coincident = Vec::with_capacity(indexes.attraction.len());
    let mut proximal = Vec::with_capacity(indexes.attraction.len());
    for edge in &indexes.attraction {
        let web_id: Uuid = edge.link_entity.web_id.into();
        let entity_uuid: Uuid = edge.link_entity.entity_uuid.into();
        link_web_ids.extend_from_slice(web_id.as_bytes());
        link_entity_uuids.extend_from_slice(entity_uuid.as_bytes());
        if let Some(draft_id) = edge.link_entity.draft_id {
            let draft_id: Uuid = draft_id.into();
            link_draft_present.push(1_u8);
            link_draft_ids.extend_from_slice(draft_id.as_bytes());
        } else {
            link_draft_present.push(0_u8);
            link_draft_ids.extend_from_slice(&[0; 16]);
        }
        relation_types.push(edge.relation.as_u32());
        left_rows.push(edge.left.as_u32());
        right_rows.push(edge.right.as_u32());
        confidence.push(edge.confidence.value());
        confidence_provenance.push(edge.confidence.provenance());
        degree_normalization.push(edge.degree_normalization);
        strength.push(edge.strength.get());
        coincident.push(edge.coincident);
        proximal.push(edge.proximal);
    }

    let protection_first = indexes
        .protection
        .iter()
        .map(|entry| entry.pair.first.as_u32())
        .collect::<Vec<_>>();
    let protection_second = indexes
        .protection
        .iter()
        .map(|entry| entry.pair.second.as_u32())
        .collect::<Vec<_>>();
    let hard_mass = indexes
        .protection
        .iter()
        .map(|entry| entry.hard_mass)
        .collect::<Vec<_>>();
    let ordinary_mass = indexes
        .protection
        .iter()
        .map(|entry| entry.ordinary_mass)
        .collect::<Vec<_>>();
    let protection_flags = indexes
        .protection
        .iter()
        .map(|entry| u8::from(entry.hard) | (u8::from(entry.ordinary) << 1))
        .collect::<Vec<_>>();

    let mut sections = Vec::with_capacity(21);
    push(
        &mut sections,
        CONFIGURATION_HASH,
        &[32],
        configuration.as_bytes(),
    )?;
    push(&mut sections, COUNTS, &[2], &counts)?;
    let attraction_rows = indexes.attraction.len();
    append_matrix(
        &mut sections,
        LINK_WEB_IDS,
        attraction_rows,
        16,
        &link_web_ids,
    )?;
    append_matrix(
        &mut sections,
        LINK_ENTITY_UUIDS,
        attraction_rows,
        16,
        &link_entity_uuids,
    )?;
    append(&mut sections, LINK_DRAFT_PRESENT, &link_draft_present)?;
    append_matrix(
        &mut sections,
        LINK_DRAFT_IDS,
        attraction_rows,
        16,
        &link_draft_ids,
    )?;
    append(&mut sections, RELATION_TYPES, &relation_types)?;
    append(&mut sections, LEFT_ROWS, &left_rows)?;
    append(&mut sections, RIGHT_ROWS, &right_rows)?;
    append(&mut sections, CONFIDENCE, &confidence)?;
    append(&mut sections, CONFIDENCE_PROVENANCE, &confidence_provenance)?;
    append(&mut sections, DEGREE_NORMALIZATION, &degree_normalization)?;
    append(&mut sections, STRENGTH, &strength)?;
    append(&mut sections, COINCIDENT, &coincident)?;
    append(&mut sections, PROXIMAL, &proximal)?;
    append(&mut sections, PROTECTION_FIRST, &protection_first)?;
    append(&mut sections, PROTECTION_SECOND, &protection_second)?;
    append(&mut sections, HARD_MASS, &hard_mass)?;
    append(&mut sections, ORDINARY_MASS, &ordinary_mass)?;
    append(&mut sections, PROTECTION_FLAGS, &protection_flags)?;
    push(
        &mut sections,
        EDGE_SNAPSHOT_HASH,
        &[32],
        edge_snapshot.as_bytes(),
    )?;
    publish_artifact(path, RELATION_FORMAT, &sections)
}

#[inline]
fn append<'data, T>(
    sections: &mut Vec<ArtifactSection<'data>>,
    id: SectionId,
    values: &'data [T],
) -> Result<(), ArtifactWriteError>
where
    T: ArtifactScalar,
{
    push(sections, id, &[values.len()], values)
}

#[inline]
fn append_matrix<'data, T>(
    sections: &mut Vec<ArtifactSection<'data>>,
    id: SectionId,
    rows: usize,
    columns: usize,
    values: &'data [T],
) -> Result<(), ArtifactWriteError>
where
    T: ArtifactScalar,
{
    push(sections, id, &[rows, columns], values)
}

#[inline]
fn push<'data, T>(
    sections: &mut Vec<ArtifactSection<'data>>,
    id: SectionId,
    dimensions: &[usize],
    values: &'data [T],
) -> Result<(), ArtifactWriteError>
where
    T: ArtifactScalar,
{
    let index = sections.len();
    let section = ArtifactSection::new(id, dimensions, values)
        .map_err(|error| ArtifactWriteError::InvalidSection { index, error })?;
    sections.push(section);
    Ok(())
}
