use core::{
    fmt::{self, Write as _},
    hash::{Hash, Hasher},
};

use super::{identifier::Identifier, table_reference::TableReference};
use crate::store::postgres::query::{Column, Transpile, table::DatabaseColumn as _};

#[derive(Clone, Eq)]
enum ColumnNameImpl<'name> {
    Static(Column),
    Dynamic(Identifier<'name>),
}

impl ColumnNameImpl<'_> {
    #[must_use]
    pub fn as_str(&self) -> &str {
        match self {
            ColumnNameImpl::Static(column) => column.as_str(),
            ColumnNameImpl::Dynamic(name) => name.as_ref(),
        }
    }
}

impl PartialEq for ColumnNameImpl<'_> {
    fn eq(&self, other: &Self) -> bool {
        if let (ColumnNameImpl::Static(lhs), ColumnNameImpl::Static(rhs)) = (self, other) {
            lhs == rhs
        } else {
            self.as_str() == other.as_str()
        }
    }
}

impl Hash for ColumnNameImpl<'_> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.as_str().hash(state);
    }
}

/// A column name in a PostgreSQL query.
///
/// Can represent either a schema-defined [`Column`] or a dynamically-provided identifier.
/// The two variants are treated as equal if they represent the same column name string.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct ColumnName<'name>(ColumnNameImpl<'name>);

impl fmt::Debug for ColumnName<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

impl From<Column> for ColumnName<'_> {
    fn from(column: Column) -> Self {
        Self(ColumnNameImpl::Static(column))
    }
}

impl<'name> From<Identifier<'name>> for ColumnName<'name> {
    fn from(identifier: Identifier<'name>) -> Self {
        Self(ColumnNameImpl::Dynamic(identifier))
    }
}

impl Transpile for ColumnName<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.0 {
            ColumnNameImpl::Static(column) => column.transpile(fmt),
            ColumnNameImpl::Dynamic(name) => name.transpile(fmt),
        }
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
    use crate::store::postgres::query::expression::table_reference::{SchemaReference, TableName};

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
                alias: None,
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
                alias: None,
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
                alias: None,
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
                alias: None,
            }),
            name: ColumnName::from(Identifier::from(r#"my"column"#)),
        };
        assert_eq!(col_ref.transpile_to_string(), r#""my""table"."my""column""#);
    }
}
