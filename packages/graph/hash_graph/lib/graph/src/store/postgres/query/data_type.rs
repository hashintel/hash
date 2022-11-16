use postgres_types::ToSql;
use type_system::DataType;

use crate::{
    ontology::DataTypeQueryPath,
    store::postgres::query::{ColumnAccess, Path, PostgresQueryRecord, Relation, Table, TableName},
};

impl PostgresQueryRecord for DataType {
    fn base_table() -> Table {
        Table {
            name: TableName::DataTypes,
            alias: None,
        }
    }
}

impl Path for DataTypeQueryPath {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUri | Self::Version => {
                vec![Relation {
                    current_column_access: Self::VersionId.column_access(),
                    join_table_name: TableName::TypeIds,
                    join_column_access: Self::VersionId.column_access(),
                }]
            }
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
            | Self::Schema
            | Self::VersionedUri
            | Self::Title
            | Self::Type
            | Self::Description => TableName::DataTypes,
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
            Self::Schema => ColumnAccess::Table { column: "schema" },
            Self::VersionedUri => ColumnAccess::Json {
                column: "schema",
                field: "$id",
            },
            Self::Title => ColumnAccess::Json {
                column: "schema",
                field: "title",
            },
            Self::Type => ColumnAccess::Json {
                column: "schema",
                field: "type",
            },
            Self::Description => ColumnAccess::Json {
                column: "schema",
                field: "description",
            },
        }
    }

    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)> {
        None
    }
}
