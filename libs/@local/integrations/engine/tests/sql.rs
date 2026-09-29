#![expect(missing_docs, reason = "integration tests")]

use duckdb::Connection;
use hash_integrations_engine::{Identifier, StringLiteral};
use proptest::{prop_assert_eq, proptest};

proptest! {
    #[test]
    fn string_literal_round_trips(text in "(['\"]|[^\\x00])*") {
        let connection = Connection::open_in_memory().expect("should open an in-memory database");

        let value: String = connection
            .query_row(&format!("SELECT {}", StringLiteral::new(&text)), [], |row| row.get(0))
            .expect("the literal should parse");

        prop_assert_eq!(value, text, "DuckDB should read back the quoted text");
    }

    #[test]
    fn identifier_round_trips(name in "(['\"]|[^\\x00])+") {
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
