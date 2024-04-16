use std::convert::identity;

use graph_types::{
    knowledge::{
        entity::{
            Entity, EntityId, EntityMetadata, EntityProvenanceMetadata, EntityRecordId, EntityUuid,
            InferredEntityProvenanceMetadata,
        },
        link::LinkData,
        Confidence, PropertyPath,
    },
    owned_by_id::OwnedById,
};
use temporal_versioning::{
    ClosedTemporalBound, LeftClosedTemporalInterval, TemporalTagged, TimeAxis,
};
use tokio_postgres::Row;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};
use uuid::Uuid;

use crate::{
    knowledge::EntityQueryPath,
    store::{
        crud::{Sorting, VertexIdSorting},
        postgres::{
            crud::QueryRecordDecode,
            query::{
                Distinctness, Expression, Function, PostgresRecord, PostgresSorting,
                SelectCompiler, Table,
            },
        },
        query::Parameter,
        NullOrdering, Ordering,
    },
    subgraph::{
        edges::{EdgeDirection, KnowledgeGraphEdgeKind},
        identifier::EntityVertexId,
        temporal_axes::{QueryTemporalAxes, VariableAxis},
    },
};

#[derive(Debug, Copy, Clone)]
pub struct EntityVertexIdIndices {
    pub revision_id: usize,
    pub entity_uuid: usize,
    pub draft_id: usize,
    pub owned_by_id: usize,
}

pub struct EntityVertexIdCursorParameters<'p> {
    revision_id: Parameter<'p>,
    entity_uuid: Parameter<'p>,
    draft_id: Option<Parameter<'p>>,
    owned_by_id: Parameter<'p>,
}

impl QueryRecordDecode for VertexIdSorting<Entity> {
    type CompilationArtifacts = EntityVertexIdIndices;
    type Output = EntityVertexId;

    fn decode(row: &Row, indices: &Self::CompilationArtifacts) -> Self::Output {
        let ClosedTemporalBound::Inclusive(revision_id) = *row
            .get::<_, LeftClosedTemporalInterval<VariableAxis>>(indices.revision_id)
            .start();
        EntityVertexId {
            base_id: EntityId {
                owned_by_id: row.get(indices.owned_by_id),
                entity_uuid: row.get(indices.entity_uuid),
                draft_id: row.get(indices.draft_id),
            },
            revision_id,
        }
    }
}

impl<'s> PostgresSorting<'s, Entity> for VertexIdSorting<Entity> {
    type CompilationParameters = EntityVertexIdCursorParameters<'static>;
    type Error = !;

    fn encode(&self) -> Result<Option<Self::CompilationParameters>, Self::Error> {
        Ok(self.cursor().map(|cursor| EntityVertexIdCursorParameters {
            owned_by_id: Parameter::Uuid(cursor.base_id.owned_by_id.into_uuid()),
            entity_uuid: Parameter::Uuid(cursor.base_id.entity_uuid.into_uuid()),
            draft_id: cursor
                .base_id
                .draft_id
                .map(|draft_id| Parameter::Uuid(draft_id.into_uuid())),
            revision_id: Parameter::Timestamp(cursor.revision_id.cast()),
        }))
    }

    fn compile<'p, 'q: 'p>(
        &self,
        compiler: &mut SelectCompiler<'p, 'q, Entity>,
        parameters: Option<&'p Self::CompilationParameters>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Self::CompilationArtifacts {
        let revision_id_path = match temporal_axes.variable_time_axis() {
            TimeAxis::TransactionTime => &EntityQueryPath::TransactionTime,
            TimeAxis::DecisionTime => &EntityQueryPath::DecisionTime,
        };

