pub mod row_types;

#[cfg(test)]
mod tests {
    use super::row_types::*;

    // Sanity check test, not useful at all. Delete as soon as it makes sense.
    #[ignore]
    #[tokio::test]
    async fn db_works() {
        let pool = sqlx::PgPool::connect("postgres://postgres:postgres@localhost/postgres_graph")
            .await
            .expect("DB to be up and available");

        let rows: Vec<EntityType> = sqlx::query_as("SELECT * from entity_types")
            .fetch_all(&pool)
            .await
            .expect("DB to answer query on entity_types");

        dbg!(rows);
    }
}
