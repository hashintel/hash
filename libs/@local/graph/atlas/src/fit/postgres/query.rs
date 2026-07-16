use std::collections::{HashMap, HashSet};

use futures::TryStreamExt as _;
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use tokio_postgres::{GenericClient, types::ToSql};
use type_system::knowledge::entity::id::{EntityEditionId, EntityId};
use uuid::Uuid;

#[path = "query/decode.rs"]
mod decode;

use decode::{
    entity_id, hash_text, knowledge_hash, parse_types, probability, provenance_hash,
    required_types, selected_entity, try_vec, validate_embedding,
};

use super::{
    error::PostgresExtractionError,
    model::{
        ExtractedEntity, ExtractedLink, LinkTypeSelection, PostgresExtraction, SnapshotEnvelope,
    },
    vector::CanonicalVector,
};
use crate::{
    fit::{FitRequestV1, MINIMUM_FIT_ENTITIES},
    salt::{CANONICAL_DIMENSIONS, ContentHash, ContentHasher, EntityAtEdition, RelationConfidence},
};

const LINK_ROOT_BASE_URL: &str = "https://blockprotocol.org/@blockprotocol/types/entity-type/link/";
const LINK_ROOT_VERSION: i64 = 1;
const MAXIMUM_TOTAL_TYPE_REFERENCES: usize = 4_000_000;
const MAXIMUM_TOTAL_TYPE_BYTES: usize = 256 * 1_024 * 1_024;
const MAXIMUM_ONTOLOGY_SCHEMA_BYTES: usize = 256 * 1_024 * 1_024;

#[derive(Debug, Default)]
struct ExtractionBudget {
    type_references: usize,
    type_bytes: usize,
}

impl ExtractionBudget {
    fn consume_types(
        &mut self,
        resource: &'static str,
        references: usize,
        bytes: usize,
    ) -> Result<(), PostgresExtractionError> {
        accumulate_capacity(
            resource,
            &mut self.type_references,
            references,
            MAXIMUM_TOTAL_TYPE_REFERENCES,
        )?;
        accumulate_capacity(
            resource,
            &mut self.type_bytes,
            bytes,
            MAXIMUM_TOTAL_TYPE_BYTES,
        )
    }
}

const ENTITY_COUNT_QUERY: &str = "
    SELECT COUNT(*)
    FROM entity_embeddings AS embedding
    JOIN entity_temporal_metadata AS temporal
      ON temporal.web_id = embedding.web_id
     AND temporal.entity_uuid = embedding.entity_uuid
     AND temporal.draft_id IS NOT DISTINCT FROM embedding.draft_id
    JOIN entity_editions AS edition
      ON edition.entity_edition_id = temporal.entity_edition_id
    JOIN entity_edition_cache AS cache
      ON cache.entity_edition_id = temporal.entity_edition_id
    WHERE embedding.property IS NULL
      AND embedding.draft_id IS NULL
      AND temporal.draft_id IS NULL
      AND temporal.transaction_time @> transaction_timestamp()
      AND temporal.decision_time @> transaction_timestamp()
      AND temporal.transaction_time @> embedding.updated_at_transaction_time
      AND temporal.decision_time @> embedding.updated_at_decision_time
      AND NOT edition.archived
      AND (cardinality($1::uuid[]) = 0 OR embedding.web_id = ANY($1::uuid[]))";

