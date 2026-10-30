use core::fmt::{self, Write as _};

/// A table or column name in a DuckDB statement.
///
/// It displays as a quoted identifier with each `"` doubled, so the name can contain spaces,
/// quotes and `/`, and can be a keyword. DuckDB refuses an empty name and a name that contains
/// NUL. It compares identifiers without regard to case, quoted or not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Identifier<'name>(&'name str);

impl<'name> Identifier<'name> {
    pub(crate) const fn new(name: &'name str) -> Self {
        Self(name)
    }
}

impl fmt::Display for Identifier<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_char('"')?;
        for (position, part) in self.0.split('"').enumerate() {
            if position > 0 {
                fmt.write_str("\"\"")?;
            }
            fmt.write_str(part)?;
        }
        fmt.write_char('"')
    }
}

#[cfg(test)]
mod tests {
    use duckdb::Connection;
    use proptest::{prop_assert_eq, property_test};

    use super::Identifier;

    #[property_test]
    fn identifier_round_trips(#[strategy = "(['\"]|[^\\x00])+"] name: String) {
        let connection = Connection::open_in_memory().expect("should open an in-memory database");
        let mut statement = connection
            .prepare(&format!("SELECT 1 AS {}", Identifier::new(&name)))
            .expect("the identifier should parse");
        statement.execute([]).expect("the statement should run");

        prop_assert_eq!(
            statement.column_names(),
            [name],
            "DuckDB should name the column with the quoted identifier"
        );
    }
}
