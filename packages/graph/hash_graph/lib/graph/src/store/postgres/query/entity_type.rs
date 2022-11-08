use postgres_types::ToSql;
use type_system::EntityType;

use crate::{
    ontology::{EntityTypeQueryPath, PropertyTypeQueryPath},
    store::postgres::query::{ColumnAccess, Path, PostgresQueryRecord, Relation, Table, TableName},
};

impl PostgresQueryRecord for EntityType {
    fn base_table() -> Table {
        Table {
            name: TableName::EntityTypes,
            alias: None,
        }
    }

    fn default_selection_paths() -> &'static [Self::Path<'static>] {
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
    /// Returns the relations that are required to access the path.
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUri | Self::Version => vec![Relation {
                current_column_access: Self::VersionId.column_access(),
                join_table_name: TableName::TypeIds,
                join_column_access: Self::VersionId.column_access(),
            }],
            Self::Properties(path) => [
                Relation {
                    current_column_access: Self::VersionId.column_access(),
                    join_table_name: TableName::EntityTypePropertyTypeReferences,
                    join_column_access: ColumnAccess::Table {
                        column: "source_entity_type_version_id",
                    },
                },
                Relation {
                    current_column_access: ColumnAccess::Table {
                        column: "target_property_type_version_id",
                    },
                    join_table_name: TableName::PropertyTypes,
                    join_column_access: PropertyTypeQueryPath::VersionId.column_access(),
                },
            ]
            .into_iter()
            .chain(path.relations())
            .collect(),
            Self::InheritsFrom(path) => [
                Relation {
                    current_column_access: Self::VersionId.column_access(),
                    join_table_name: TableName::EntityTypeEntityTypeReferences,
                    join_column_access: ColumnAccess::Table {
                        column: "source_entity_type_version_id",
                    },
                },
                Relation {
                    current_column_access: ColumnAccess::Table {
                        column: "target_entity_type_version_id",
                    },
                    join_table_name: TableName::EntityTypes,
                    join_column_access: Self::VersionId.column_access(),
                },
            ]
            .into_iter()
            .chain(path.relations())
            .collect(),
            // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
            // Links(LinkTypeQueryPath),
            // Self::Links(path) => ...
            _ => vec![],
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
            Self::InheritsFrom(path) => path.terminating_table_name(),
            Self::Properties(path) => path.terminating_table_name(),
            // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
            // Self::Links(path) => path.terminating_table_name(),
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
            Self::InheritsFrom(path) => path.column_access(),
            // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
            // Self::Links(path) => path.column_access(),
            Self::RequiredLinks => ColumnAccess::Json {
                column: "schema",
                field: "requiredLinks",
            },
        }
    }

    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)> {
        None
    }
}