const ENTITY_QUERY: &str = "
    SELECT
        embedding.web_id,
        embedding.entity_uuid,
        temporal.entity_edition_id,
        embedding.embedding,
        COALESCE(octet_length(cache.labels[1]), 0)::bigint,
        CASE
            WHEN COALESCE(octet_length(cache.labels[1]), 0) <= $4::bigint
            THEN cache.labels[1]
        END,
        COALESCE(cardinality(cache.versioned_urls), 0)::bigint,
        COALESCE(octet_length(array_to_string(cache.versioned_urls, '')), 0)::bigint,
        CASE
            WHEN COALESCE(cardinality(cache.versioned_urls), 0) <= $5::bigint
             AND COALESCE(octet_length(array_to_string(cache.versioned_urls, '')), 0)
                 <= $6::bigint
            THEN cache.versioned_urls
        END
    FROM entity_embeddings AS embedding
    JOIN entity_temporal_metadata AS temporal
      ON temporal.web_id = embedding.web_id
     AND temporal.entity_uuid = embedding.entity_uuid
     AND temporal.draft_id IS NOT DISTINCT FROM embedding.draft_id
    JOIN entity_editions AS edition
      ON edition.entity_edition_id = temporal.entity_edition_id
    JOIN entity_edition_cache AS cache
      ON cache.entity_edition_id = temporal.entity_edition_id
    WHERE embedding.property IS NULL
      AND embedding.draft_id IS NULL
      AND temporal.draft_id IS NULL
      AND temporal.transaction_time @> transaction_timestamp()
      AND temporal.decision_time @> transaction_timestamp()
      AND temporal.transaction_time @> embedding.updated_at_transaction_time
      AND temporal.decision_time @> embedding.updated_at_decision_time
      AND NOT edition.archived
      AND (cardinality($2::uuid[]) = 0 OR embedding.web_id = ANY($2::uuid[]))
    ORDER BY
        md5(embedding.web_id::text || ':' || embedding.entity_uuid::text || ':' || $1::text),
        embedding.web_id,
        embedding.entity_uuid
    LIMIT $3::bigint";

const LINK_COUNT_QUERY: &str = "
    WITH sample(web_id, entity_uuid, entity_edition_id) AS (
        SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
    )
    SELECT COUNT(*)
    FROM sample AS link_sample
    JOIN entity_edge AS left_edge
      ON left_edge.source_web_id = link_sample.web_id
     AND left_edge.source_entity_uuid = link_sample.entity_uuid
     AND left_edge.kind = 'has-left-entity'
     AND left_edge.direction = 'outgoing'
    JOIN entity_edge AS right_edge
      ON right_edge.source_web_id = link_sample.web_id
     AND right_edge.source_entity_uuid = link_sample.entity_uuid
     AND right_edge.kind = 'has-right-entity'
     AND right_edge.direction = 'outgoing'
    JOIN sample AS left_sample
      ON left_sample.web_id = left_edge.target_web_id
     AND left_sample.entity_uuid = left_edge.target_entity_uuid
    JOIN sample AS right_sample
      ON right_sample.web_id = right_edge.target_web_id
     AND right_sample.entity_uuid = right_edge.target_entity_uuid
    WHERE EXISTS (
        SELECT 1
        FROM entity_is_of_type AS direct_type
        JOIN ontology_ids AS direct_id
          ON direct_id.ontology_id = direct_type.entity_type_ontology_id
        WHERE direct_type.entity_edition_id = link_sample.entity_edition_id
          AND direct_type.inheritance_depth = 0
          AND (
              (direct_id.base_url = $4 AND direct_id.version = $5)
              OR EXISTS (
                  SELECT 1
                  FROM entity_type_inherits_from AS ancestry
                  JOIN ontology_ids AS ancestor_id
                    ON ancestor_id.ontology_id = ancestry.target_entity_type_ontology_id
                  WHERE ancestry.source_entity_type_ontology_id =
                        direct_type.entity_type_ontology_id
                    AND ancestor_id.base_url = $4
                    AND ancestor_id.version = $5
              )
          )
    )";

