use std::fmt::{self, Write};

use serde::Serialize;

use crate::store::postgres::query::Transpile;

/// The name of a [`Table`] in the Postgres database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TableName {
    TypeIds,
    DataTypes,
    PropertyTypes,
    EntityTypes,
    LinkTypes,
    Entities,
    PropertyTypeDataTypeReferences,
    PropertyTypePropertyTypeReferences,
    EntityTypePropertyTypeReferences,
    EntityTypeLinkTypeReferences,
}

impl TableName {
    const fn source_join_column_access(self) -> ColumnAccess<'static> {
        ColumnAccess::Table {
            column: match self {
                Self::TypeIds
                | Self::DataTypes
                | Self::PropertyTypes
                | Self::EntityTypes
                | Self::LinkTypes => "version_id",
                Self::Entities => "entity_id",
                Self::PropertyTypeDataTypeReferences | Self::PropertyTypePropertyTypeReferences => {
                    "source_property_type_version_id"
                }
                Self::EntityTypePropertyTypeReferences | Self::EntityTypeLinkTypeReferences => {
                    "source_entity_type_version_id"
                }
            },
        }
    }

    /// Returns the [`Column`] used for joining this `Table` on another `Table`.
    const fn target_join_column_access(self) -> ColumnAccess<'static> {
        ColumnAccess::Table {
            column: match self {
                Self::TypeIds
                | Self::DataTypes
                | Self::PropertyTypes
                | Self::EntityTypes
                | Self::LinkTypes => "version_id",
                Self::Entities => "entity_id",
                Self::PropertyTypeDataTypeReferences => "target_data_type_version_id",
                Self::PropertyTypePropertyTypeReferences
                | Self::EntityTypePropertyTypeReferences => "target_property_type_version_id",
                Self::EntityTypeLinkTypeReferences => "target_link_type_version_id",
            },
        }
    }
}

/// Alias parameters used to uniquely identify a [`Table`].
///
/// When joining tables in a query, it's necessary that the names used to reference them are unique.
/// Achieving this can require aliasing the names if the various parts of the query rely on the same
/// [`Table`] but under different conditions. To appropriately identify a [`Table`] when aliased,
/// some additional information associated with it may be needed.
///
/// # Examples
///
/// When specifying multiple conditions or deeply nested queries containing the same [`Table`],
/// `TableAlias` uniquely identifies the condition and the depth of the query.
///
/// ## Multiple Conditions
///
/// When searching for a [`PropertyType`], which should contain two different [`DataType`]s,
/// the same [`Table`] has to be joined twice, but with different conditions. `condition_index` is
/// used here to distinguish between these.
///
/// ## Deeply nested query chains
///
/// It's possible to have queries which require the same [`Table`] multiple times in a chain. For
/// example, when searching for a [`PropertyType`] which references a [`PropertyType`] which in turn
/// references another [`PropertyType`], the `Table::PropertyTypePropertyTypeReferences` has to be
/// joined twice within the same condition. The `chain_depth` will be used to uniquely identify
/// the different tables.
///
/// [`DataType`]: type_system::DataType
/// [`PropertyType`]: type_system::PropertyType
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TableAlias {
    pub condition_index: usize,
    pub chain_depth: usize,
}

/// A table available in a compiled query.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Table {
    pub name: TableName,
    pub alias: Option<TableAlias>,
}

impl Table {
    /// Returns the [`Column`] used for joining another `Table` on this `Table`.
    pub const fn source_join_column(self) -> Column<'static> {
        Column {
            table: self,
            access: self.name.source_join_column_access(),
        }
    }

    /// Returns the [`Column`] used for joining this `Table` on another `Table`.
    pub const fn target_join_column(self) -> Column<'static> {
        Column {
            table: self,
            access: self.name.target_join_column_access(),
        }
    }
}

