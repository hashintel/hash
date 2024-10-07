use graph_types::{
    knowledge::{
        entity::{Entity, EntityId, EntityMetadata, EntityProvenance, EntityRecordId, EntityUuid},
        link::LinkData,
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    entity::EntityQueryPath,
    subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind},
};
use tokio_postgres::Row;
use tracing::instrument;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};
use uuid::Uuid;

use crate::store::postgres::{
    crud::QueryRecordDecode,
    query::{Distinctness, PostgresRecord, SelectCompiler, Table},
};

pub struct EntityRecordRowIndices {
    pub owned_by_id: usize,
    pub entity_uuid: usize,
    pub draft_id: usize,
    pub transaction_time: usize,
    pub decision_time: usize,

    pub edition_id: usize,
    pub type_base_urls_id: usize,
    pub type_versions_id: usize,

    pub properties: usize,

    pub left_entity_uuid: usize,
    pub left_entity_owned_by_id: usize,
    pub right_entity_uuid: usize,
    pub right_entity_owned_by_id: usize,

    pub provenance: usize,
    pub edition_provenance: usize,
    pub property_metadata: usize,

    pub entity_confidence: usize,
    pub left_entity_confidence: usize,
    pub right_entity_confidence: usize,
    pub left_entity_provenance: usize,
    pub right_entity_provenance: usize,

    pub archived: usize,
}

pub struct EntityRecordPaths<'q> {
    pub left_entity_uuid: EntityQueryPath<'q>,
    pub left_owned_by_id: EntityQueryPath<'q>,
    pub right_entity_uuid: EntityQueryPath<'q>,
    pub right_owned_by_id: EntityQueryPath<'q>,
}

impl Default for EntityRecordPaths<'_> {
    fn default() -> Self {
        Self {
            left_entity_uuid: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::Uuid),
                direction: EdgeDirection::Outgoing,
            },
            left_owned_by_id: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::OwnedById),
                direction: EdgeDirection::Outgoing,
            },
            right_entity_uuid: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::Uuid),
                direction: EdgeDirection::Outgoing,
            },
            right_owned_by_id: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::OwnedById),
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
            let left_owned_by_id: Option<Uuid> = row.get(indices.left_entity_owned_by_id);
            let left_entity_uuid: Option<Uuid> = row.get(indices.left_entity_uuid);
            let right_owned_by_id: Option<Uuid> = row.get(indices.right_entity_owned_by_id);
            let right_entity_uuid: Option<Uuid> = row.get(indices.right_entity_uuid);
            match (
                left_owned_by_id,
                left_entity_uuid,
                right_owned_by_id,
                right_entity_uuid,
            ) {
                (
                    Some(left_owned_by_id),
                    Some(left_entity_uuid),
                    Some(right_owned_by_id),
                    Some(right_entity_uuid),
                ) => Some(LinkData {
                    left_entity_id: EntityId {
                        owned_by_id: OwnedById::new(left_owned_by_id),
                        entity_uuid: EntityUuid::new(left_entity_uuid),
                        draft_id: None,
                    },
                    right_entity_id: EntityId {
                        owned_by_id: OwnedById::new(right_owned_by_id),
                        entity_uuid: EntityUuid::new(right_entity_uuid),
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
            owned_by_id: row.get(indices.owned_by_id),
            entity_uuid: row.get(indices.entity_uuid),
            draft_id: row.get(indices.draft_id),
        };

        if let Ok(distance) = row.try_get::<_, f64>("distance") {
            tracing::trace!(%entity_id, %distance, "Entity embedding was calculated");
        }

        let property_metadata = row
            .get::<_, Option<_>>(indices.property_metadata)
            .unwrap_or_default();

        Self {
            properties: row.get(indices.properties),
            link_data,
            metadata: EntityMetadata {
                record_id: EntityRecordId {
                    entity_id,
                    edition_id: row.get(indices.edition_id),
                },
                temporal_versioning: graph_types::knowledge::entity::EntityTemporalMetadata {
                    decision_time: row.get(indices.decision_time),
                    transaction_time: row.get(indices.transaction_time),
                },
                entity_type_ids: row
                    .get::<_, Vec<BaseUrl>>(indices.type_base_urls_id)
                    .into_iter()
                    .zip(row.get::<_, Vec<OntologyTypeVersion>>(indices.type_versions_id))
                    .map(|(base_url, version)| VersionedUrl { base_url, version })
                    .collect(),
                provenance: EntityProvenance {
                    inferred: row.get(indices.provenance),
                    edition: row.get(indices.edition_provenance),
                },
                confidence: row.get(indices.entity_confidence),
                properties: property_metadata,
                archived: row.get(indices.archived),
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
            owned_by_id: compiler.add_distinct_selection_with_ordering(
                &EntityQueryPath::OwnedById,
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
            type_base_urls_id: compiler.add_selection_path(&EntityQueryPath::TypeBaseUrls),
            type_versions_id: compiler.add_selection_path(&EntityQueryPath::TypeVersions),

            properties: compiler.add_selection_path(&EntityQueryPath::Properties(None)),

            left_entity_uuid: compiler.add_selection_path(&paths.left_entity_uuid),
            left_entity_owned_by_id: compiler.add_selection_path(&paths.left_owned_by_id),
            right_entity_uuid: compiler.add_selection_path(&paths.right_entity_uuid),
            right_entity_owned_by_id: compiler.add_selection_path(&paths.right_owned_by_id),

            provenance: compiler.add_selection_path(&EntityQueryPath::Provenance(None)),
            edition_provenance: compiler
                .add_selection_path(&EntityQueryPath::EditionProvenance(None)),
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
        }
    }
}