const LINK_QUERY: &str = "
    WITH sample(web_id, entity_uuid, entity_edition_id) AS (
        SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
    )
    SELECT
        link_sample.web_id,
        link_sample.entity_uuid,
        link_sample.entity_edition_id,
        left_sample.web_id,
        left_sample.entity_uuid,
        left_sample.entity_edition_id,
        right_sample.web_id,
        right_sample.entity_uuid,
        right_sample.entity_edition_id,
        link_edition.confidence,
        left_edge.confidence,
        right_edge.confidence,
        cardinality(link_types.versioned_urls)::bigint,
        octet_length(array_to_string(link_types.versioned_urls, ''))::bigint,
        CASE
            WHEN cardinality(link_types.versioned_urls) <= $6::bigint
             AND octet_length(array_to_string(link_types.versioned_urls, '')) <= $7::bigint
            THEN link_types.versioned_urls
        END
    FROM sample AS link_sample
    JOIN entity_edge AS left_edge
      ON left_edge.source_web_id = link_sample.web_id
     AND left_edge.source_entity_uuid = link_sample.entity_uuid
     AND left_edge.kind = 'has-left-entity'
     AND left_edge.direction = 'outgoing'
    JOIN entity_edge AS right_edge
      ON right_edge.source_web_id = link_sample.web_id
     AND right_edge.source_entity_uuid = link_sample.entity_uuid
     AND right_edge.kind = 'has-right-entity'
     AND right_edge.direction = 'outgoing'
    JOIN sample AS left_sample
      ON left_sample.web_id = left_edge.target_web_id
     AND left_sample.entity_uuid = left_edge.target_entity_uuid
    JOIN sample AS right_sample
      ON right_sample.web_id = right_edge.target_web_id
     AND right_sample.entity_uuid = right_edge.target_entity_uuid
    JOIN entity_editions AS link_edition
      ON link_edition.entity_edition_id = link_sample.entity_edition_id
    CROSS JOIN LATERAL (
        SELECT array_agg(
            direct_id.base_url || 'v/' || direct_id.version
            ORDER BY direct_id.base_url || 'v/' || direct_id.version
        ) AS versioned_urls
        FROM entity_is_of_type AS direct_type
        JOIN ontology_ids AS direct_id
          ON direct_id.ontology_id = direct_type.entity_type_ontology_id
        WHERE direct_type.entity_edition_id = link_sample.entity_edition_id
          AND direct_type.inheritance_depth = 0
          AND (
              (direct_id.base_url = $4 AND direct_id.version = $5)
              OR EXISTS (
                  SELECT 1
                  FROM entity_type_inherits_from AS ancestry
                  JOIN ontology_ids AS ancestor_id
                    ON ancestor_id.ontology_id = ancestry.target_entity_type_ontology_id
                  WHERE ancestry.source_entity_type_ontology_id =
                        direct_type.entity_type_ontology_id
                    AND ancestor_id.base_url = $4
                    AND ancestor_id.version = $5
              )
          )
    ) AS link_types
    WHERE cardinality(link_types.versioned_urls) > 0
    ORDER BY
        link_sample.web_id,
        link_sample.entity_uuid,
        link_sample.entity_edition_id,
        left_sample.web_id,
        left_sample.entity_uuid,
        right_sample.web_id,
        right_sample.entity_uuid";

pub(super) async fn extract_current_snapshot(
    client: &(impl GenericClient + Sync),
    request: &FitRequestV1,
) -> Result<PostgresExtraction, PostgresExtractionError> {
    let (transaction_time, store_snapshot_identity, authorization_revision) =
        snapshot_identity(client).await?;
    let mut budget = ExtractionBudget::default();
    let (entities, canonical_embeddings) = extract_entities(client, request, &mut budget).await?;
    let (links, ambiguous_link_type_count) =
        extract_links(client, &entities, request, &mut budget).await?;
    let ontology_hash = ontology_hash(client, &entities, &mut budget).await?;
    let knowledge_hash = knowledge_hash(&entities, &canonical_embeddings, &links);
    let provenance_hash = provenance_hash(
        store_snapshot_identity,
        authorization_revision,
        ontology_hash,
        knowledge_hash,
        &links,
    );

    Ok(PostgresExtraction {
        entities,
        canonical_embeddings,
        links,
        envelope: SnapshotEnvelope {
            transaction_time,
            store_snapshot_identity,
            ontology_hash,
            knowledge_hash,
            authorization_revision,
        },
        provenance_hash,
        ambiguous_link_type_count,
    })
}

