use core::fmt::{self, Write as _};

use super::{identifier::Identifier, table_reference::TableReference};
use crate::store::postgres::query::{Column, Transpile};

/// A column name in a PostgreSQL query.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ColumnName<'name> {
    /// A dynamically-named column, quoted when transpiled
    Named(Identifier<'name>),
    /// A statically-defined column from the database schema
    Static(Column),
    /// The asterisk wildcard (`*`)
    Asterisk,
}

/// A reference to a column, optionally qualified with a table reference.
///
/// Transpiles to `<table>.<column>` or just `<column>` if no table qualification is present.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct ColumnReference<'name> {
    pub correlation: Option<TableReference<'name>>,
    pub name: ColumnName<'name>,
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

        match &self.name {
            ColumnName::Named(name) => name.transpile(fmt),
            ColumnName::Static(column) => column.transpile(fmt),
            ColumnName::Asterisk => fmt.write_char('*'),
        }
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
            name: ColumnName::Named(Identifier::from("username")),
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
            name: ColumnName::Named(Identifier::from("username")),
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
            name: ColumnName::Named(Identifier::from("username")),
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
            name: ColumnName::Named(Identifier::from("user name")),
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
            name: ColumnName::Named(Identifier::from(r#"my"column"#)),
        };
        assert_eq!(col_ref.transpile_to_string(), r#""my""table"."my""column""#);
    }

    #[test]
    fn asterisk_column_reference() {
        let col_ref = ColumnReference {
            correlation: None,
            name: ColumnName::Asterisk,
        };
        assert_eq!(col_ref.transpile_to_string(), "*");
    }

    #[test]
    fn qualified_asterisk_column_reference() {
        let col_ref = ColumnReference {
            correlation: Some(TableReference {
                schema: None,
                name: TableName::from("users"),
                alias: None,
            }),
            name: ColumnName::Asterisk,
        };
        assert_eq!(col_ref.transpile_to_string(), r#""users".*"#);
    }
}
