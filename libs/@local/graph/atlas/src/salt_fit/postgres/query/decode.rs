//! Bounded PostgreSQL row decoding and extraction identity helpers.

#![expect(
    clippy::little_endian_bytes,
    reason = "extraction identities use canonical little-endian scalar encodings"
)]

use core::str::FromStr as _;

use tokio_postgres::Row;
use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityId, EntityUuid},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::{ExtractedEntity, ExtractedLink, PostgresExtractionError};
use crate::salt::{CANONICAL_DIMENSIONS, ContentHash, ContentHasher, EntityAtEdition, Probability};

pub(super) fn knowledge_hash(
    entities: &[ExtractedEntity],
    embeddings: &[f32],
    links: &[ExtractedLink],
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.knowledge-extraction.v1");
    for (entity, embedding) in entities
        .iter()
        .zip(embeddings.chunks_exact(CANONICAL_DIMENSIONS))
    {
        hash_selected(&mut hasher, entity.selected);
        if let Some(label) = entity.label.as_deref() {
            hasher.update(&[1]);
            hash_text(&mut hasher, label);
        } else {
            hasher.update(&[0]);
        }
        for entity_type in &entity.entity_types {
            hash_text(&mut hasher, &entity_type.to_string());
        }
        for value in embedding {
            hasher.update(&value.to_bits().to_le_bytes());
        }
    }
    for link in links {
        hash_selected(&mut hasher, link.link);
        hash_selected(&mut hasher, link.left);
        hash_selected(&mut hasher, link.right);
        hash_text(&mut hasher, &link.relation_type.selected.to_string());
        for candidate in &link.relation_type.candidates {
            hash_text(&mut hasher, &candidate.to_string());
        }
        for required_type in &link.required_entity_types {
            hash_text(&mut hasher, &required_type.to_string());
        }
        for confidence in [
            link.confidence.link,
            link.confidence.left,
            link.confidence.right,
        ] {
            match confidence {
                Some(confidence) => {
                    hasher.update(&[1]);
                    hasher.update(&confidence.get().to_bits().to_le_bytes());
                }
                None => hasher.update(&[0]),
            }
        }
    }
    hasher.finish()
}

pub(super) fn provenance_hash(
    snapshot: ContentHash,
    revision: ContentHash,
    ontology: ContentHash,
    knowledge: ContentHash,
    links: &[ExtractedLink],
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.local-extraction-provenance.v1");
    for identity in [snapshot, revision, ontology, knowledge] {
        hasher.update(identity.as_bytes());
    }
    for link in links {
        hash_selected(&mut hasher, link.link);
        for candidate in &link.relation_type.candidates {
            hash_text(&mut hasher, &candidate.to_string());
        }
    }
    hasher.finish()
}

pub(super) fn selected_entity(
    row: &Row,
    column: usize,
) -> Result<EntityAtEdition, PostgresExtractionError> {
    Ok(EntityAtEdition {
        entity_id: entity_id(row.try_get(column)?, row.try_get(column + 1)?),
        edition_id: EntityEditionId::new(row.try_get(column + 2)?),
    })
}

pub(super) fn entity_id(web_id: Uuid, entity_uuid: Uuid) -> EntityId {
    EntityId {
        web_id: WebId::new(web_id),
        entity_uuid: EntityUuid::new(entity_uuid),
        draft_id: None,
    }
}

pub(super) fn parse_types(
    values: Vec<String>,
) -> Result<Box<[VersionedUrl]>, PostgresExtractionError> {
    let mut parsed = values
        .into_iter()
        .map(|value| {
            VersionedUrl::from_str(&value)
                .map_err(|_error| PostgresExtractionError::InvalidEntityType { value })
        })
        .collect::<Result<Vec<_>, _>>()?;
    parsed.sort_unstable();
    parsed.dedup();
    Ok(parsed.into_boxed_slice())
}

pub(super) fn required_types(
    link_types: &[VersionedUrl],
    endpoint_rows: [usize; 2],
    entities: &[ExtractedEntity],
) -> Box<[VersionedUrl]> {
    let mut required = link_types
        .iter()
        .cloned()
        .chain(
            endpoint_rows
                .into_iter()
                .flat_map(|row| entities[row].entity_types.iter().cloned()),
        )
        .collect::<Vec<_>>();
    required.sort_unstable();
    required.dedup();
    required.into_boxed_slice()
}

pub(super) fn probability(
    value: Option<f64>,
) -> Result<Option<Probability>, PostgresExtractionError> {
    value
        .map(Probability::new)
        .transpose()
        .map_err(|_error| PostgresExtractionError::InvalidConfidence)
}

pub(super) fn validate_embedding(
    row: usize,
    values: &[f32],
) -> Result<(), PostgresExtractionError> {
    if values.len() != CANONICAL_DIMENSIONS {
        return Err(PostgresExtractionError::InvalidEmbedding {
            row,
            reason: "wrong dimensionality",
        });
    }
    let squared_norm = values
        .iter()
        .try_fold(0.0_f64, |sum, &value| {
            value
                .is_finite()
                .then_some(f64::from(value).mul_add(f64::from(value), sum))
        })
        .ok_or(PostgresExtractionError::InvalidEmbedding {
            row,
            reason: "non-finite component",
        })?;
    if !squared_norm.is_finite() || squared_norm <= f64::MIN_POSITIVE {
        return Err(PostgresExtractionError::InvalidEmbedding {
            row,
            reason: "zero or non-finite norm",
        });
    }
    Ok(())
}

pub(super) fn try_vec<T>(
    resource: &'static str,
    elements: usize,
) -> Result<Vec<T>, PostgresExtractionError> {
    let mut values = Vec::new();
    values
        .try_reserve_exact(elements)
        .map_err(|_error| PostgresExtractionError::Allocation { resource, elements })?;
    Ok(values)
}

fn hash_selected(hasher: &mut ContentHasher, selected: EntityAtEdition) {
    let web_id: Uuid = selected.entity_id.web_id.into();
    let entity_uuid: Uuid = selected.entity_id.entity_uuid.into();
    hasher.update(web_id.as_bytes());
    hasher.update(entity_uuid.as_bytes());
    hasher.update(selected.edition_id.as_uuid().as_bytes());
}

pub(super) fn hash_text(hasher: &mut ContentHasher, value: &str) {
    hasher.update(
        &u64::try_from(value.len())
            .expect("text length should fit u64")
            .to_le_bytes(),
    );
    hasher.update(value.as_bytes());
}