async fn snapshot_identity(
    client: &(impl GenericClient + Sync),
) -> Result<(Timestamp<TransactionTime>, ContentHash, ContentHash), PostgresExtractionError> {
    let row = client
        .query_one(
            "SELECT
                 transaction_timestamp(),
                 current_database(),
                 pg_current_snapshot()::text,
                 pg_current_wal_lsn()::text",
            &[],
        )
        .await?;
    let transaction_time: Timestamp<TransactionTime> = row.try_get(0)?;
    let database: String = row.try_get(1)?;
    let snapshot: String = row.try_get(2)?;
    let wal: String = row.try_get(3)?;
    let mut store = ContentHasher::new(b"hash.graph.atlas.fit.local-postgres-snapshot.v1");
    store.update(database.as_bytes());
    store.update(snapshot.as_bytes());
    store.update(transaction_time.to_string().as_bytes());
    let mut revision = ContentHasher::new(b"hash.graph.atlas.fit.optimistic-wal-revision.v1");
    revision.update(database.as_bytes());
    revision.update(wal.as_bytes());
    Ok((transaction_time, store.finish(), revision.finish()))
}

#[expect(
    clippy::too_many_lines,
    reason = "the streaming row decoder keeps each capacity check immediately before allocation"
)]
async fn extract_entities(
    client: &(impl GenericClient + Sync),
    request: &FitRequestV1,
    budget: &mut ExtractionBudget,
) -> Result<(Box<[ExtractedEntity]>, Box<[f32]>), PostgresExtractionError> {
    let target = i64::try_from(request.sample.target_entities).map_err(|_error| {
        PostgresExtractionError::Capacity {
            resource: "entities",
            actual: request.sample.target_entities,
            maximum: usize::try_from(i64::MAX).unwrap_or(usize::MAX),
        }
    })?;
    let available: i64 = client
        .query_one(ENTITY_COUNT_QUERY, &[&request.web_ids])
        .await?
        .try_get(0)?;
    let available =
        usize::try_from(available).map_err(|_error| PostgresExtractionError::Capacity {
            resource: "available entities",
            actual: usize::MAX,
            maximum: request.limits.maximum_entities,
        })?;
    let expected = available.min(request.sample.target_entities);
    if expected == 0 {
        return Err(PostgresExtractionError::EmptyCorpus);
    }
    if expected < MINIMUM_FIT_ENTITIES {
        return Err(PostgresExtractionError::CorpusTooSmall {
            actual: expected,
            minimum: MINIMUM_FIT_ENTITIES,
        });
    }
    let seed = request.sample.seed.to_string();
    let maximum_label_bytes =
        i64::try_from(request.limits.maximum_label_bytes).map_err(|_error| {
            PostgresExtractionError::Capacity {
                resource: "label bytes",
                actual: request.limits.maximum_label_bytes,
                maximum: usize::try_from(i64::MAX).unwrap_or(usize::MAX),
            }
        })?;
    let maximum_entity_types = i64::try_from(request.limits.maximum_required_types_per_link)
        .map_err(|_error| PostgresExtractionError::Capacity {
            resource: "entity types",
            actual: request.limits.maximum_required_types_per_link,
            maximum: usize::try_from(i64::MAX).unwrap_or(usize::MAX),
        })?;
    let maximum_type_bytes =
        i64::try_from(MAXIMUM_TOTAL_TYPE_BYTES).expect("fixed type-byte bound should fit i64");
    let mut entities = try_vec("entity rows", expected)?;
    let embedding_elements =
        expected
            .checked_mul(CANONICAL_DIMENSIONS)
            .ok_or(PostgresExtractionError::Capacity {
                resource: "embedding values",
                actual: usize::MAX,
                maximum: request
                    .limits
                    .maximum_entities
                    .saturating_mul(CANONICAL_DIMENSIONS),
            })?;
    let mut embeddings = try_vec("embedding values", embedding_elements)?;
    let mut label_bytes = 0_usize;
    let stream = client
        .query_raw(
            ENTITY_QUERY,
            [
                &seed as &(dyn ToSql + Sync),
                &request.web_ids,
                &target,
                &maximum_label_bytes,
                &maximum_entity_types,
                &maximum_type_bytes,
            ],
        )
        .await?;
    futures::pin_mut!(stream);
    while let Some(row) = stream.try_next().await? {
        let row_index = entities.len();
        let web_id: Uuid = row.try_get(0)?;
        let entity_uuid: Uuid = row.try_get(1)?;
        let edition_id: Uuid = row.try_get(2)?;
        let vector: CanonicalVector = row.try_get(3)?;
        validate_embedding(row_index, &vector.0)?;
        embeddings.extend_from_slice(&vector.0);
        let row_label_bytes = usize::try_from(row.try_get::<_, i64>(4)?).unwrap_or(usize::MAX);
        label_bytes = label_bytes.saturating_add(row_label_bytes);
        if label_bytes > request.limits.maximum_label_bytes {
            return Err(PostgresExtractionError::Capacity {
                resource: "label bytes",
                actual: label_bytes,
                maximum: request.limits.maximum_label_bytes,
            });
        }
        let label: Option<String> = row.try_get(5)?;
        let entity_type_count = usize::try_from(row.try_get::<_, i64>(6)?).unwrap_or(usize::MAX);
        if entity_type_count > request.limits.maximum_required_types_per_link {
            return Err(PostgresExtractionError::Capacity {
                resource: "entity types on one entity",
                actual: entity_type_count,
                maximum: request.limits.maximum_required_types_per_link,
            });
        }
        let entity_type_bytes = usize::try_from(row.try_get::<_, i64>(7)?).unwrap_or(usize::MAX);
        budget.consume_types("entity types", entity_type_count, entity_type_bytes)?;
        let entity_types = parse_types(row.try_get(8)?)?;
        entities.push(ExtractedEntity {
            selected: EntityAtEdition {
                entity_id: entity_id(web_id, entity_uuid),
                edition_id: EntityEditionId::new(edition_id),
            },
            label: label.map(String::into_boxed_str),
            entity_types,
        });
    }
    require_exact_count("streamed entities", entities.len(), expected)?;
    Ok((entities.into_boxed_slice(), embeddings.into_boxed_slice()))
}

