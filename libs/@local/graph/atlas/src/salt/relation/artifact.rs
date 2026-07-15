use std::collections::HashMap;

use camino::Utf8Path;
use type_system::ontology::VersionedUrl;
use uuid::Uuid;

use super::{RelationIndexes, RelationPolicy, policy_source, policy_values};
use crate::salt::{
    format::RELATION_FORMAT,
    hash::ContentHash,
    identity::ArtifactOrdinal,
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
const POLICY_TYPE_OFFSETS: SectionId = SectionId::new(22);
const POLICY_TYPE_BYTES: SectionId = SectionId::new(23);
const POLICY_ORDINALS: SectionId = SectionId::new(24);
const POLICY_SOURCES: SectionId = SectionId::new(25);
const POLICY_SELECTED: SectionId = SectionId::new(26);
const POLICY_APPLICABILITY: SectionId = SectionId::new(27);
const POLICY_EFFECTIVE: SectionId = SectionId::new(28);
const POLICY_STRENGTH: SectionId = SectionId::new(29);
const POLICY_COINCIDENT_ADMITTED: SectionId = SectionId::new(30);

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
    relation_ordinals: &HashMap<VersionedUrl, ArtifactOrdinal>,
    policies: &[RelationPolicy],
    indexes: &RelationIndexes,
) -> Result<PublishedArtifact, ArtifactWriteError> {
    let attraction = AttractionColumns::new(indexes);
    let protection = ProtectionColumns::new(indexes);
    let policy = PolicyColumns::new(relation_ordinals, policies);
    let counts = [
        u64::try_from(indexes.attraction.len()).expect("usize should fit u64"),
        u64::try_from(indexes.protection.len()).expect("usize should fit u64"),
    ];
    let mut sections = Vec::with_capacity(30);
    push(
        &mut sections,
        CONFIGURATION_HASH,
        &[32],
        configuration.as_bytes(),
    )?;
    push(&mut sections, COUNTS, &[2], &counts)?;
    attraction.append_to(&mut sections)?;
    protection.append_to(&mut sections)?;
    push(
        &mut sections,
        EDGE_SNAPSHOT_HASH,
        &[32],
        edge_snapshot.as_bytes(),
    )?;
    policy.append_to(&mut sections)?;
    publish_artifact(path, RELATION_FORMAT, &sections)
}

struct AttractionColumns {
    rows: usize,
    link_web_ids: Vec<u8>,
    link_entity_uuids: Vec<u8>,
    link_draft_present: Vec<u8>,
    link_draft_ids: Vec<u8>,
    relation_types: Vec<u32>,
    left_rows: Vec<u32>,
    right_rows: Vec<u32>,
    confidence: Vec<f64>,
    confidence_provenance: Vec<u8>,
    degree_normalization: Vec<f64>,
    strength: Vec<f64>,
    coincident: Vec<f64>,
    proximal: Vec<f64>,
}

impl AttractionColumns {
    fn new(indexes: &RelationIndexes) -> Self {
        let rows = indexes.attraction.len();
        let mut columns = Self {
            rows,
            link_web_ids: Vec::with_capacity(rows * 16),
            link_entity_uuids: Vec::with_capacity(rows * 16),
            link_draft_present: Vec::with_capacity(rows),
            link_draft_ids: Vec::with_capacity(rows * 16),
            relation_types: Vec::with_capacity(rows),
            left_rows: Vec::with_capacity(rows),
            right_rows: Vec::with_capacity(rows),
            confidence: Vec::with_capacity(rows),
            confidence_provenance: Vec::with_capacity(rows),
            degree_normalization: Vec::with_capacity(rows),
            strength: Vec::with_capacity(rows),
            coincident: Vec::with_capacity(rows),
            proximal: Vec::with_capacity(rows),
        };
        for edge in &indexes.attraction {
            let web_id: Uuid = edge.link_entity.web_id.into();
            let entity_uuid: Uuid = edge.link_entity.entity_uuid.into();
            columns.link_web_ids.extend_from_slice(web_id.as_bytes());
            columns
                .link_entity_uuids
                .extend_from_slice(entity_uuid.as_bytes());
            if let Some(draft_id) = edge.link_entity.draft_id {
                let draft_id: Uuid = draft_id.into();
                columns.link_draft_present.push(1);
                columns
                    .link_draft_ids
                    .extend_from_slice(draft_id.as_bytes());
            } else {
                columns.link_draft_present.push(0);
                columns.link_draft_ids.extend_from_slice(&[0; 16]);
            }
            columns.relation_types.push(edge.relation.as_u32());
            columns.left_rows.push(edge.left.as_u32());
            columns.right_rows.push(edge.right.as_u32());
            columns.confidence.push(edge.confidence.value());
            columns
                .confidence_provenance
                .push(edge.confidence.provenance());
            columns.degree_normalization.push(edge.degree_normalization);
            columns.strength.push(edge.strength.get());
            columns.coincident.push(edge.coincident);
            columns.proximal.push(edge.proximal);
        }
        columns
    }

