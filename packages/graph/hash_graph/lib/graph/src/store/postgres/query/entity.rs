use std::iter::once;

use postgres_types::ToSql;

use crate::{
    knowledge::{Entity, EntityQueryPath},
    ontology::EntityTypeQueryPath,
    store::postgres::query::{
        expression::EdgeJoinDirection, ColumnAccess, Path, PostgresQueryRecord, Table, TableName,
    },
};

impl<'q> PostgresQueryRecord<'q> for Entity {
    fn base_table() -> Table {
        Table {
            name: TableName::Entities,
            alias: None,
        }
    }

    fn default_selection_paths() -> &'q [Self::Path<'q>] {
        &[
            EntityQueryPath::Properties(None),
            EntityQueryPath::Id,
            EntityQueryPath::Version,
            EntityQueryPath::Type(EntityTypeQueryPath::VersionedUri),
            EntityQueryPath::OwnedById,
        ]
    }
}

impl Path for EntityQueryPath<'_> {
    fn tables(&self) -> Vec<(TableName, EdgeJoinDirection)> {
        match self {
            Self::Type(path) => once((TableName::Entities, EdgeJoinDirection::SourceOnTarget))
                .chain(path.tables())
                .collect(),
            _ => vec![(
                self.terminating_table_name(),
                EdgeJoinDirection::SourceOnTarget,
            )],
        }
    }

    fn terminating_table_name(&self) -> TableName {
        match self {
            Self::Id
            | Self::OwnedById
            | Self::CreatedById
            | Self::UpdatedById
            | Self::RemovedById
            | Self::Version
            | Self::Properties(_) => TableName::Entities,
            Self::Type(path) => path.terminating_table_name(),
        }
    }

    fn column_access(&self) -> ColumnAccess {
        match self {
            Self::Id => ColumnAccess::Table {
                column: "entity_id",
            },
            Self::Version => ColumnAccess::Table { column: "version" },
            Self::Type(path) => path.column_access(),
            Self::OwnedById => ColumnAccess::Table {
                column: "owned_by_id",
            },
            Self::CreatedById => ColumnAccess::Table {
                column: "created_by_id",
            },
            Self::UpdatedById => ColumnAccess::Table {
                column: "updated_by_id",
            },
            Self::RemovedById => ColumnAccess::Table {
                column: "removed_by_id",
            },
            Self::Properties(path) => path.as_ref().map_or(
                ColumnAccess::Table {
                    column: "properties",
                },
                |path| ColumnAccess::Json {
                    column: "properties",
                    field: path.as_ref(),
                },
            ),
        }
    }

    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)> {
        if let Self::Properties(Some(field)) = self {
            Some(field)
        } else {
            None
        }
    }
}
