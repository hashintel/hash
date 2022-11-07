use std::fmt::{self, Write};

use crate::store::postgres::query::Transpile;

/// The name of a [`Table`] in the Postgres database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
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
    EntityTypeEntityTypeReferences,
}

impl TableName {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::TypeIds => "type_ids",
            Self::DataTypes => "data_types",
            Self::PropertyTypes => "property_types",
            Self::EntityTypes => "entity_types",
            Self::LinkTypes => "link_types",
            Self::Entities => "entities",
            Self::PropertyTypeDataTypeReferences => "property_type_data_type_references",
            Self::PropertyTypePropertyTypeReferences => "property_type_property_type_references",
            Self::EntityTypePropertyTypeReferences => "entity_type_property_type_references",
            Self::EntityTypeEntityTypeReferences => "entity_type_entity_type_references",
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
    pub number: usize,
}

/// A table available in a compiled query.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Table {
    pub name: TableName,
    pub alias: Option<TableAlias>,
}

impl Transpile for Table {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "\"{}", self.name.as_str())?;
        if let Some(alias) = &self.alias {
            write!(
                fmt,
                "_{}_{}_{}",
                alias.condition_index, alias.chain_depth, alias.number
            )?;
        }
        fmt.write_char('"')
    }
}

/// Specifier on how to access a column of a table.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ColumnAccess<'param> {
    /// Accesses a column of a table directly: `"column"`
    Table { column: &'static str },
    /// Accesses a field of a JSON blob: `"column"->>'field'`
    Json {
        column: &'static str,
        field: &'param str,
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
pub struct Column<'param> {
    pub table: Table,
    pub access: ColumnAccess<'param>,
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
                    chain_depth: 2,
                    number: 3,
                })
            }
            .transpile_to_string(),
            r#""type_ids_1_2_3""#
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