#[expect(
    clippy::too_many_lines,
    reason = "the streaming link decoder keeps selection, provenance, and bounds in one pass"
)]
async fn extract_links(
    client: &(impl GenericClient + Sync),
    entities: &[ExtractedEntity],
    request: &FitRequestV1,
    budget: &mut ExtractionBudget,
) -> Result<(Box<[ExtractedLink]>, usize), PostgresExtractionError> {
    let web_ids = entities
        .iter()
        .map(|entity| Uuid::from(entity.entity_id().web_id))
        .collect::<Vec<_>>();
    let entity_uuids = entities
        .iter()
        .map(|entity| Uuid::from(entity.entity_id().entity_uuid))
        .collect::<Vec<_>>();
    let edition_ids = entities
        .iter()
        .map(|entity| entity.edition_id().into_uuid())
        .collect::<Vec<_>>();
    let count_parameters: [&(dyn ToSql + Sync); 5] = [
        &web_ids,
        &entity_uuids,
        &edition_ids,
        &LINK_ROOT_BASE_URL,
        &LINK_ROOT_VERSION,
    ];
    let count: i64 = client
        .query_one(LINK_COUNT_QUERY, &count_parameters)
        .await?
        .try_get(0)?;
    let count = usize::try_from(count).unwrap_or(usize::MAX);
    if count > request.limits.maximum_links {
        return Err(PostgresExtractionError::Capacity {
            resource: "links",
            actual: count,
            maximum: request.limits.maximum_links,
        });
    }
    let by_entity = entities
        .iter()
        .enumerate()
        .map(|(index, entity)| (entity.entity_id(), index))
        .collect::<HashMap<_, _>>();
    let mut links = try_vec("links", count)?;
    let mut ambiguous = 0_usize;
    let mut relation_types = HashSet::new();
    let mut link_entities = HashSet::new();
    link_entities
        .try_reserve(count)
        .map_err(|_error| PostgresExtractionError::Allocation {
            resource: "link identities",
            elements: count,
        })?;
    let maximum_relation_types =
        i64::try_from(request.limits.maximum_relation_types).map_err(|_error| {
            PostgresExtractionError::Capacity {
                resource: "relation types",
                actual: request.limits.maximum_relation_types,
                maximum: usize::try_from(i64::MAX).unwrap_or(usize::MAX),
            }
        })?;
    let maximum_type_bytes =
        i64::try_from(MAXIMUM_TOTAL_TYPE_BYTES).expect("fixed type-byte bound should fit i64");
    let query_parameters: [&(dyn ToSql + Sync); 7] = [
        &web_ids,
        &entity_uuids,
        &edition_ids,
        &LINK_ROOT_BASE_URL,
        &LINK_ROOT_VERSION,
        &maximum_relation_types,
        &maximum_type_bytes,
    ];
    let stream = client.query_raw(LINK_QUERY, query_parameters).await?;
    futures::pin_mut!(stream);
    while let Some(row) = stream.try_next().await? {
        let link = selected_entity(&row, 0)?;
        require_unique_link(&mut link_entities, link.entity_id)?;
        let left = selected_entity(&row, 3)?;
        let right = selected_entity(&row, 6)?;
        let link_row = *by_entity
            .get(&link.entity_id)
            .ok_or(PostgresExtractionError::MissingEndpoint)?;
        let left_row = *by_entity
            .get(&left.entity_id)
            .ok_or(PostgresExtractionError::MissingEndpoint)?;
        let right_row = *by_entity
            .get(&right.entity_id)
            .ok_or(PostgresExtractionError::MissingEndpoint)?;
        let candidate_count = usize::try_from(row.try_get::<_, i64>(12)?).unwrap_or(usize::MAX);
        if candidate_count > request.limits.maximum_relation_types {
            return Err(PostgresExtractionError::Capacity {
                resource: "relation types on one link",
                actual: candidate_count,
                maximum: request.limits.maximum_relation_types,
            });
        }
        let candidate_bytes = usize::try_from(row.try_get::<_, i64>(13)?).unwrap_or(usize::MAX);
        budget.consume_types("link types", candidate_count, candidate_bytes)?;
        let candidates = parse_types(row.try_get(14)?)?;
        let selected = candidates
            .first()
            .cloned()
            .ok_or(PostgresExtractionError::MissingLinkType)?;
        ambiguous += usize::from(candidates.len() > 1);
        let required_upper_bound = [link_row, left_row, right_row]
            .into_iter()
            .try_fold(0_usize, |count, row| {
                count.checked_add(entities[row].entity_types.len())
            })
            .unwrap_or(usize::MAX);
        let required_type_bytes = [link_row, left_row, right_row]
            .into_iter()
            .flat_map(|row| entities[row].entity_types.iter())
            .try_fold(0_usize, |bytes, entity_type| {
                bytes.checked_add(entity_type.to_string().len())
            })
            .unwrap_or(usize::MAX);
        budget.consume_types(
            "required entity types",
            required_upper_bound,
            required_type_bytes,
        )?;
        let required_entity_types = required_types([link_row, left_row, right_row], entities);
        if required_entity_types.len() > request.limits.maximum_required_types_per_link {
            return Err(PostgresExtractionError::Capacity {
                resource: "required entity types on one link",
                actual: required_entity_types.len(),
                maximum: request.limits.maximum_required_types_per_link,
            });
        }
        relation_types.insert(selected.clone());
        if relation_types.len() > request.limits.maximum_relation_types {
            return Err(PostgresExtractionError::Capacity {
                resource: "relation types",
                actual: relation_types.len(),
                maximum: request.limits.maximum_relation_types,
            });
        }
        links.push(ExtractedLink {
            link,
            left,
            right,
            relation_type: LinkTypeSelection {
                selected,
                candidates,
            },
            required_entity_types,
            confidence: RelationConfidence {
                link: probability(row.try_get(9)?)?,
                left: probability(row.try_get(10)?)?,
                right: probability(row.try_get(11)?)?,
            },
        });
    }
    require_exact_count("streamed links", links.len(), count)?;
    Ok((links.into_boxed_slice(), ambiguous))
}

