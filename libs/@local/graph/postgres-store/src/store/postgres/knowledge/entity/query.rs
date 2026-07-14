use hash_graph_store::{
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind, SharedEdgeKind},
};
use serde::Deserialize as _;
use tokio_postgres::Row;
use tracing::instrument;
use type_system::{
    knowledge::{
        entity::{
            Entity, EntityMetadata, LinkData,
            id::{EntityId, EntityRecordId},
            metadata::EntityTemporalMetadata,
        },
        property::metadata::PropertyObjectMetadata,
    },
    ontology::id::VersionedUrl,
};

use crate::store::postgres::{
    crud::QueryRecordDecode,
    knowledge::entity::provenance::{SqlEntityEditionProvenance, SqlEntityProvenance},
    query::{Distinctness, PostgresRecord, SelectCompiler, Table},
};

pub struct EntityRecordRowIndices {
    pub web_id: usize,
    pub entity_uuid: usize,
    pub draft_id: usize,
    pub transaction_time: usize,
    pub decision_time: usize,

    pub edition_id: usize,
    pub type_versioned_urls_id: usize,
    pub direct_type_count_id: usize,

    pub properties: usize,

    pub left_entity_uuid: usize,
    pub left_entity_web_id: usize,
    pub right_entity_uuid: usize,
    pub right_entity_web_id: usize,

    pub provenance: usize,
    pub created_by_id: usize,
    pub created_at_transaction_time: usize,
    pub created_at_decision_time: usize,
    pub edition_provenance: usize,
    pub edition_created_by_id: usize,
    pub property_metadata: usize,

    pub entity_confidence: usize,
    pub left_entity_confidence: usize,
    pub right_entity_confidence: usize,
    pub left_entity_provenance: usize,
    pub right_entity_provenance: usize,

    pub archived: usize,
    pub read_only: usize,
}

pub struct EntityRecordPaths<'q> {
    pub left_entity_uuid: EntityQueryPath<'q>,
    pub left_web_id: EntityQueryPath<'q>,
    pub right_entity_uuid: EntityQueryPath<'q>,
    pub right_web_id: EntityQueryPath<'q>,
}

impl Default for EntityRecordPaths<'_> {
    fn default() -> Self {
        Self {
            left_entity_uuid: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::Uuid),
                direction: EdgeDirection::Outgoing,
            },
            left_web_id: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::WebId),
                direction: EdgeDirection::Outgoing,
            },
            right_entity_uuid: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::Uuid),
                direction: EdgeDirection::Outgoing,
            },
            right_web_id: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::WebId),
                direction: EdgeDirection::Outgoing,
            },
        }
    }
}

impl QueryRecordDecode for Entity {
    type Indices = EntityRecordRowIndices;
    type Output = Self;

    fn decode(row: &Row, indices: &Self::Indices) -> Self {
        let link_data = {
            let left_web_id = row.get(indices.left_entity_web_id);
            let left_entity_uuid = row.get(indices.left_entity_uuid);
            let right_web_id = row.get(indices.right_entity_web_id);
            let right_entity_uuid = row.get(indices.right_entity_uuid);
            match (
                left_web_id,
                left_entity_uuid,
                right_web_id,
                right_entity_uuid,
            ) {
                (
                    Some(left_web_id),
                    Some(left_entity_uuid),
                    Some(right_web_id),
                    Some(right_entity_uuid),
                ) => Some(LinkData {
                    left_entity_id: EntityId {
                        web_id: left_web_id,
                        entity_uuid: left_entity_uuid,
                        draft_id: None,
                    },
                    right_entity_id: EntityId {
                        web_id: right_web_id,
                        entity_uuid: right_entity_uuid,
                        draft_id: None,
                    },
                    left_entity_confidence: row.get(indices.left_entity_confidence),
                    right_entity_confidence: row.get(indices.right_entity_confidence),
                    left_entity_provenance: row.get(indices.left_entity_provenance),
                    right_entity_provenance: row.get(indices.right_entity_provenance),
                }),
                (None, None, None, None) => None,
                _ => unreachable!(
                    "It's not possible to have a link entity with the left entityId or right \
                     entityId unspecified"
                ),
            }
        };

        let entity_id = EntityId {
            web_id: row.get(indices.web_id),
            entity_uuid: row.get(indices.entity_uuid),
            draft_id: row.get(indices.draft_id),
        };

        if let Ok(distance) = row.try_get::<_, f64>("distance") {
            tracing::trace!(%entity_id, %distance, "Entity embedding was calculated");
        }

        let property_metadata = row
            .get::<_, Option<serde_json::Value>>(indices.property_metadata)
            .map(|value| {
                PropertyObjectMetadata::deserialize(value)
                    .expect("Failed to deserialize property metadata")
            })
            .unwrap_or_default();

        Self {
            properties: row.get(indices.properties),
            link_data,
            metadata: EntityMetadata {
                record_id: EntityRecordId {
                    entity_id,
                    edition_id: row.get(indices.edition_id),
                },
                temporal_versioning: EntityTemporalMetadata {
                    decision_time: row.get(indices.decision_time),
                    transaction_time: row.get(indices.transaction_time),
                },
                entity_type_ids: {
                    let direct_type_count =
                        usize::try_from(row.get::<_, i32>(indices.direct_type_count_id))
                            .expect("direct type count should be non-negative");
                    row.get::<_, Vec<VersionedUrl>>(indices.type_versioned_urls_id)
                        .into_iter()
                        .take(direct_type_count)
                        .collect()
                },
                provenance: SqlEntityProvenance {
                    created_by_id: row.get(indices.created_by_id),
                    created_at_transaction_time: row.get(indices.created_at_transaction_time),
                    created_at_decision_time: row.get(indices.created_at_decision_time),
                    json: row.get(indices.provenance),
                    edition: SqlEntityEditionProvenance {
                        created_by_id: row.get(indices.edition_created_by_id),
                        json: row.get(indices.edition_provenance),
                    },
                }
                .into(),
                confidence: row.get(indices.entity_confidence),
                properties: property_metadata,
                archived: row.get(indices.archived),
                read_only: row.get(indices.read_only),
            },
        }
    }
}

