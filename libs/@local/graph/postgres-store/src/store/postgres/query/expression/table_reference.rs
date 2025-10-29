use core::{
    fmt::{self, Write as _},
    hash::{Hash, Hasher},
};

use super::identifier::Identifier;
use crate::store::postgres::query::{Alias, Table, Transpile};

/// A schema reference in PostgreSQL, optionally qualified with a database name.
///
/// Represents `schema` or `database.schema`. This ensures the correct structure for PostgreSQL
/// qualified names, where database qualification requires a schema.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct SchemaReference<'name> {
    pub database: Option<Identifier<'name>>,
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

#[derive(Clone, Eq)]
enum TableNameImpl<'name> {
    Static(Table),
    Dynamic(Identifier<'name>),
}

impl TableNameImpl<'_> {
    #[must_use]
    pub fn as_str(&self) -> &str {
        match self {
            TableNameImpl::Static(table) => table.as_str(),
            TableNameImpl::Dynamic(name) => name.as_ref(),
        }
    }
}

impl PartialEq for TableNameImpl<'_> {
    fn eq(&self, other: &Self) -> bool {
        if let (TableNameImpl::Static(lhs), TableNameImpl::Static(rhs)) = (self, other) {
            lhs == rhs
        } else {
            self.as_str() == other.as_str()
        }
    }
}

impl Hash for TableNameImpl<'_> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.as_str().hash(state);
    }
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct TableName<'name>(TableNameImpl<'name>);

impl fmt::Debug for TableName<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

impl From<Table> for TableName<'_> {
    fn from(table: Table) -> Self {
        Self(TableNameImpl::Static(table))
    }
}

impl<'name, I: Into<Identifier<'name>>> From<I> for TableName<'name> {
    fn from(identifier: I) -> Self {
        Self(TableNameImpl::Dynamic(identifier.into()))
    }
}

impl Transpile for TableName<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.0 {
            TableNameImpl::Dynamic(identifier) => identifier.transpile(fmt),
            TableNameImpl::Static(table) => table.transpile(fmt),
        }
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
    pub name: TableName<'name>,
    pub alias: Option<Alias>,
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
            alias: None,
        }
    }
}

impl Transpile for TableReference<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(schema) = &self.schema {
            schema.transpile(fmt)?;
            fmt.write_char('.')?;
        }
        if let Some(alias) = &self.alias {
            fmt.write_char('"')?;
            match &self.name.0 {
                TableNameImpl::Static(table) => fmt.write_str(table.as_str())?,
                TableNameImpl::Dynamic(name) => {
                    for ch in name.as_ref().chars() {
                        if ch == '"' {
                            fmt.write_str("\"\"")?;
                        } else {
                            fmt.write_char(ch)?;
                        }
                    }
                }
            }
            write!(
                fmt,
                "_{}_{}_{}\"",
                alias.condition_index, alias.chain_depth, alias.number
            )
        } else {
            self.name.transpile(fmt)
        }
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
            alias: None,
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
            alias: None,
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
            alias: None,
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
            alias: None,
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
            alias: None,
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
