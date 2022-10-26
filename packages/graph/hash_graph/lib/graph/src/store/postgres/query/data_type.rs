use postgres_types::ToSql;
use type_system::DataType;

use crate::{
    ontology::DataTypeQueryPath,
    store::postgres::query::{ColumnAccess, Field, Path, PostgresQueryRecord, Table, TableName},
};

impl<'q> PostgresQueryRecord<'q> for DataType {
    type Field = DataTypeQueryField;

    fn base_table() -> Table {
        Table {
            name: TableName::DataTypes,
            alias: None,
        }
    }

    fn default_fields() -> &'q [Self::Field] {
        &[
            DataTypeQueryField::VersionedUri,
            DataTypeQueryField::Schema,
            DataTypeQueryField::OwnedById,
            DataTypeQueryField::CreatedById,
            DataTypeQueryField::UpdatedById,
            DataTypeQueryField::RemovedById,
        ]
    }
}

/// A [`Field`] available in [`DataType`]s.
///
/// [`DataType`]: type_system::DataType
#[derive(Debug, PartialEq, Eq)]
pub enum DataTypeQueryField {
    BaseUri,
    Version,
    VersionId,
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    Schema,
    VersionedUri,
    Title,
    Description,
    Type,
}

impl Field for DataTypeQueryField {
    fn table_name(&self) -> TableName {
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
}

impl Path for DataTypeQueryPath {
    fn tables(&self) -> Vec<TableName> {
        vec![self.terminating_table_name()]
    }

    fn terminating_table_name(&self) -> TableName {
        match self {
            Self::BaseUri | Self::Version => TableName::TypeIds,
            Self::OwnedById
            | Self::CreatedById
            | Self::UpdatedById
            | Self::RemovedById
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

    fn user_provided_field(&self) -> Option<&(dyn ToSql + Sync)> {
        None
    }
}