    fn append_to<'data>(
        &'data self,
        sections: &mut Vec<ArtifactSection<'data>>,
    ) -> Result<(), ArtifactWriteError> {
        append_matrix(sections, LINK_WEB_IDS, self.rows, 16, &self.link_web_ids)?;
        append_matrix(
            sections,
            LINK_ENTITY_UUIDS,
            self.rows,
            16,
            &self.link_entity_uuids,
        )?;
        append(sections, LINK_DRAFT_PRESENT, &self.link_draft_present)?;
        append_matrix(
            sections,
            LINK_DRAFT_IDS,
            self.rows,
            16,
            &self.link_draft_ids,
        )?;
        append(sections, RELATION_TYPES, &self.relation_types)?;
        append(sections, LEFT_ROWS, &self.left_rows)?;
        append(sections, RIGHT_ROWS, &self.right_rows)?;
        append(sections, CONFIDENCE, &self.confidence)?;
        append(sections, CONFIDENCE_PROVENANCE, &self.confidence_provenance)?;
        append(sections, DEGREE_NORMALIZATION, &self.degree_normalization)?;
        append(sections, STRENGTH, &self.strength)?;
        append(sections, COINCIDENT, &self.coincident)?;
        append(sections, PROXIMAL, &self.proximal)
    }
}

struct ProtectionColumns {
    first: Vec<u32>,
    second: Vec<u32>,
    hard_mass: Vec<f64>,
    ordinary_mass: Vec<f64>,
    flags: Vec<u8>,
}

impl ProtectionColumns {
    fn new(indexes: &RelationIndexes) -> Self {
        Self {
            first: indexes
                .protection
                .iter()
                .map(|entry| entry.pair.first.as_u32())
                .collect(),
            second: indexes
                .protection
                .iter()
                .map(|entry| entry.pair.second.as_u32())
                .collect(),
            hard_mass: indexes
                .protection
                .iter()
                .map(|entry| entry.hard_mass)
                .collect(),
            ordinary_mass: indexes
                .protection
                .iter()
                .map(|entry| entry.ordinary_mass)
                .collect(),
            flags: indexes
                .protection
                .iter()
                .map(|entry| u8::from(entry.hard) | (u8::from(entry.ordinary) << 1))
                .collect(),
        }
    }

    fn append_to<'data>(
        &'data self,
        sections: &mut Vec<ArtifactSection<'data>>,
    ) -> Result<(), ArtifactWriteError> {
        append(sections, PROTECTION_FIRST, &self.first)?;
        append(sections, PROTECTION_SECOND, &self.second)?;
        append(sections, HARD_MASS, &self.hard_mass)?;
        append(sections, ORDINARY_MASS, &self.ordinary_mass)?;
        append(sections, PROTECTION_FLAGS, &self.flags)
    }
}

struct PolicyColumns {
    rows: usize,
    type_offsets: Vec<u64>,
    type_bytes: Vec<u8>,
    ordinals: Vec<u32>,
    sources: Vec<u8>,
    selected: Vec<f64>,
    applicability: Vec<f64>,
    effective: Vec<f64>,
    strength: Vec<f64>,
    coincident_admitted: Vec<u8>,
}

impl PolicyColumns {
    fn new(
        relation_ordinals: &HashMap<VersionedUrl, ArtifactOrdinal>,
        policies: &[RelationPolicy],
    ) -> Self {
        let mut types = relation_ordinals
            .iter()
            .map(|(relation_type, ordinal)| (*ordinal, relation_type.to_string()))
            .collect::<Vec<_>>();
        types.sort_unstable_by_key(|(ordinal, _)| *ordinal);
        let rows = types.len().max(policies.len());
        let mut columns = Self {
            rows,
            type_offsets: vec![0],
            type_bytes: Vec::new(),
            ordinals: Vec::with_capacity(types.len()),
            sources: Vec::with_capacity(types.len()),
            selected: Vec::with_capacity(types.len() * 3),
            applicability: Vec::with_capacity(types.len()),
            effective: Vec::with_capacity(types.len() * 3),
            strength: Vec::with_capacity(types.len()),
            coincident_admitted: Vec::with_capacity(types.len()),
        };
        for (ordinal, relation_type) in types {
            columns
                .type_bytes
                .extend_from_slice(relation_type.as_bytes());
            columns.type_offsets.push(
                u64::try_from(columns.type_bytes.len()).expect("policy type bytes should fit u64"),
            );
            columns.ordinals.push(ordinal.as_u32());
            let Some(policy) = policies.get(ordinal.as_usize()) else {
                continue;
            };
            columns.sources.push(policy_source(policy.policy.source));
            let values = policy_values(policy);
            columns.selected.extend_from_slice(&values[..3]);
            columns.applicability.push(values[3]);
            columns.effective.extend_from_slice(&values[4..7]);
            columns.strength.push(values[7]);
            columns
                .coincident_admitted
                .push(u8::from(policy.policy.coincident_admitted));
        }
        columns
    }

    fn append_to<'data>(
        &'data self,
        sections: &mut Vec<ArtifactSection<'data>>,
    ) -> Result<(), ArtifactWriteError> {
        append(sections, POLICY_TYPE_OFFSETS, &self.type_offsets)?;
        append(sections, POLICY_TYPE_BYTES, &self.type_bytes)?;
        append(sections, POLICY_ORDINALS, &self.ordinals)?;
        append(sections, POLICY_SOURCES, &self.sources)?;
        append_matrix(sections, POLICY_SELECTED, self.rows, 3, &self.selected)?;
        append(sections, POLICY_APPLICABILITY, &self.applicability)?;
        append_matrix(sections, POLICY_EFFECTIVE, self.rows, 3, &self.effective)?;
        append(sections, POLICY_STRENGTH, &self.strength)?;
        append(
            sections,
            POLICY_COINCIDENT_ADMITTED,
            &self.coincident_admitted,
        )
    }
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
