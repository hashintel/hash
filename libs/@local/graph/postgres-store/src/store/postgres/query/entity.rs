use core::iter::once;

use hash_graph_store::{
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind, SharedEdgeKind},
};

use crate::store::postgres::query::{
    PostgresQueryPath,
    table::{
        Column, EntityEditions, EntityEmbeddings, EntityHasLeftEntity, EntityHasRightEntity,
        EntityIds, EntityIsOfTypeIds, EntityTemporalMetadata, JsonField, ReferenceTable, Relation,
    },
};

impl PostgresQueryPath for EntityQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::Uuid
            | Self::OwnedById
            | Self::EditionId
            | Self::DecisionTime
            | Self::TransactionTime
            | Self::DraftId => vec![],
            Self::Provenance(_) => {
                vec![Relation::EntityIds]
            }
            Self::Embedding => vec![Relation::EntityEmbeddings],
            Self::LeftEntityConfidence | Self::LeftEntityProvenance => vec![Relation::LeftEntity],
            Self::RightEntityConfidence | Self::RightEntityProvenance => {
                vec![Relation::RightEntity]
            }
            Self::Properties(_)
            | Self::Label { .. }
            | Self::EditionProvenance(_)
            | Self::Archived
            | Self::EntityConfidence
            | Self::PropertyMetadata(_) => {
                vec![Relation::EntityEditions]
            }
            Self::TypeBaseUrls | Self::TypeVersions => vec![Relation::EntityIsOfTypes],
            Self::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
                inheritance_depth,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityIsOfType {
                    inheritance_depth: *inheritance_depth,
                },
                direction: EdgeDirection::Outgoing,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                direction: EdgeDirection::Outgoing,
            } if **path == EntityQueryPath::Uuid || **path == EntityQueryPath::OwnedById => {
                vec![Relation::LeftEntity]
            }
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                direction,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityHasLeftEntity,
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                direction: EdgeDirection::Outgoing,
            } if **path == EntityQueryPath::Uuid || **path == EntityQueryPath::OwnedById => {
                vec![Relation::RightEntity]
            }
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                direction,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityHasRightEntity,
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
        }
    }

    #[expect(clippy::too_many_lines)]
    fn terminating_column(&self) -> (Column, Option<JsonField<'_>>) {
        match self {
            Self::OwnedById => (
                Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                None,
            ),
            Self::Uuid => (
                Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                None,
            ),
            Self::DraftId => (
                Column::EntityTemporalMetadata(EntityTemporalMetadata::DraftId),
                None,
            ),
            Self::EditionId => (
                Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                None,
            ),
            Self::DecisionTime => (
                Column::EntityTemporalMetadata(EntityTemporalMetadata::DecisionTime),
                None,
            ),
            Self::TransactionTime => (
                Column::EntityTemporalMetadata(EntityTemporalMetadata::TransactionTime),
                None,
            ),
            Self::Archived => (Column::EntityEditions(EntityEditions::Archived), None),
            Self::Embedding => (Column::EntityEmbeddings(EntityEmbeddings::Embedding), None),
            Self::TypeBaseUrls => (Column::EntityIsOfTypeIds(EntityIsOfTypeIds::BaseUrls), None),
            Self::TypeVersions => (Column::EntityIsOfTypeIds(EntityIsOfTypeIds::Versions), None),
            Self::EntityTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                direction: EdgeDirection::Outgoing,
            } if **path == EntityQueryPath::Uuid => (
                Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityUuid),
                None,
            ),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                direction: EdgeDirection::Outgoing,
            } if **path == EntityQueryPath::OwnedById => (
                Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityWebId),
                None,
            ),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                direction: EdgeDirection::Outgoing,
            } if **path == EntityQueryPath::Uuid => (
                Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityUuid),
                None,
            ),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                direction: EdgeDirection::Outgoing,
            } if **path == EntityQueryPath::OwnedById => (
                Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityWebId),
                None,
            ),
            Self::EntityEdge { path, .. } => path.terminating_column(),
            Self::Properties(path) => (
                Column::EntityEditions(EntityEditions::Properties),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::Label { inheritance_depth } => (
                Column::EntityEditions(EntityEditions::Properties),
                Some(JsonField::Label {
                    inheritance_depth: *inheritance_depth,
                }),
            ),
            Self::Provenance(path) => (
                Column::EntityIds(EntityIds::Provenance),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::EditionProvenance(path) => (
                Column::EntityEditions(EntityEditions::Provenance),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::PropertyMetadata(path) => (
                Column::EntityEditions(EntityEditions::PropertyMetadata),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::EntityConfidence => (Column::EntityEditions(EntityEditions::Confidence), None),
            Self::LeftEntityConfidence => (
                Column::EntityHasLeftEntity(EntityHasLeftEntity::Confidence),
                None,
            ),
            Self::LeftEntityProvenance => (
                Column::EntityHasLeftEntity(EntityHasLeftEntity::Provenance),
                None,
            ),
            Self::RightEntityConfidence => (
                Column::EntityHasRightEntity(EntityHasRightEntity::Confidence),
                None,
            ),
            Self::RightEntityProvenance => (
                Column::EntityHasRightEntity(EntityHasRightEntity::Provenance),
                None,
            ),
        }
    }

    fn label_property_path(inheritance_depth: Option<u32>) -> Option<Self> {
        Some(Self::EntityTypeEdge {
            edge_kind: SharedEdgeKind::IsOfType,
            path: EntityTypeQueryPath::LabelProperty,
            inheritance_depth,
        })
    }
}
