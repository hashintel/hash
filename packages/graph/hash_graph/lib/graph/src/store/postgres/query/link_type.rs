use postgres_types::ToSql;
use type_system::LinkType;

use crate::{
    ontology::LinkTypeQueryPath,
    store::postgres::query::{
        expression::EdgeJoinDirection, ColumnAccess, Path, PostgresQueryRecord, Table, TableName,
    },
};

// TODO: Link types are to be removed. See https://app.asana.com/0/1200211978612931/1203250001255277/f
impl<'q> PostgresQueryRecord<'q> for LinkType {
    fn base_table() -> Table {
        Table {
            name: TableName::LinkTypes,
            alias: None,
        }
    }

    fn default_selection_paths() -> &'q [Self::Path<'q>] {
        &[
            LinkTypeQueryPath::VersionedUri,
            LinkTypeQueryPath::Schema,
            LinkTypeQueryPath::OwnedById,
            LinkTypeQueryPath::CreatedById,
            LinkTypeQueryPath::UpdatedById,
            LinkTypeQueryPath::RemovedById,
        ]
    }
}

// TODO: Link types are to be removed. See https://app.asana.com/0/1200211978612931/1203250001255277/f
impl Path for LinkTypeQueryPath {
    fn tables(&self) -> Vec<(TableName, EdgeJoinDirection)> {
        vec![(
            self.terminating_table_name(),
            EdgeJoinDirection::SourceOnTarget,
        )]
    }

    fn terminating_table_name(&self) -> TableName {
        match self {
            Self::BaseUri | Self::Version => TableName::TypeIds,
            Self::VersionId
            | Self::OwnedById
            | Self::CreatedById
            | Self::UpdatedById
            | Self::RemovedById
            | Self::Schema
            | Self::VersionedUri
            | Self::Title
            | Self::Description
            | Self::RelatedKeywords => TableName::LinkTypes,
        }
    }

    fn column_access(&self) -> ColumnAccess {
        match self {
            Self::BaseUri => ColumnAccess::Table { column: "base_uri" },
            Self::Version => ColumnAccess::Table { column: "version" },
            Self::VersionId => ColumnAccess::Table {
                column: "version_id",
            },
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
            Self::Schema => ColumnAccess::Table { column: "schema" },
            Self::VersionedUri => ColumnAccess::Json {
                column: "schema",
                field: "$id",
            },
            Self::Title => ColumnAccess::Json {
                column: "schema",
                field: "title",
            },
            Self::Description => ColumnAccess::Json {
                column: "schema",
                field: "description",
            },
            Self::RelatedKeywords => ColumnAccess::Json {
                column: "schema",
                field: "relatedKeywords",
            },
        }
    }

    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)> {
        None
    }
}
