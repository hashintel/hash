use std::iter::once;

use postgres_types::ToSql;
use type_system::PropertyType;

use crate::{
    ontology::PropertyTypeQueryPath,
    store::postgres::query::{
        expression::EdgeJoinDirection, ColumnAccess, Path, PostgresQueryRecord, Table, TableName,
    },
};

impl<'q> PostgresQueryRecord<'q> for PropertyType {
    fn base_table() -> Table {
        Table {
            name: TableName::PropertyTypes,
            alias: None,
        }
    }

    fn default_selection_paths() -> &'q [Self::Path<'q>] {
        &[
            PropertyTypeQueryPath::VersionedUri,
            PropertyTypeQueryPath::Schema,
            PropertyTypeQueryPath::OwnedById,
            PropertyTypeQueryPath::CreatedById,
            PropertyTypeQueryPath::UpdatedById,
            PropertyTypeQueryPath::RemovedById,
        ]
    }
}

impl Path for PropertyTypeQueryPath {
    fn tables(&self) -> Vec<(TableName, EdgeJoinDirection)> {
        match self {
            Self::DataTypes(path) => once((
                TableName::PropertyTypeDataTypeReferences,
                EdgeJoinDirection::SourceOnTarget,
            ))
            .chain(path.tables())
            .collect(),
            Self::PropertyTypes(path) => once((
                TableName::PropertyTypePropertyTypeReferences,
                EdgeJoinDirection::SourceOnTarget,
            ))
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
            Self::BaseUri | Self::Version => TableName::TypeIds,
            Self::VersionId
            | Self::OwnedById
            | Self::CreatedById
            | Self::UpdatedById
            | Self::RemovedById
            | Self::Schema
            | Self::VersionedUri
            | Self::Title
            | Self::Description => TableName::PropertyTypes,
            Self::DataTypes(path) => path.terminating_table_name(),
            Self::PropertyTypes(path) => path.terminating_table_name(),
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
            Self::DataTypes(path) => path.column_access(),
            Self::PropertyTypes(path) => path.column_access(),
        }
    }

    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)> {
        None
    }
}
