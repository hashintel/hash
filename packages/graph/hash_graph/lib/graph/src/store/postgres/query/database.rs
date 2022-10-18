use std::{
    borrow::Cow,
    fmt::{self, Write},
};

use serde::Serialize;

use crate::store::postgres::query::Transpile;

/// The name of a [`Table`] in the Postgres database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TableName {
    TypeIds,
    DataTypes,
}

impl TableName {
    /// Returns the [`Column`] used for joining another `Table` on this `Table`.
    pub const fn source_join_column(self) -> &'static str {
        match self {
            Self::TypeIds | Self::DataTypes => "version_id",
        }
    }

    /// Returns the [`Column`] used for joining this `Table` on another `Table`.
    pub const fn target_join_column(self) -> &'static str {
        match self {
            Self::TypeIds | Self::DataTypes => "version_id",
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
    condition_index: usize,
    chain_depth: usize,
}

/// A table available in a compiled query.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Table {
    pub name: TableName,
    pub alias: Option<TableAlias>,
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
#[derive(Debug, PartialEq, Eq, Hash)]
pub enum ColumnAccess<'a> {
    /// Accesses a column of a table directly: `"column"`
    Table { column: &'static str },
    /// Accesses a field of a JSON blob: `"column"->>'field'`
    Json {
        column: &'static str,
        field: Cow<'a, str>,
    },
}

impl Transpile for ColumnAccess<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Table { column } => write!(fmt, r#""{column}""#),
            Self::Json { column, field } => write!(fmt, r#""{column}"->>'{field}'"#),
        }
    }
}

/// A column available in the database.
#[derive(Debug, PartialEq, Eq, Hash)]
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
    use crate::store::postgres::query::{test_helper::transpile, DataTypeQueryField, Field};

    #[test]
    fn source_join_columns() {
        assert_eq!(TableName::TypeIds.source_join_column(), "version_id");
        assert_eq!(TableName::DataTypes.source_join_column(), "version_id");
    }

    #[test]
    fn target_join_columns() {
        assert_eq!(TableName::TypeIds.target_join_column(), "version_id");
        assert_eq!(TableName::DataTypes.target_join_column(), "version_id");
    }

    #[test]
    fn render_table() {
        assert_eq!(
            transpile(&Table {
                name: TableName::TypeIds,
                alias: None
            }),
            r#""type_ids""#
        );
        assert_eq!(
            transpile(&Table {
                name: TableName::DataTypes,
                alias: None
            }),
            r#""data_types""#
        );
    }

    #[test]
    fn render_table_alias() {
        assert_eq!(
            transpile(&Table {
                name: TableName::TypeIds,
                alias: Some(TableAlias {
                    condition_index: 1,
                    chain_depth: 2
                })
            }),
            r#""type_ids_1_2""#
        );
    }

    #[test]
    fn render_column_access() {
        assert_eq!(
            transpile(&DataTypeQueryField::VersionId.column_access()),
            r#""version_id""#
        );
        assert_eq!(
            transpile(&DataTypeQueryField::Title.column_access()),
            r#""schema"->>'title'"#
        );
    }

    #[test]
    fn render_column() {
        assert_eq!(
            transpile(&Column {
                table: Table {
                    name: DataTypeQueryField::VersionId.table_name(),
                    alias: None
                },
                access: DataTypeQueryField::VersionId.column_access()
            }),
            r#""data_types"."version_id""#
        );
        assert_eq!(
            transpile(&Column {
                table: Table {
                    name: DataTypeQueryField::Title.table_name(),
                    alias: None
                },
                access: DataTypeQueryField::Title.column_access()
            }),
            r#""data_types"."schema"->>'title'"#
        );
    }
}