        if let Some(parameters) = parameters {
            // We already had a cursor, add them as parameters:
            let revision_id_expression = compiler.compile_parameter(&parameters.revision_id).0;
            let entity_uuid_expression = compiler.compile_parameter(&parameters.entity_uuid).0;
            let draft_id_expression = parameters
                .draft_id
                .as_ref()
                .map(|draft_id| compiler.compile_parameter(draft_id).0);
            let owned_by_id_expression = compiler.compile_parameter(&parameters.owned_by_id).0;

            EntityVertexIdIndices {
                revision_id: compiler.add_cursor_selection(
                    revision_id_path,
                    |column| Expression::Function(Function::Lower(Box::new(column))),
                    Some(revision_id_expression),
                    Ordering::Descending,
                    None,
                ),
                entity_uuid: compiler.add_cursor_selection(
                    &EntityQueryPath::Uuid,
                    identity,
                    Some(entity_uuid_expression),
                    Ordering::Ascending,
                    None,
                ),
                draft_id: compiler.add_cursor_selection(
                    &EntityQueryPath::DraftId,
                    identity,
                    draft_id_expression,
                    Ordering::Ascending,
                    Some(NullOrdering::First),
                ),
                owned_by_id: compiler.add_cursor_selection(
                    &EntityQueryPath::OwnedById,
                    identity,
                    Some(owned_by_id_expression),
                    Ordering::Ascending,
                    None,
                ),
            }
        } else {
            EntityVertexIdIndices {
                revision_id: compiler.add_distinct_selection_with_ordering(
                    revision_id_path,
                    Distinctness::Distinct,
                    Some((Ordering::Descending, None)),
                ),
                entity_uuid: compiler.add_distinct_selection_with_ordering(
                    &EntityQueryPath::Uuid,
                    Distinctness::Distinct,
                    Some((Ordering::Ascending, None)),
                ),
                draft_id: compiler.add_distinct_selection_with_ordering(
                    &EntityQueryPath::DraftId,
                    Distinctness::Distinct,
                    Some((Ordering::Ascending, Some(NullOrdering::First))),
                ),
                owned_by_id: compiler.add_distinct_selection_with_ordering(
                    &EntityQueryPath::OwnedById,
                    Distinctness::Distinct,
                    Some((Ordering::Ascending, None)),
                ),
            }
        }
    }
}

#[derive(Debug, Copy, Clone)]
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

    pub entity_confidence: usize,
    pub left_entity_confidence: usize,
    pub right_entity_confidence: usize,
    pub property_paths: usize,
    pub property_confidences: usize,

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
    type CompilationArtifacts = EntityRecordRowIndices;
    type Output = Self;

    fn decode(row: &Row, indices: &Self::CompilationArtifacts) -> Self {
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

        let inferred_provenance_data =
            row.get::<_, InferredEntityProvenanceMetadata>(indices.provenance);
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
                provenance: EntityProvenanceMetadata {
                    created_by_id: inferred_provenance_data.created_by_id,
                    created_at_transaction_time: inferred_provenance_data
                        .created_at_transaction_time,
                    created_at_decision_time: inferred_provenance_data.created_at_decision_time,
                    first_non_draft_created_at_transaction_time: inferred_provenance_data
                        .first_non_draft_created_at_transaction_time,
                    first_non_draft_created_at_decision_time: inferred_provenance_data
                        .first_non_draft_created_at_decision_time,
                    edition: row.get(indices.edition_provenance),
                },
                confidence: row.get(indices.entity_confidence),
                property_confidence: row
                    .get::<_, Option<Vec<PropertyPath<'_>>>>(indices.property_paths)
                    .unwrap_or_default()
                    .into_iter()
                    .zip(
                        row.get::<_, Option<Vec<Option<Confidence>>>>(indices.property_confidences)
                            .unwrap_or_default(),
                    )
                    .filter_map(|(path, confidence)| {
                        confidence.map(|confidence| (path.into_owned(), confidence))
                    })
                    .collect(),
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

    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        paths: &'p Self::CompilationParameters,
    ) -> Self::CompilationArtifacts {
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

            entity_confidence: compiler.add_selection_path(&EntityQueryPath::EntityConfidence),
            left_entity_confidence: compiler
                .add_selection_path(&EntityQueryPath::LeftEntityConfidence),
            right_entity_confidence: compiler
                .add_selection_path(&EntityQueryPath::RightEntityConfidence),
            property_paths: compiler.add_selection_path(&EntityQueryPath::PropertyPaths),
            property_confidences: compiler
                .add_selection_path(&EntityQueryPath::PropertyConfidences),

            archived: compiler.add_selection_path(&EntityQueryPath::Archived),
        }
    }
}
