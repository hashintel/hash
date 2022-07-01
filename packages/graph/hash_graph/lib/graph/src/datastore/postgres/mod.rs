mod row_types;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use sqlx::PgPool;

use crate::datastore::{DatabaseConnectionInfo, Datastore, DatastoreError};

/// A Postgres-backed Datastore
pub struct PostgresDatabase {
    pub pool: PgPool,
}

impl PostgresDatabase {
    /// Creates a new `PostgresDatabase` object
    ///
    /// # Errors
    ///
    /// If creating a [`PgPool`] connection returns an error
    pub async fn new(db_info: &DatabaseConnectionInfo) -> Result<Self, sqlx::Error> {
        Ok(Self {
            pool: PgPool::connect(&db_info.url())
                .await
                .report()
                .attach_printable_lazy(|| db_info.clone())?,
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
    use std::sync::LazyLock;

    use super::{row_types::EntityTypeRow, *};
    use crate::datastore::DatabaseType;

    const USER: &str = "postgres";
    const PASSWORD: &str = "postgres";
    const HOST: &str = "localhost";
    const PORT: u16 = 5432;
    const DATABASE: &str = "graph";

    static DB_INFO: LazyLock<DatabaseConnectionInfo> = LazyLock::new(|| {
        DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            USER.to_owned(),
            PASSWORD.to_owned(),
            HOST.to_owned(),
            PORT,
            DATABASE.to_owned(),
        )
    });

    // TODO - long term we likely want to gate these behind config or something, probably do not
    //  want to add a dependency on the external service for *unit* tests
    #[ignore]
    #[tokio::test]
    async fn can_connect() -> Result<(), sqlx::Error> {
        PostgresDatabase::new(&DB_INFO).await?;

        Ok(())
    }

    #[ignore]
    #[tokio::test]
    async fn get_entity_types() -> Result<(), sqlx::Error> {
        let pool = PostgresDatabase::new(&DB_INFO).await?.pool;

        let _rows: Vec<EntityTypeRow> = sqlx::query_as("SELECT * from entity_types")
            .fetch_all(&pool)
            .await
            .report()
            .attach_printable("Could not select entity types")?;

        Ok(())
    }
}
