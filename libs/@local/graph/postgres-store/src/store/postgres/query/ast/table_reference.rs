use core::fmt::{self, Write as _};

use super::identifier::Identifier;
use crate::store::postgres::query::{Table, Transpile};

/// A schema reference in PostgreSQL, optionally qualified with a database name.
///
/// Represents `schema` or `database.schema`. This ensures the correct structure for PostgreSQL
/// qualified names, where database qualification requires a schema.
///
/// Transpiles to:
/// - Unqualified: `"public"`
/// - Database-qualified: `"mydb"."public"`
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct SchemaReference<'name> {
    /// Optional database name that qualifies this schema.
    ///
    /// When `Some`, transpiles to `database.schema`. When `None`, only the schema name is emitted.
    pub database: Option<Identifier<'name>>,
    /// The schema name.
    pub name: Identifier<'name>,
}

impl fmt::Debug for SchemaReference<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

impl Transpile for SchemaReference<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(database) = &self.database {
            database.transpile(fmt)?;
            fmt.write_char('.')?;
        }
        self.name.transpile(fmt)
    }
}

/// A table name in a PostgreSQL query.
///
/// Wraps an [`Identifier`], so transpiling always quotes and escapes the name regardless of
/// whether it came from a schema-defined [`Table`] or was provided dynamically.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct TableName<'name>(Identifier<'name>);

impl fmt::Debug for TableName<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

impl From<Table> for TableName<'_> {
    fn from(table: Table) -> Self {
        Self(Identifier::from(table.as_str()))
    }
}

impl<'name, I: Into<Identifier<'name>>> From<I> for TableName<'name> {
    fn from(identifier: I) -> Self {
        Self(identifier.into())
    }
}

impl TableName<'_> {
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_ref()
    }
}

impl Transpile for TableName<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.transpile(fmt)
    }
}

/// A qualified table reference in PostgreSQL.
///
/// PostgreSQL table references follow a strict hierarchy:
/// - Unqualified: `"users"`
/// - Schema-qualified: `"public"."users"`
/// - Fully-qualified: `"mydb"."public"."users"`
///
/// Alias numbering is the compiler's concern: [`Table::aliased_name`] folds its structured
/// alias into a plain [`TableName`] before it ever reaches this type.
///
/// [`Table::aliased_name`]: crate::store::postgres::query::Table::aliased_name
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct TableReference<'name> {
    /// Optional schema reference that qualifies this table.
    ///
    /// When `Some`, the table is prefixed with the schema (and optionally database).
    /// When `None`, only the table name is used.
    pub schema: Option<SchemaReference<'name>>,
    /// The table name, either schema-defined or dynamically provided.
    pub name: TableName<'name>,
}

impl fmt::Debug for TableReference<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

impl From<Table> for TableReference<'_> {
    fn from(table: Table) -> Self {
        Self {
            schema: None,
            name: TableName::from(table),
        }
    }
}

impl<'name> From<TableName<'name>> for TableReference<'name> {
    fn from(name: TableName<'name>) -> Self {
        Self { schema: None, name }
    }
}

impl Transpile for TableReference<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(schema) = &self.schema {
            schema.transpile(fmt)?;
            fmt.write_char('.')?;
        }
        self.name.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_table_reference() {
        let table_ref = TableReference {
            schema: None,
            name: TableName::from("users"),
        };
        assert_eq!(table_ref.transpile_to_string(), r#""users""#);
    }

    #[test]
    fn schema_qualified_table_reference() {
        let table_ref = TableReference {
            schema: Some(SchemaReference {
                database: None,
                name: Identifier::from("public"),
            }),
            name: TableName::from("users"),
        };
        assert_eq!(table_ref.transpile_to_string(), r#""public"."users""#);
    }

    #[test]
    fn fully_qualified_table_reference() {
        let table_ref = TableReference {
            schema: Some(SchemaReference {
                database: Some(Identifier::from("mydb")),
                name: Identifier::from("public"),
            }),
            name: TableName::from("users"),
        };
        assert_eq!(
            table_ref.transpile_to_string(),
            r#""mydb"."public"."users""#
        );
    }

    #[test]
    fn table_reference_with_special_chars() {
        let table_ref = TableReference {
            schema: Some(SchemaReference {
                database: None,
                name: Identifier::from("my-schema"),
            }),
            name: TableName::from("user table"),
        };
        assert_eq!(
            table_ref.transpile_to_string(),
            r#""my-schema"."user table""#
        );
    }

    #[test]
    fn table_reference_with_quotes() {
        let table_ref = TableReference {
            schema: Some(SchemaReference {
                database: Some(Identifier::from(r#"my"db"#)),
                name: Identifier::from(r#"my"schema"#),
            }),
            name: TableName::from(r#"my"table"#),
        };
        assert_eq!(
            table_ref.transpile_to_string(),
            r#""my""db"."my""schema"."my""table""#
        );
    }

    #[test]
    fn schema_reference_simple() {
        let schema_ref = SchemaReference {
            database: None,
            name: Identifier::from("public"),
        };
        assert_eq!(schema_ref.transpile_to_string(), r#""public""#);
    }

    #[test]
    fn schema_reference_qualified() {
        let schema_ref = SchemaReference {
            database: Some(Identifier::from("mydb")),
            name: Identifier::from("public"),
        };
        assert_eq!(schema_ref.transpile_to_string(), r#""mydb"."public""#);
    }
}
