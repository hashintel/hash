use async_trait::async_trait;
use error_stack::{IntoReport, Result};
use sqlx::PgPool;

use crate::datastore::{Datastore, DatastoreError};

/// A Postgres-backed Datastore
pub struct PostgresDatabase {
    pub pool: PgPool,
}

impl PostgresDatabase {
    /// Creates a new `PostgresDatabase` object
    ///
    /// # Errors
    /// If creating a [`PgPool`] connection returns an error
    pub async fn new(connect_url: &str) -> Result<Self, sqlx::Error> {
        Ok(Self {
            pool: PgPool::connect(connect_url).await.report()?,
        })
    }
}

#[async_trait]
impl Datastore for PostgresDatabase {
    async fn create_data_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_data_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_data_many() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn update_data_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn create_property_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_property_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_property_many() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn update_property_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn create_entity_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_entity_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_entity_type_many() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn update_entity_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn create_entity() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_entity() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_entity_many() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn update_entity() -> Result<(), DatastoreError> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::EntityType;

    const CONNECTION_STRING: &str = "postgres://postgres:postgres@localhost/postgres_graph";

    // TODO - long term we likely want to gate these behind config or something, probably do not
    //  want to add a dependency on the external service for *unit* tests

    #[ignore]
    #[tokio::test]
    async fn can_connect() {
        PostgresDatabase::new(CONNECTION_STRING)
            .await
            .expect("Couldn't connect to the Postgres DB");
    }

    #[ignore]
    #[tokio::test]
    async fn get_entity_types() {
        let pool = sqlx::PgPool::connect(CONNECTION_STRING)
            .await
            .expect("Couldn't connect to the DB");

        let _rows: Vec<EntityType> = sqlx::query_as("SELECT * from entity_types")
            .fetch_all(&pool)
            .await
            .expect("Couldn't select entity types");
    }
}
