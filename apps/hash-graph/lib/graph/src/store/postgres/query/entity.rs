use std::iter::once;

use crate::{
    knowledge::{Entity, EntityQueryPath},
    store::postgres::query::{
        table::{Column, Entities, JsonField, Relation},
        PostgresQueryPath, PostgresRecord, Table,
    },
};

impl PostgresRecord for Entity {
    fn base_table() -> Table {
        Table::Entities
    }
}

impl PostgresQueryPath for EntityQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::LeftEntity(path) | Self::RightEntity(path)
                if **path == EntityQueryPath::Uuid || **path == EntityQueryPath::OwnedById =>
            {
                vec![]
            }
            Self::Type(path) => once(Relation::EntityType).chain(path.relations()).collect(),
            Self::LeftEntity(path) => once(Relation::LeftEndpoint)
                .chain(path.relations())
                .collect(),
            Self::RightEntity(path) => once(Relation::RightEndpoint)
                .chain(path.relations())
                .collect(),
            Self::OutgoingLinks(path) => once(Relation::OutgoingLink)
                .chain(path.relations())
                .collect(),
            Self::IncomingLinks(path) => once(Relation::IncomingLink)
                .chain(path.relations())
                .collect(),
            _ => vec![],
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::Uuid => Column::Entities(Entities::EntityUuid),
            Self::RecordId => Column::Entities(Entities::RecordId),
            Self::DecisionTime => Column::Entities(Entities::DecisionTime),
            Self::TransactionTime => Column::Entities(Entities::TransactionTime),
            Self::Archived => Column::Entities(Entities::Archived),
            Self::Type(path) => path.terminating_column(),
            Self::OwnedById => Column::Entities(Entities::OwnedById),
            Self::UpdatedById => Column::Entities(Entities::UpdatedById),
            Self::LeftEntity(path) if **path == EntityQueryPath::Uuid => {
                Column::Entities(Entities::LeftEntityUuid)
            }
            Self::LeftEntity(path) if **path == EntityQueryPath::OwnedById => {
                Column::Entities(Entities::LeftEntityOwnedById)
            }
            Self::RightEntity(path) if **path == EntityQueryPath::Uuid => {
                Column::Entities(Entities::RightEntityUuid)
            }
            Self::RightEntity(path) if **path == EntityQueryPath::OwnedById => {
                Column::Entities(Entities::RightEntityOwnedById)
            }
            Self::LeftEntity(path)
            | Self::RightEntity(path)
            | Self::IncomingLinks(path)
            | Self::OutgoingLinks(path) => path.terminating_column(),
            Self::LeftToRightOrder => Column::Entities(Entities::LeftToRightOrder),
            Self::RightToLeftOrder => Column::Entities(Entities::RightToLeftOrder),
            Self::Properties(path) => path
                .as_ref()
                .map_or(Column::Entities(Entities::Properties(None)), |path| {
                    Column::Entities(Entities::Properties(Some(JsonField::Json(path))))
                }),
        }
    }
}
