mod row_types;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    datastore::{DatabaseConnectionInfo, Datastore, DatastoreError},
    types::{DataType, Identifier},
};

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

async fn insert_version_id(
    pool: &sqlx::Pool<sqlx::Postgres>,
    id: &Identifier,
) -> Result<(), DatastoreError> {
    sqlx::query(r#"INSERT INTO ids (version_id, id) VALUES ($1, $2);"#)
        .bind(&id.version_id)
        .bind(&id.base_id)
        .execute(pool)
        .await
        .report()
        .change_context(DatastoreError)
        .attach_printable_lazy(|| id.clone())
        .attach_printable("Could not insert id")?;

    Ok(())
}

#[async_trait]
impl Datastore for PostgresDatabase {
    /// Creates a new [`DataType`]
    ///
    /// # Errors
    ///
    /// If the account referred to by `created_by` does not exist
    async fn create_data_type(
        &self,
        schema: serde_json::Value,
        created_by: Uuid,
    ) -> Result<DataType, DatastoreError> {
        let id = Identifier {
            base_id: Uuid::new_v4(),
            version_id: Uuid::new_v4(),
        };

        insert_version_id(&self.pool, &id).await?;

        sqlx::query(
            r#"
            INSERT INTO data_types (
                version_id,
                schema,
                created_by
            ) values ($1, $2, $3)
            returning version_id;
            "#,
        )
        .bind(&id.version_id)
        .bind(&schema)
        .bind(&created_by)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(DatastoreError)
        .attach_printable("Could not insert data type")?;

        Ok(DataType {
            id,
            schema,
            created_by,
        })
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

    #[ignore]
    #[tokio::test]
    async fn create_data_type() -> Result<(), sqlx::Error> {
        let db = PostgresDatabase::new(&DB_INFO).await?;

        // This account_id must be created manually.
        let account_id = uuid::uuid!("67e55044-10b1-426f-9247-bb680e5fe0c2");

        db.create_data_type(serde_json::json!({"hello": "world"}), account_id)
            .await
            .expect("Could not create data type");

        Ok(())
    }
}
