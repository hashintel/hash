//! Verifies hand-maintained schema facts in the query compiler against the live database.
#![expect(
    unreachable_pub,
    reason = "the shared test helper is included via `#[path]` and used by multiple test crates"
)]

#[path = "common/mod.rs"]
mod common;

use hash_graph_postgres_store::store::{
    AsClient as _,
    postgres::query::{Column, ColumnName, TableName, Transpile as _},
};

#[tokio::test]
async fn non_null_columns_match_the_schema() {
    let database = common::DatabaseTestWrapper::new().await;
    let client = database.connection.as_client();

    for &column in Column::NON_NULL_COLUMNS {
        let table = TableName::from(column.table()).transpile_to_string();
        let name = ColumnName::from(column).transpile_to_string();
        let table = table.trim_matches('"');
        let name = name.trim_matches('"');

        let row = client
            .query_opt(
                "SELECT is_nullable FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
                &[&table, &name],
            )
            .await
            .expect("the schema lookup should succeed")
            .unwrap_or_else(|| {
                panic!("`{table}.{name}` is whitelisted but does not exist in the schema")
            });

        let is_nullable: &str = row.get(0);
        assert_eq!(
            is_nullable, "NO",
            "`{table}.{name}` is whitelisted as non-null but nullable in the schema, remove it \
             from `Column::NON_NULL_COLUMNS`"
        );
    }
}
