use core::fmt::{self, Write as _};

use super::identifier::Identifier;
use crate::store::postgres::query::Transpile;

/// A schema reference in PostgreSQL, optionally qualified with a database name.
///
/// Represents `schema` or `database.schema`. This ensures the correct structure for PostgreSQL
/// qualified names, where database qualification requires a schema.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct SchemaReference<'name> {
    pub database: Option<Identifier<'name>>,
    pub schema: Identifier<'name>,
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
        self.schema.transpile(fmt)
    }
}

/// A qualified table reference in PostgreSQL.
///
/// PostgreSQL table references follow a strict hierarchy:
/// - Unqualified: `table`
/// - Schema-qualified: `schema.table`
/// - Fully-qualified: `database.schema.table`
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct TableReference<'name> {
    pub schema: Option<SchemaReference<'name>>,
    pub table: Identifier<'name>,
}

impl fmt::Debug for TableReference<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

impl Transpile for TableReference<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(schema) = &self.schema {
            schema.transpile(fmt)?;
            fmt.write_char('.')?;
        }
        self.table.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_table_reference() {
        let table_ref = TableReference {
            schema: None,
            table: Identifier::from("users"),
        };
        assert_eq!(table_ref.transpile_to_string(), r#""users""#);
    }

    #[test]
    fn schema_qualified_table_reference() {
        let table_ref = TableReference {
            schema: Some(SchemaReference {
                database: None,
                schema: Identifier::from("public"),
            }),
            table: Identifier::from("users"),
        };
        assert_eq!(table_ref.transpile_to_string(), r#""public"."users""#);
    }

    #[test]
    fn fully_qualified_table_reference() {
        let table_ref = TableReference {
            schema: Some(SchemaReference {
                database: Some(Identifier::from("mydb")),
                schema: Identifier::from("public"),
            }),
            table: Identifier::from("users"),
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
                schema: Identifier::from("my-schema"),
            }),
            table: Identifier::from("user table"),
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
                schema: Identifier::from(r#"my"schema"#),
            }),
            table: Identifier::from(r#"my"table"#),
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
            schema: Identifier::from("public"),
        };
        assert_eq!(schema_ref.transpile_to_string(), r#""public""#);
    }

    #[test]
    fn schema_reference_qualified() {
        let schema_ref = SchemaReference {
            database: Some(Identifier::from("mydb")),
            schema: Identifier::from("public"),
        };
        assert_eq!(schema_ref.transpile_to_string(), r#""mydb"."public""#);
    }
}
