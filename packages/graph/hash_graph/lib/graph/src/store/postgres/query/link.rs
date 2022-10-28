use std::iter::once;

use postgres_types::ToSql;

use crate::{
    knowledge::{Link, LinkQueryPath},
    store::postgres::query::{
        expression::EdgeJoinDirection, ColumnAccess, Path, PostgresQueryRecord, Table, TableName,
    },
};

impl<'q> PostgresQueryRecord<'q> for Link {
    fn base_table() -> Table {
        Table {
            name: TableName::Links,
            alias: None,
        }
    }

    fn default_selection_paths() -> &'q [Self::Path<'q>] {
        &[
            todo!("https://app.asana.com/0/1200211978612931/1203250001255262/f"),
            // LinkQueryPath::Type(LinkTypeQueryPath::VersionedUri),
            LinkQueryPath::Source(None),
            LinkQueryPath::Target(None),
            LinkQueryPath::Index,
            LinkQueryPath::OwnedById,
            LinkQueryPath::CreatedById,
        ]
    }
}

impl Path for LinkQueryPath<'_> {
    fn tables(&self) -> Vec<(TableName, EdgeJoinDirection)> {
        match self {
            Self::OwnedById | Self::CreatedById | Self::Index | Self::Target(None) => {
                vec![(TableName::Links, EdgeJoinDirection::SourceOnTarget)]
            }
            // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
            // Self::Type(path) => once((TableName::Links, EdgeJoinDirection::SourceOnTarget))
            //     .chain(path.tables())
            //     .collect(),
            Self::Source(Some(path)) => once((TableName::Links, EdgeJoinDirection::TargetOnSource))
                .chain(path.tables())
                .collect(),
            Self::Source(None) => {
                vec![(TableName::Links, EdgeJoinDirection::TargetOnSource)]
            }
            Self::Target(Some(path)) => once((TableName::Links, EdgeJoinDirection::SourceOnTarget))
                .chain(path.tables())
                .collect(),
        }
    }

    fn terminating_table_name(&self) -> TableName {
        match self {
            Self::OwnedById
            | Self::CreatedById
            | Self::Index
            | Self::Source(None)
            | Self::Target(None) => TableName::Links,
            // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
            // Self::Type(path) => path.terminating_table_name(),
            Self::Source(Some(path)) | Self::Target(Some(path)) => path.terminating_table_name(),
        }
    }

    fn column_access(&self) -> ColumnAccess {
        match self {
            Self::OwnedById => ColumnAccess::Table {
                column: "owned_by_id",
            },
            Self::CreatedById => ColumnAccess::Table {
                column: "created_by_id",
            },
            // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
            // Self::Type(path) => path.column_access(),
            Self::Source(Some(path)) | Self::Target(Some(path)) => path.column_access(),
            Self::Index => ColumnAccess::Table {
                column: "link_index",
            },
            Self::Source(None) => ColumnAccess::Table {
                column: "source_entity_id",
            },
            Self::Target(None) => ColumnAccess::Table {
                column: "target_entity_id",
            },
        }
    }

    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)> {
        None
    }
}