fn require_unique_link(
    links: &mut HashSet<EntityId>,
    link: EntityId,
) -> Result<(), PostgresExtractionError> {
    if links.insert(link) {
        Ok(())
    } else {
        Err(PostgresExtractionError::AmbiguousLinkEndpoints)
    }
}

fn accumulate_capacity(
    resource: &'static str,
    total: &mut usize,
    amount: usize,
    maximum: usize,
) -> Result<(), PostgresExtractionError> {
    let actual = total.checked_add(amount).unwrap_or(usize::MAX);
    if actual > maximum {
        return Err(PostgresExtractionError::Capacity {
            resource,
            actual,
            maximum,
        });
    }
    *total = actual;
    Ok(())
}

const fn require_exact_count(
    resource: &'static str,
    actual: usize,
    expected: usize,
) -> Result<(), PostgresExtractionError> {
    if actual == expected {
        Ok(())
    } else {
        Err(PostgresExtractionError::Capacity {
            resource,
            actual,
            maximum: expected,
        })
    }
}

async fn ontology_hash(
    client: &(impl GenericClient + Sync),
    entities: &[ExtractedEntity],
    budget: &mut ExtractionBudget,
) -> Result<ContentHash, PostgresExtractionError> {
    let identifier_references = entities
        .iter()
        .try_fold(0_usize, |count, entity| {
            count.checked_add(entity.entity_types.len())
        })
        .unwrap_or(usize::MAX);
    let identifier_bytes = entities
        .iter()
        .flat_map(|entity| entity.entity_types.iter())
        .try_fold(0_usize, |bytes, entity_type| {
            bytes.checked_add(entity_type.to_string().len())
        })
        .unwrap_or(usize::MAX);
    budget.consume_types(
        "ontology type identifiers",
        identifier_references,
        identifier_bytes,
    )?;
    let mut identifiers = entities
        .iter()
        .flat_map(|entity| entity.entity_types.iter().map(ToString::to_string))
        .collect::<Vec<_>>();
    identifiers.sort_unstable();
    identifiers.dedup();
    let maximum_schema_bytes = i64::try_from(MAXIMUM_ONTOLOGY_SCHEMA_BYTES)
        .expect("fixed ontology-byte bound should fit i64");
    let stream = client
        .query_raw(
            "SELECT
                 ontology_ids.base_url || 'v/' || ontology_ids.version,
                 octet_length(entity_types.schema::text)::bigint,
                 octet_length(entity_types.closed_schema::text)::bigint,
                 CASE
                     WHEN octet_length(entity_types.schema::text)
                        + octet_length(entity_types.closed_schema::text) <= $2::bigint
                     THEN entity_types.schema::text
                 END,
                 CASE
                     WHEN octet_length(entity_types.schema::text)
                        + octet_length(entity_types.closed_schema::text) <= $2::bigint
                     THEN entity_types.closed_schema::text
                 END
             FROM ontology_ids
             JOIN entity_types USING (ontology_id)
             JOIN ontology_temporal_metadata USING (ontology_id)
             WHERE ontology_ids.base_url || 'v/' || ontology_ids.version = ANY($1::text[])
               AND ontology_temporal_metadata.transaction_time @> transaction_timestamp()
             ORDER BY ontology_ids.base_url, ontology_ids.version",
            [&identifiers as &(dyn ToSql + Sync), &maximum_schema_bytes],
        )
        .await?;
    futures::pin_mut!(stream);
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.ontology-extraction.v1");
    let mut row_count = 0_usize;
    let mut schema_bytes = 0_usize;
    while let Some(row) = stream.try_next().await? {
        row_count = row_count.saturating_add(1);
        let schema_length = usize::try_from(row.try_get::<_, i64>(1)?).unwrap_or(usize::MAX);
        let closed_length = usize::try_from(row.try_get::<_, i64>(2)?).unwrap_or(usize::MAX);
        accumulate_capacity(
            "ontology schema bytes",
            &mut schema_bytes,
            schema_length.saturating_add(closed_length),
            MAXIMUM_ONTOLOGY_SCHEMA_BYTES,
        )?;
        hash_text(&mut hasher, &row.try_get::<_, String>(0)?);
        hash_text(&mut hasher, &row.try_get::<_, String>(3)?);
        hash_text(&mut hasher, &row.try_get::<_, String>(4)?);
    }
    require_exact_count("current entity-type records", row_count, identifiers.len())?;
    Ok(hasher.finish())
}

#[cfg(test)]
#[path = "query/tests.rs"]
mod tests;
