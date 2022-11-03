use postgres_types::ToSql;
use type_system::PropertyType;

use crate::{
    ontology::{DataTypeQueryPath, PropertyTypeQueryPath},
    store::postgres::query::{ColumnAccess, Path, PostgresQueryRecord, Relation, Table, TableName},
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
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUri | Self::Version => vec![Relation {
                current_column_access: Self::VersionId.column_access(),
                join_table_name: TableName::TypeIds,
                join_column_access: Self::VersionId.column_access(),
            }],
            Self::DataTypes(path) => [
                Relation {
                    current_column_access: Self::VersionId.column_access(),
                    join_table_name: TableName::PropertyTypeDataTypeReferences,
                    join_column_access: ColumnAccess::Table {
                        column: "source_property_type_version_id",
                    },
                },
                Relation {
                    current_column_access: ColumnAccess::Table {
                        column: "target_data_type_version_id",
                    },
                    join_table_name: TableName::DataTypes,
                    join_column_access: DataTypeQueryPath::VersionId.column_access(),
                },
            ]
            .into_iter()
            .chain(path.relations())
            .collect(),
            Self::PropertyTypes(path) => [
                Relation {
                    current_column_access: Self::VersionId.column_access(),
                    join_table_name: TableName::PropertyTypePropertyTypeReferences,
                    join_column_access: ColumnAccess::Table {
                        column: "source_property_type_version_id",
                    },
                },
                Relation {
                    current_column_access: ColumnAccess::Table {
                        column: "target_property_type_version_id",
                    },
                    join_table_name: TableName::PropertyTypes,
                    join_column_access: Self::VersionId.column_access(),
                },
            ]
            .into_iter()
            .chain(path.relations())
            .collect(),
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
