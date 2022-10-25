use std::iter::once;

use postgres_types::ToSql;
use type_system::PropertyType;

use crate::{
    ontology::PropertyTypeQueryPath,
    store::postgres::query::{ColumnAccess, Field, Path, PostgresQueryRecord, Table, TableName},
};

impl<'q> PostgresQueryRecord<'q> for PropertyType {
    type Field = PropertyTypeField;

    fn base_table() -> Table {
        Table {
            name: TableName::PropertyTypes,
            alias: None,
        }
    }

    fn default_fields() -> &'q [Self::Field] {
        &[PropertyTypeField::Schema, PropertyTypeField::OwnedById]
    }
}

/// A [`Field`] available in [`PropertyType`]s.
///
/// [`PropertyType`]: type_system::PropertyType
#[derive(Debug, PartialEq, Eq)]
pub enum PropertyTypeField {
    BaseUri,
    Version,
    VersionId,
    OwnedById,
    Schema,
    VersionedUri,
    Title,
    Description,
}

impl Field for PropertyTypeField {
    fn table_name(&self) -> TableName {
        match self {
            Self::BaseUri | Self::Version => TableName::TypeIds,
            Self::VersionId
            | Self::OwnedById
            | Self::Schema
            | Self::VersionedUri
            | Self::Title
            | Self::Description => TableName::PropertyTypes,
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
        }
    }
}

impl Path for PropertyTypeQueryPath {
    fn tables(&self) -> Vec<TableName> {
        match self {
            Self::DataTypes(path) => once(TableName::PropertyTypeDataTypeReferences)
                .chain(path.tables())
                .collect(),
            Self::PropertyTypes(path) => once(TableName::PropertyTypePropertyTypeReferences)
                .chain(path.tables())
                .collect(),
            _ => vec![self.terminating_table_name()],
        }
    }

    fn terminating_table_name(&self) -> TableName {
        match self {
            Self::BaseUri | Self::Version => TableName::TypeIds,
            Self::OwnedById | Self::VersionedUri | Self::Title | Self::Description => {
                TableName::PropertyTypes
            }
            Self::DataTypes(path) => path.terminating_table_name(),
            Self::PropertyTypes(path) => path.terminating_table_name(),
        }
    }

    fn column_access(&self) -> ColumnAccess {
        match self {
            Self::BaseUri => ColumnAccess::Table { column: "base_uri" },
            Self::Version => ColumnAccess::Table { column: "version" },
            Self::OwnedById => ColumnAccess::Table {
                column: "owned_by_id",
            },
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

    fn user_provided_field(&self) -> Option<&(dyn ToSql + Sync)> {
        None
    }
}
