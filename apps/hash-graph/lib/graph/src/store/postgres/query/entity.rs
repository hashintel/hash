use std::iter::once;

use crate::{
    knowledge::{Entity, EntityQueryPath},
    store::postgres::query::{
        table::{
            Column, EntityEditions, EntityHasLeftEntity, EntityHasRightEntity,
            EntityTemporalMetadata, JsonField, ReferenceTable, Relation,
        },
        PostgresQueryPath, PostgresRecord, Table,
    },
    subgraph::edges::{KnowledgeGraphEdgeKind, SharedEdgeKind},
};

impl PostgresRecord for Entity {
    fn base_table() -> Table {
        Table::EntityTemporalMetadata
    }
}

impl PostgresQueryPath for EntityQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::Uuid
            | Self::OwnedById
            | Self::EditionId
            | Self::DecisionTime
            | Self::TransactionTime => vec![],
            Self::Properties(_)
            | Self::LeftToRightOrder
            | Self::RightToLeftOrder
            | Self::UpdatedById
            | Self::Archived => vec![Relation::EntityEditions],
            Self::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityIsOfType,
                reversed: false,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                reversed: false,
            } if **path == EntityQueryPath::Uuid || **path == EntityQueryPath::OwnedById => {
                vec![Relation::LeftEntity]
            }
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                reversed,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityHasLeftEntity,
                reversed: *reversed,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                reversed: false,
            } if **path == EntityQueryPath::Uuid || **path == EntityQueryPath::OwnedById => {
                vec![Relation::RightEntity]
            }
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                reversed,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityHasRightEntity,
                reversed: *reversed,
            })
            .chain(path.relations())
            .collect(),
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::Uuid => Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
            Self::EditionId => Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
            Self::DecisionTime => {
                Column::EntityTemporalMetadata(EntityTemporalMetadata::DecisionTime)
            }
            Self::TransactionTime => {
                Column::EntityTemporalMetadata(EntityTemporalMetadata::TransactionTime)
            }
            Self::Archived => Column::EntityEditions(EntityEditions::Archived),
            Self::OwnedById => Column::EntityTemporalMetadata(EntityTemporalMetadata::OwnedById),
            Self::UpdatedById => Column::EntityEditions(EntityEditions::UpdatedById),
            Self::EntityTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                reversed: false,
            } if **path == EntityQueryPath::Uuid => {
                Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityUuid)
            }
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                reversed: false,
            } if **path == EntityQueryPath::OwnedById => {
                Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityOwnedById)
            }
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                reversed: false,
            } if **path == EntityQueryPath::Uuid => {
                Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityUuid)
            }
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                reversed: false,
            } if **path == EntityQueryPath::OwnedById => {
                Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityOwnedById)
            }
            Self::EntityEdge { path, .. } => path.terminating_column(),
            Self::LeftToRightOrder => Column::EntityEditions(EntityEditions::LeftToRightOrder),
            Self::RightToLeftOrder => Column::EntityEditions(EntityEditions::RightToLeftOrder),
            Self::Properties(path) => path.as_ref().map_or(
                Column::EntityEditions(EntityEditions::Properties(None)),
                |path| {
                    Column::EntityEditions(EntityEditions::Properties(Some(JsonField::JsonPath(
                        path,
                    ))))
                },
            ),
        }
    }
}