impl PostgresRecord for Entity {
    type CompilationParameters = EntityRecordPaths<'static>;

    fn base_table() -> Table {
        Table::EntityTemporalMetadata
    }

    fn parameters() -> Self::CompilationParameters {
        EntityRecordPaths::default()
    }

    #[instrument(level = "info", skip(compiler, paths))]
    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        paths: &'p Self::CompilationParameters,
    ) -> Self::Indices {
        EntityRecordRowIndices {
            web_id: compiler.add_distinct_selection_with_ordering(
                &EntityQueryPath::WebId,
                Distinctness::Distinct,
                None,
            ),
            entity_uuid: compiler.add_distinct_selection_with_ordering(
                &EntityQueryPath::Uuid,
                Distinctness::Distinct,
                None,
            ),
            draft_id: compiler.add_distinct_selection_with_ordering(
                &EntityQueryPath::DraftId,
                Distinctness::Distinct,
                None,
            ),
            transaction_time: compiler.add_distinct_selection_with_ordering(
                &EntityQueryPath::TransactionTime,
                Distinctness::Distinct,
                None,
            ),
            decision_time: compiler.add_distinct_selection_with_ordering(
                &EntityQueryPath::DecisionTime,
                Distinctness::Distinct,
                None,
            ),

            edition_id: compiler.add_selection_path(&EntityQueryPath::EditionId),
            type_versioned_urls_id: compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::VersionedUrl,
                inheritance_depth: None,
            }),
            direct_type_count_id: compiler.add_selection_path(&EntityQueryPath::DirectTypeCount),

            properties: compiler.add_selection_path(&EntityQueryPath::Properties(None)),

            left_entity_uuid: compiler.add_selection_path(&paths.left_entity_uuid),
            left_entity_web_id: compiler.add_selection_path(&paths.left_web_id),
            right_entity_uuid: compiler.add_selection_path(&paths.right_entity_uuid),
            right_entity_web_id: compiler.add_selection_path(&paths.right_web_id),

            provenance: compiler.add_selection_path(&EntityQueryPath::Provenance(None)),
            created_by_id: compiler.add_selection_path(&EntityQueryPath::CreatedById),
            created_at_transaction_time: compiler
                .add_selection_path(&EntityQueryPath::CreatedAtTransactionTime),
            created_at_decision_time: compiler
                .add_selection_path(&EntityQueryPath::CreatedAtDecisionTime),
            edition_provenance: compiler
                .add_selection_path(&EntityQueryPath::EditionProvenance(None)),
            edition_created_by_id: compiler
                .add_selection_path(&EntityQueryPath::EditionCreatedById),
            property_metadata: compiler
                .add_selection_path(&EntityQueryPath::PropertyMetadata(None)),

            entity_confidence: compiler.add_selection_path(&EntityQueryPath::EntityConfidence),
            left_entity_confidence: compiler
                .add_selection_path(&EntityQueryPath::LeftEntityConfidence),
            left_entity_provenance: compiler
                .add_selection_path(&EntityQueryPath::LeftEntityProvenance),
            right_entity_confidence: compiler
                .add_selection_path(&EntityQueryPath::RightEntityConfidence),
            right_entity_provenance: compiler
                .add_selection_path(&EntityQueryPath::RightEntityProvenance),

            archived: compiler.add_selection_path(&EntityQueryPath::Archived),
            read_only: compiler.add_selection_path(&EntityQueryPath::ReadOnly),
        }
    }
}
