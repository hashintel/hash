use std::borrow::Cow;

use type_system::DataType;

use crate::{
    ontology::DataTypeQueryPath,
    store::postgres::query::{ColumnAccess, Field, Path, PostgresQueryRecord, Table, TableName},
};

impl<'q> PostgresQueryRecord<'q> for DataType {
    type Field = DataTypeQueryField<'q>;

    fn base_table() -> Table {
        Table {
            name: TableName::DataTypes,
            alias: None,
        }
    }

    fn default_fields() -> &'q [Self::Field] {
        &[DataTypeQueryField::Schema, DataTypeQueryField::OwnedById]
    }
}

/// A [`Field`] available in [`DataType`]s.
///
/// [`DataType`]: type_system::DataType
#[derive(Debug, PartialEq, Eq)]
pub enum DataTypeQueryField<'q> {
    BaseUri,
    Version,
    VersionId,
    OwnedById,
    Schema,
    VersionedUri,
    Title,
    Description,
    Type,
    Custom(Cow<'q, str>),
}

impl Field for DataTypeQueryField<'_> {
    fn table_name(&self) -> TableName {
        match self {
            Self::BaseUri | Self::Version => TableName::TypeIds,
            Self::VersionId
            | Self::OwnedById
            | Self::Schema
            | Self::VersionedUri
            | Self::Title
            | Self::Type
            | Self::Description
            | Self::Custom(_) => TableName::DataTypes,
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
                field: Cow::Borrowed("$id"),
            },
            Self::Title => ColumnAccess::Json {
                column: "schema",
                field: Cow::Borrowed("title"),
            },
            Self::Type => ColumnAccess::Json {
                column: "schema",
                field: Cow::Borrowed("type"),
            },
            Self::Description => ColumnAccess::Json {
                column: "schema",
                field: Cow::Borrowed("description"),
            },
            Self::Custom(field) => ColumnAccess::Json {
                column: "schema",
                field: field.clone(),
            },
        }
    }
}

impl Path for DataTypeQueryPath<'_> {
    fn tables(&self) -> Vec<TableName> {
        vec![self.terminating_table_name()]
    }

    fn terminating_table_name(&self) -> TableName {
        match self {
            Self::BaseUri | Self::Version => TableName::TypeIds,
            Self::OwnedById
            | Self::VersionedUri
            | Self::Title
            | Self::Type
            | Self::Description
            | Self::Custom(_) => TableName::DataTypes,
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
                field: Cow::Borrowed("$id"),
            },
            Self::Title => ColumnAccess::Json {
                column: "schema",
                field: Cow::Borrowed("title"),
            },
            Self::Type => ColumnAccess::Json {
                column: "schema",
                field: Cow::Borrowed("type"),
            },
            Self::Description => ColumnAccess::Json {
                column: "schema",
                field: Cow::Borrowed("description"),
            },
            Self::Custom(field) => ColumnAccess::Json {
                column: "schema",
                field: field.clone(),
            },
        }
    }
}
