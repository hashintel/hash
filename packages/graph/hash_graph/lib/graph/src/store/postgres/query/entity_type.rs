use std::iter::once;

use postgres_types::ToSql;
use type_system::EntityType;

use crate::{
    ontology::EntityTypeQueryPath,
    store::postgres::query::{ColumnAccess, Path, PostgresQueryRecord, Table, TableName},
};

impl<'q> PostgresQueryRecord<'q> for EntityType {
    fn base_table() -> Table {
        Table {
            name: TableName::EntityTypes,
            alias: None,
        }
    }

    fn default_selection_paths() -> &'q [Self::Path<'q>] {
        &[
            EntityTypeQueryPath::VersionedUri,
            EntityTypeQueryPath::Schema,
            EntityTypeQueryPath::OwnedById,
            EntityTypeQueryPath::CreatedById,
            EntityTypeQueryPath::UpdatedById,
            EntityTypeQueryPath::RemovedById,
        ]
    }
}

impl Path for EntityTypeQueryPath {
    fn tables(&self) -> Vec<TableName> {
        match self {
            Self::Properties(path) => once(TableName::EntityTypePropertyTypeReferences)
                .chain(path.tables())
                .collect(),
            Self::Links(path) => once(TableName::EntityTypeLinkTypeReferences)
                .chain(path.tables())
                .collect(),
            _ => vec![self.terminating_table_name()],
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
            | Self::Description
            | Self::Default
            | Self::Examples
            | Self::Required
            | Self::RequiredLinks => TableName::EntityTypes,
            Self::Properties(path) => path.terminating_table_name(),
            Self::Links(path) => path.terminating_table_name(),
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
            Self::Default => ColumnAccess::Json {
                column: "schema",
                field: "default",
            },
            Self::Examples => ColumnAccess::Json {
                column: "schema",
                field: "examples",
            },
            Self::Properties(path) => path.column_access(),
            Self::Required => ColumnAccess::Json {
                column: "schema",
                field: "required",
            },
            Self::Links(path) => path.column_access(),
            Self::RequiredLinks => ColumnAccess::Json {
                column: "schema",
                field: "requiredLinks",
            },
        }
    }

    fn user_provided_field(&self) -> Option<&(dyn ToSql + Sync)> {
        None
    }
}
