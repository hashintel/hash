use core::fmt::{self, Write as _};

use super::{identifier::Identifier, table_reference::TableReference};
use crate::store::postgres::query::{Column, Transpile, table::DatabaseColumn as _};

/// A column name in a PostgreSQL query.
///
/// Wraps an [`Identifier`], so transpiling always quotes and escapes the name regardless of
/// whether it came from a schema-defined column or was provided dynamically.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ColumnName<'name>(Identifier<'name>);

impl ColumnName<'_> {
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_ref()
    }
}

impl From<Column> for ColumnName<'_> {
    fn from(column: Column) -> Self {
        column.name()
    }
}

impl<'name, I: Into<Identifier<'name>>> From<I> for ColumnName<'name> {
    fn from(identifier: I) -> Self {
        Self(identifier.into())
    }
}

impl Transpile for ColumnName<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.transpile(fmt)
    }
}

/// A reference to a column, optionally qualified with a table reference.
///
/// Transpiles to `<table>.<column>` when qualified, or just `<column>` when unqualified.
/// For example:
/// - Unqualified: `"username"`
/// - Qualified: `"users"."username"`
/// - Fully qualified: `"mydb"."public"."users"."username"`
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct ColumnReference<'name> {
    /// Optional table reference that qualifies this column.
    ///
    /// When `Some`, the column is prefixed with the table reference during transpilation
    /// (e.g., `table.column`). When `None`, only the column name is emitted.
    pub correlation: Option<TableReference<'name>>,
    /// The column name, which can be dynamically named, schema-defined, or a wildcard.
    pub name: ColumnName<'name>,
}

impl From<Column> for ColumnReference<'_> {
    /// Creates a fully-qualified column reference from a schema-defined [`Column`].
    ///
    /// The resulting reference includes the column's table as the correlation,
    /// producing a reference like `table.column` when transpiled.
    fn from(column: Column) -> Self {
        ColumnReference {
            correlation: Some(column.table().into()),
            name: ColumnName::from(column),
        }
    }
}

impl fmt::Debug for ColumnReference<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

impl Transpile for ColumnReference<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(correlation) = &self.correlation {
            correlation.transpile(fmt)?;
            fmt.write_char('.')?;
        }

        self.name.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::ast::table_reference::{SchemaReference, TableName};

    #[test]
    fn simple_column_reference() {
        let col_ref = ColumnReference {
            correlation: None,
            name: ColumnName::from(Identifier::from("username")),
        };
        assert_eq!(col_ref.transpile_to_string(), r#""username""#);
    }

    #[test]
    fn qualified_column_reference() {
        let col_ref = ColumnReference {
            correlation: Some(TableReference {
                schema: None,
                name: TableName::from("users"),
            }),
            name: ColumnName::from(Identifier::from("username")),
        };
        assert_eq!(col_ref.transpile_to_string(), r#""users"."username""#);
    }

    #[test]
    fn fully_qualified_column_reference() {
        let col_ref = ColumnReference {
            correlation: Some(TableReference {
                schema: Some(SchemaReference {
                    database: Some(Identifier::from("mydb")),
                    name: Identifier::from("public"),
                }),
                name: TableName::from("users"),
            }),
            name: ColumnName::from(Identifier::from("username")),
        };
        assert_eq!(
            col_ref.transpile_to_string(),
            r#""mydb"."public"."users"."username""#
        );
    }

    #[test]
    fn column_reference_with_special_chars() {
        let col_ref = ColumnReference {
            correlation: Some(TableReference {
                schema: None,
                name: TableName::from("user-table"),
            }),
            name: ColumnName::from(Identifier::from("user name")),
        };
        assert_eq!(col_ref.transpile_to_string(), r#""user-table"."user name""#);
    }

    #[test]
    fn column_reference_with_quotes() {
        let col_ref = ColumnReference {
            correlation: Some(TableReference {
                schema: None,
                name: TableName::from(r#"my"table"#),
            }),
            name: ColumnName::from(Identifier::from(r#"my"column"#)),
        };
        assert_eq!(col_ref.transpile_to_string(), r#""my""table"."my""column""#);
    }
}
