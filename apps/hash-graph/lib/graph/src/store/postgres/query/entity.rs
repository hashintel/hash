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
            Self::Type(path) => once(Relation::Reference(ReferenceTable::EntityIsOfType))
                .chain(path.relations())
                .collect(),
            Self::LeftEntity(path)
                if **path == EntityQueryPath::Uuid || **path == EntityQueryPath::OwnedById =>
            {
                vec![Relation::LeftEntity]
            }
            Self::RightEntity(path)
                if **path == EntityQueryPath::Uuid || **path == EntityQueryPath::OwnedById =>
            {
                vec![Relation::RightEntity]
            }
            Self::LeftEntity(path) => {
                once(Relation::Reference(ReferenceTable::EntityHasLeftEntity))
                    .chain(path.relations())
                    .collect()
            }
            Self::RightEntity(path) => {
                once(Relation::Reference(ReferenceTable::EntityHasRightEntity))
                    .chain(path.relations())
                    .collect()
            }
            Self::IncomingLinks(path) => once(Relation::ReversedReference(
                ReferenceTable::EntityHasRightEntity,
            ))
            .chain(path.relations())
            .collect(),
            Self::OutgoingLinks(path) => once(Relation::ReversedReference(
                ReferenceTable::EntityHasLeftEntity,
            ))
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
            Self::Type(path) => path.terminating_column(),
            Self::OwnedById => Column::EntityTemporalMetadata(EntityTemporalMetadata::OwnedById),
            Self::UpdatedById => Column::EntityEditions(EntityEditions::UpdatedById),
            Self::LeftEntity(path) if **path == EntityQueryPath::Uuid => {
                Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityUuid)
            }
            Self::LeftEntity(path) if **path == EntityQueryPath::OwnedById => {
                Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityOwnedById)
            }
            Self::RightEntity(path) if **path == EntityQueryPath::Uuid => {
                Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityUuid)
            }
            Self::RightEntity(path) if **path == EntityQueryPath::OwnedById => {
                Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityOwnedById)
            }
            Self::LeftEntity(path)
            | Self::RightEntity(path)
            | Self::IncomingLinks(path)
            | Self::OutgoingLinks(path) => path.terminating_column(),
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
