pub mod row_types;

#[cfg(test)]
mod tests {
    use super::row_types::EntityType;

    // Sanity check test, not useful at all. Delete as soon as it makes sense.
    #[tokio::test]
    async fn db_works() {
        let pool = sqlx::PgPool::connect("postgres://postgres:postgres@localhost/postgres_graph___")
            .await
            .expect("Couldn't connect to the DB");

        let _rows: Vec<EntityType> = sqlx::query_as("SELECT * from entity_types")
            .fetch_all(&pool)
            .await
            .expect("Couldnt't select entity types");
    }
}
