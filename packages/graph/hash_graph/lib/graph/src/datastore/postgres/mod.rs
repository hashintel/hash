use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use sqlx::PgPool;

use crate::datastore::{Datastore, DatastoreError};

/// A Postgres-backed Datastore
pub struct PostgresDatabase {
    pub pool: PgPool,
}

impl PostgresDatabase {
    /// Creates a new `PostgresDatabase` object.
    ///
    /// # Errors
    ///
    /// If creating a [`PgPool`] connection returns an error
    pub async fn new(
        user: &str,
        password: &str,
        host: &str,
        port: u16,
        database: &str,
    ) -> Result<Self, sqlx::Error> {
        Self::from_url(&format!(
            "postgres://{user}:{password}@{host}:{port}/{database}"
        ))
        .await
    }

    /// Creates a new `PostgresDatabase` object
    ///
    /// # Errors
    ///
    /// If creating a [`PgPool`] connection returns an error
    pub async fn from_url(connect_url: &str) -> Result<Self, sqlx::Error> {
        Ok(Self {
            pool: PgPool::connect(connect_url)
                .await
                .report()
                .attach_printable_lazy(|| format!("Could not connect to {connect_url}"))?,
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

    const USER: &str = "postgres";
    const PASSWORD: &str = "postgres";
    const HOST: &str = "localhost";
    const PORT: u16 = 5432;
    const DATABASE: &str = "graph";

    // TODO - long term we likely want to gate these behind config or something, probably do not
    //  want to add a dependency on the external service for *unit* tests

    #[ignore]
    #[tokio::test]
    async fn can_connect() -> Result<(), sqlx::Error> {
        PostgresDatabase::new(USER, PASSWORD, HOST, PORT, DATABASE).await?;

        Ok(())
    }

    #[ignore]
    #[tokio::test]
    async fn get_entity_types() -> Result<(), sqlx::Error> {
        let pool = PostgresDatabase::new(USER, PASSWORD, HOST, PORT, DATABASE)
            .await?
            .pool;

        let _rows: Vec<EntityType> = sqlx::query_as("SELECT * from entity_types")
            .fetch_all(&pool)
            .await
            .report()
            .attach_printable("Could not select entity types")?;

        Ok(())
    }
}