impl Transpile for Table {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_char('"')?;
        self.name.serialize(&mut *fmt)?;
        if let Some(alias) = self.alias {
            write!(fmt, "_{}_{}", alias.condition_index, alias.chain_depth)?;
        }
        fmt.write_char('"')
    }
}

/// Specifier on how to access a column of a table.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ColumnAccess<'q> {
    /// Accesses a column of a table directly: `"column"`
    Table { column: &'static str },
    /// Accesses a field of a JSON blob: `"column"->>'field'`
    Json {
        column: &'static str,
        field: &'q str,
    },
    /// Accesses the field of a JSON blob by a numbered parameter: e.g. `"column"->>$1`
    JsonParameter { column: &'static str, index: usize },
}

impl ColumnAccess<'_> {
    pub const fn column(&self) -> &'static str {
        match self {
            Self::Table { column }
            | Self::Json { column, .. }
            | Self::JsonParameter { column, .. } => column,
        }
    }
}

impl Transpile for ColumnAccess<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Table { column } => write!(fmt, r#""{column}""#),
            Self::Json { column, field } => write!(fmt, r#""{column}"->>'{field}'"#),
            Self::JsonParameter { column, index } => write!(fmt, r#""{column}"->>${index}"#),
        }
    }
}

/// A column available in the database.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Column<'a> {
    pub table: Table,
    pub access: ColumnAccess<'a>,
}

impl Transpile for Column<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.table.transpile(fmt)?;
        fmt.write_char('.')?;
        self.access.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ontology::DataTypeQueryPath, store::postgres::query::Path};

    #[test]
    fn source_join_columns() {
        assert_eq!(
            TableName::TypeIds.source_join_column_access(),
            ColumnAccess::Table {
                column: "version_id"
            }
        );
        assert_eq!(
            TableName::DataTypes.source_join_column_access(),
            ColumnAccess::Table {
                column: "version_id"
            }
        );
    }

    #[test]
    fn target_join_columns() {
        assert_eq!(
            TableName::TypeIds.target_join_column_access(),
            ColumnAccess::Table {
                column: "version_id"
            }
        );
        assert_eq!(
            TableName::DataTypes.target_join_column_access(),
            ColumnAccess::Table {
                column: "version_id"
            }
        );
    }

    #[test]
    fn transpile_table() {
        assert_eq!(
            Table {
                name: TableName::TypeIds,
                alias: None
            }
            .transpile_to_string(),
            r#""type_ids""#
        );
        assert_eq!(
            Table {
                name: TableName::DataTypes,
                alias: None
            }
            .transpile_to_string(),
            r#""data_types""#
        );
    }

    #[test]
    fn transpile_table_alias() {
        assert_eq!(
            Table {
                name: TableName::TypeIds,
                alias: Some(TableAlias {
                    condition_index: 1,
                    chain_depth: 2
                })
            }
            .transpile_to_string(),
            r#""type_ids_1_2""#
        );
    }

    #[test]
    fn transpile_column_access() {
        assert_eq!(
            DataTypeQueryPath::VersionId
                .column_access()
                .transpile_to_string(),
            r#""version_id""#
        );
        assert_eq!(
            DataTypeQueryPath::Title
                .column_access()
                .transpile_to_string(),
            r#""schema"->>'title'"#
        );
    }

    #[test]
    fn transpile_column() {
        assert_eq!(
            Column {
                table: Table {
                    name: DataTypeQueryPath::VersionId.terminating_table_name(),
                    alias: None
                },
                access: DataTypeQueryPath::VersionId.column_access()
            }
            .transpile_to_string(),
            r#""data_types"."version_id""#
        );
        assert_eq!(
            Column {
                table: Table {
                    name: DataTypeQueryPath::Title.terminating_table_name(),
                    alias: None
                },
                access: DataTypeQueryPath::Title.column_access()
            }
            .transpile_to_string(),
            r#""data_types"."schema"->>'title'"#
        );
    }
}
