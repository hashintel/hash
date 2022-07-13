use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    datastore::{
        BaseIdAlreadyExists, BaseIdDoesNotExist, DatabaseConnectionInfo, Datastore, DatastoreError,
        InsertionError, QueryError, UpdateError,
    },
    types::{
        schema::{DataType, EntityType, PropertyType},
        AccountId, BaseId, Qualified, VersionId,
    },
};

/// A Postgres-backed Datastore
#[derive(Clone)]
pub struct PostgresDatabase {
    pub pool: PgPool,
}

impl PostgresDatabase {
    /// Creates a new `PostgresDatabase` object.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if creating a [`PgPool`] connection returns an error.
    pub async fn new(db_info: &DatabaseConnectionInfo) -> Result<Self, DatastoreError> {
        tracing::debug!("Creating connection pool to Postgres");
        Ok(Self {
            pool: PgPool::connect(&db_info.url())
                .await
                .report()
                .change_context(DatastoreError)
                .attach_printable_lazy(|| db_info.clone())?,
        })
    }

    /// Checks if the specified [`BaseId`] exists in the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if checking for the [`BaseId`] failed.
    async fn contains_base_id(&mut self, base_id: &BaseId) -> Result<bool, QueryError> {
        let (exists,) =
            sqlx::query_as(r#"SELECT EXISTS(SELECT 1 FROM base_ids WHERE base_id = $1);"#)
                .bind(base_id)
                .fetch_one(&self.pool)
                .await
                .report()
                .change_context(QueryError)
                .attach_printable_lazy(|| base_id.clone())?;

        Ok(exists)
    }

    /// Inserts the specified [`BaseId`] into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting the [`BaseId`] failed.
    async fn insert_base_id(&mut self, base_id: &BaseId) -> Result<(), InsertionError> {
        sqlx::query(r#"INSERT INTO base_ids (base_id) VALUES ($1);"#)
            .bind(base_id)
            .execute(&self.pool)
            .await
            .report()
            .change_context(InsertionError)
            .attach_printable_lazy(|| base_id.clone())?;

        Ok(())
    }

    /// Inserts a new [`VersionId`] and associates it with an existing [`BaseId`].
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting failed.
    async fn insert_version_id(
        &mut self,
        version_id: VersionId,
        base_id: &BaseId,
    ) -> Result<(), InsertionError> {
        sqlx::query(r#"INSERT INTO ids (version_id, base_id) VALUES ($1, $2);"#)
            .bind(version_id)
            .bind(base_id)
            .execute(&self.pool)
            .await
            .report()
            .change_context(InsertionError)
            .attach_printable(version_id)?;

        Ok(())
    }

    /// Inserts a [`DataType`] identified by [`VersionId`], and associated with an [`AccountId`],
    /// into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting failed.
    async fn insert_data_type(
        &mut self,
        version_id: VersionId,
        data_type: &DataType,
        created_by: AccountId,
    ) -> Result<(), InsertionError> {
        sqlx::query_as::<_, (Uuid,)>(
            r#"
            INSERT INTO data_types (
                version_id,
                schema,
                created_by
            ) 
            VALUES ($1, $2, $3)
            RETURNING version_id;
            "#,
        )
        .bind(version_id)
        .bind(
            serde_json::to_value(data_type)
                .unwrap_or_else(|err| unreachable!("Could not serialize data type: {err}")),
        )
        .bind(created_by)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(InsertionError)
        .attach_lazy(|| data_type.clone())?;

        Ok(())
    }

    /// Inserts a [`PropertyType`] identified by [`VersionId`], and associated with an
    /// [`AccountId`], into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting failed.
    async fn insert_property_type(
        &mut self,
        version_id: VersionId,
        property_type: &PropertyType,
        created_by: AccountId,
    ) -> Result<(), InsertionError> {
        sqlx::query_as::<_, (Uuid,)>(
            r#"
            INSERT INTO property_types (
                version_id,
                schema,
                created_by
            ) 
            VALUES ($1, $2, $3)
            RETURNING version_id;
            "#,
        )
        .bind(version_id)
        .bind(
            serde_json::to_value(property_type)
                .unwrap_or_else(|err| unreachable!("Could not serialize property type: {err}")),
        )
        .bind(created_by)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(InsertionError)
        .attach_lazy(|| property_type.clone())?;

        Ok(())
    }

    /// Inserts an [`EntityType`] identified by [`VersionId`], and associated with an [`AccountId`],
    /// into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting failed.
    async fn insert_entity_type(
        &mut self,
        version_id: VersionId,
        entity_type: &EntityType,
        created_by: AccountId,
    ) -> Result<(), InsertionError> {
        sqlx::query_as::<_, (Uuid,)>(
            r#"
            INSERT INTO entity_types (
                version_id,
                schema,
                created_by
            ) 
            VALUES ($1, $2, $3)
            RETURNING version_id;
            "#,
        )
        .bind(version_id)
        .bind(
            serde_json::to_value(entity_type)
                .unwrap_or_else(|err| unreachable!("Could not serialize entity type: {err}")),
        )
        .bind(created_by)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(InsertionError)
        .attach_lazy(|| entity_type.clone())?;

        Ok(())
    }
}

#[async_trait]
impl Datastore for PostgresDatabase {
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<Qualified<DataType>, InsertionError> {
        let base_id = data_type.id();

        if self
            .contains_base_id(base_id)
            .await
            .change_context(InsertionError)
            .attach_lazy(|| data_type.clone())?
        {
            return Err(Report::new(InsertionError)
                .attach(data_type.clone())
                .attach_printable(BaseIdAlreadyExists::new(base_id.clone())));
        }
        self.insert_base_id(base_id)
            .await
            .attach_lazy(|| data_type.clone())?;

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id, base_id)
            .await
            .attach_lazy(|| data_type.clone())?;
        self.insert_data_type(version_id, &data_type, created_by)
            .await
            .attach_lazy(|| data_type.clone())?;

        Ok(Qualified::new(version_id, data_type, created_by))
    }

    async fn get_data_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<DataType>, QueryError> {
        let (data_type, created_by) = sqlx::query_as(
            r#"
            SELECT "schema", created_by
            FROM data_types
            WHERE version_id = $1;
            "#,
        )
        .bind(version_id)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(QueryError)
        .attach_printable(version_id)?;

        Ok(Qualified::new(
            version_id,
            serde_json::from_value(data_type)
                .unwrap_or_else(|err| unreachable!("Could not deserialize data type: {err}")),
            created_by,
        ))
    }

    async fn get_data_type_many() -> Result<(), QueryError> {
        todo!()
    }

    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<Qualified<DataType>, UpdateError> {
        let base_id = data_type.id();

        if !self
            .contains_base_id(base_id)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| data_type.clone())?
        {
            return Err(Report::new(UpdateError)
                .attach_printable(BaseIdDoesNotExist)
                .attach_printable(base_id.clone()))
            .attach_lazy(|| data_type.clone())?;
        }

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id, base_id)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| data_type.clone())?;
        self.insert_data_type(version_id, &data_type, updated_by)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| data_type.clone())?;

        Ok(Qualified::new(version_id, data_type, updated_by))
    }

    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Qualified<PropertyType>, InsertionError> {
        let base_id = property_type.id();

        if self
            .contains_base_id(base_id)
            .await
            .change_context(InsertionError)
            .attach_lazy(|| property_type.clone())?
        {
            return Err(Report::new(InsertionError)
                .attach(property_type.clone())
                .attach_printable(BaseIdAlreadyExists::new(base_id.clone())));
        }
        self.insert_base_id(base_id)
            .await
            .attach_lazy(|| property_type.clone())?;

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id, base_id)
            .await
            .attach_lazy(|| property_type.clone())?;
        self.insert_property_type(version_id, &property_type, created_by)
            .await
            .attach_lazy(|| property_type.clone())?;

        Ok(Qualified::new(version_id, property_type, created_by))
    }

    async fn get_property_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<PropertyType>, QueryError> {
        let (property_type, created_by) = sqlx::query_as(
            r#"
            SELECT "schema", created_by
            FROM property_types
            WHERE version_id = $1;
            "#,
        )
        .bind(version_id)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(QueryError)
        .attach_printable(version_id)?;

        Ok(Qualified::new(
            version_id,
            serde_json::from_value(property_type)
                .unwrap_or_else(|err| unreachable!("Could not deserialize property type: {err}")),
            created_by,
        ))
    }

    async fn get_property_type_many() -> Result<(), QueryError> {
        todo!()
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<Qualified<PropertyType>, UpdateError> {
        let base_id = property_type.id();

        if !self
            .contains_base_id(base_id)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| property_type.clone())?
        {
            return Err(Report::new(UpdateError)
                .attach_printable(BaseIdDoesNotExist)
                .attach_printable(base_id.clone()))
            .attach_lazy(|| property_type.clone())?;
        }

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id, base_id)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| property_type.clone())?;
        self.insert_property_type(version_id, &property_type, updated_by)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| property_type.clone())?;

        Ok(Qualified::new(version_id, property_type, updated_by))
    }

    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<Qualified<EntityType>, InsertionError> {
        let base_id = entity_type.id();

        if self
            .contains_base_id(base_id)
            .await
            .change_context(InsertionError)
            .attach_lazy(|| entity_type.clone())?
        {
            return Err(Report::new(InsertionError)
                .attach(entity_type.clone())
                .attach_printable(BaseIdAlreadyExists::new(base_id.clone())));
        }
        self.insert_base_id(base_id)
            .await
            .attach_lazy(|| entity_type.clone())?;

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id, base_id)
            .await
            .attach_lazy(|| entity_type.clone())?;
        self.insert_entity_type(version_id, &entity_type, created_by)
            .await
            .attach_lazy(|| entity_type.clone())?;

        Ok(Qualified::new(version_id, entity_type, created_by))
    }

    async fn get_entity_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<EntityType>, QueryError> {
        let (entity_type, created_by) = sqlx::query_as(
            r#"
            SELECT "schema", created_by
            FROM entity_types
            WHERE version_id = $1;
            "#,
        )
        .bind(version_id)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(QueryError)
        .attach_printable(version_id)?;

        Ok(Qualified::new(
            version_id,
            serde_json::from_value(entity_type)
                .unwrap_or_else(|err| unreachable!("Could not deserialize entity type: {err}")),
            created_by,
        ))
    }

    async fn get_entity_type_many() -> Result<(), QueryError> {
        todo!()
    }

    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<Qualified<EntityType>, UpdateError> {
        let base_id = entity_type.id();

        if !self
            .contains_base_id(base_id)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| entity_type.clone())?
        {
            return Err(Report::new(UpdateError)
                .attach_printable(BaseIdDoesNotExist)
                .attach_printable(base_id.clone()))
            .attach_lazy(|| entity_type.clone())?;
        }

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id, base_id)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| entity_type.clone())?;
        self.insert_entity_type(version_id, &entity_type, updated_by)
            .await
            .change_context(UpdateError)
            .attach_lazy(|| entity_type.clone())?;

        Ok(Qualified::new(version_id, entity_type, updated_by))
    }

    async fn create_entity() -> Result<(), InsertionError> {
        todo!()
    }

    async fn get_entity() -> Result<(), QueryError> {
        todo!()
    }

    async fn get_entity_many() -> Result<(), QueryError> {
        todo!()
    }

    async fn update_entity() -> Result<(), UpdateError> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::LazyLock;

    use super::*;
    use crate::{datastore::DatabaseType, types::AccountId};

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

    /// Removes the [`BaseId`] and all related data from the database.
    // TODO: We don't intend to remove data. This is used for cleaning up the database after running
    //   a test case. Remove this as soon as we have a proper test framework.
    async fn remove_base_id(
        db: &mut PostgresDatabase,
        base_id: &BaseId,
    ) -> Result<(), DatastoreError> {
        sqlx::query(r#"DELETE FROM base_ids WHERE base_id = $1;"#)
            .bind(base_id)
            .execute(&db.pool)
            .await
            .report()
            .change_context(DatastoreError)
            .attach_printable("Could not delete base_id")
            .attach_printable_lazy(|| format!("{base_id:?}"))?;

        Ok(())
    }

    async fn create_account_id(pool: &PgPool) -> Result<AccountId, DatastoreError> {
        let account_id = AccountId::new(Uuid::new_v4());

        sqlx::query(r#"INSERT INTO accounts (account_id) VALUES ($1);"#)
            .bind(&account_id)
            .fetch_all(pool)
            .await
            .report()
            .change_context(DatastoreError)
            .attach_printable("Could not insert account")?;

        Ok(account_id)
    }

    // TODO - long term we likely want to gate these behind config or something, probably do not
    //  want to add a dependency on the external service for *unit* tests
    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn can_connect() -> Result<(), DatastoreError> {
        PostgresDatabase::new(&DB_INFO).await?;

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn get_entity_types() -> Result<(), DatastoreError> {
        let pool = PostgresDatabase::new(&DB_INFO).await?.pool;

        let _rows: Vec<(VersionId, serde_json::Value, AccountId)> =
            sqlx::query_as("SELECT * from entity_types")
                .fetch_all(&pool)
                .await
                .report()
                .change_context(DatastoreError)
                .attach_printable("Could not select entity types")?;

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn create_data_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool)
            .await
            .change_context(DatastoreError)?;

        let data_type = db
            .create_data_type(DataType::number(), account_id)
            .await
            .change_context(DatastoreError)?;

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, data_type.inner().id()).await?;

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn get_data_type_by_identifier() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool).await?;

        let created_data_type = db
            .create_data_type(DataType::boolean(), account_id)
            .await
            .change_context(DatastoreError)?;

        let data_type = db
            .get_data_type(created_data_type.version_id())
            .await
            .change_context(DatastoreError)?;

        assert_eq!(data_type.inner(), created_data_type.inner());

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, data_type.inner().id()).await?;
        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn update_existing_data_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool).await?;

        let data_type = db
            .create_data_type(DataType::object(), account_id)
            .await
            .change_context(DatastoreError)?;

        let updated_data_type = db
            .update_data_type(DataType::object(), account_id)
            .await
            .change_context(DatastoreError)?;

        assert_eq!(data_type.inner(), updated_data_type.inner());
        assert_ne!(data_type.version_id(), updated_data_type.version_id());

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, data_type.inner().id()).await?;
        Ok(())
    }

    fn quote_property_type_v1() -> PropertyType {
        serde_json::from_value(serde_json::json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/favorite-quote",
          "title": "Favorite Quote",
          "oneOf": [
            { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text" }
          ]
        }))
        .expect("Invalid property type")
    }

    fn quote_property_type_v2() -> PropertyType {
        serde_json::from_value(serde_json::json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/favorite-quote",
          "title": "Favourite Quote",
          "oneOf": [
            { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text" }
          ]
        }))
        .expect("Invalid property type")
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn create_property_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool).await?;

        let property_type = db
            .create_property_type(quote_property_type_v1(), account_id)
            .await
            .change_context(DatastoreError)?;

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, property_type.inner().id()).await?;
        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn get_property_type_by_identifier() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool).await?;

        let created_property_type = db
            .create_property_type(quote_property_type_v1(), account_id)
            .await
            .change_context(DatastoreError)?;

        let property_type = db
            .get_property_type(created_property_type.version_id())
            .await
            .change_context(DatastoreError)?;

        assert_eq!(property_type.inner(), created_property_type.inner());

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, property_type.inner().id()).await?;
        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn update_existing_property_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool).await?;

        let property_type = db
            .create_property_type(quote_property_type_v1(), account_id)
            .await
            .change_context(DatastoreError)?;

        let new_property_type = quote_property_type_v2();
        let updated_property_type = db
            .update_property_type(new_property_type.clone(), account_id)
            .await
            .change_context(DatastoreError)?;

        assert_eq!(updated_property_type.inner(), &new_property_type);
        assert_ne!(property_type.inner(), updated_property_type.inner());
        assert_ne!(
            property_type.version_id(),
            updated_property_type.version_id()
        );

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, property_type.inner().id()).await?;
        Ok(())
    }

    fn book_entity_type_v1() -> EntityType {
        serde_json::from_value(serde_json::json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/book/v/1",
            "title": "Book",
            "type": "object",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/name": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name"
                },
                "https://blockprotocol.org/types/@alice/property-type/blurb": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/blurb"
                },
                "https://blockprotocol.org/types/@alice/property-type/published-on": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/published-on"
                }
            },
            "required": [
                "https://blockprotocol.org/types/@alice/property-type/name"
            ],
        }))
        .expect("Invalid entity type")
    }

    fn book_entity_type_v2() -> EntityType {
        // TODO: Update version number
        serde_json::from_value(serde_json::json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/book/v/1",
            "title": "Book",
            "type": "object",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/name": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name"
                },
                "https://blockprotocol.org/types/@alice/property-type/blurb": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/blurb"
                },
                "https://blockprotocol.org/types/@alice/property-type/published-on": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/published-on"
                }
            },
            "required": [
                "https://blockprotocol.org/types/@alice/property-type/name"
            ],
            "links": {
                "https://blockprotocol.org/types/@alice/property-type/written-by": {}
            },
            "requiredLinks": [
                "https://blockprotocol.org/types/@alice/property-type/written-by"
            ],
        }))
        .expect("Invalid entity type")
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn create_entity_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool).await?;

        let entity_type = db
            .create_entity_type(book_entity_type_v1(), account_id)
            .await
            .change_context(DatastoreError)?;

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, entity_type.inner().id()).await?;
        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn get_entity_type_by_identifier() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool).await?;

        let created_entity_type = db
            .create_entity_type(book_entity_type_v1(), account_id)
            .await
            .change_context(DatastoreError)?;

        let entity_type = db
            .get_entity_type(created_entity_type.version_id())
            .await
            .change_context(DatastoreError)?;

        assert_eq!(entity_type.inner(), created_entity_type.inner());

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, entity_type.inner().id()).await?;
        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn update_existing_entity_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;
        let account_id = create_account_id(&db.pool).await?;

        let entity_type = db
            .create_entity_type(book_entity_type_v1(), account_id)
            .await
            .change_context(DatastoreError)?;

        let new_entity_type = book_entity_type_v2();
        let updated_entity_type = db
            .update_entity_type(new_entity_type.clone(), account_id)
            .await
            .change_context(DatastoreError)?;

        assert_eq!(updated_entity_type.inner(), &new_entity_type);
        assert_ne!(entity_type.inner(), updated_entity_type.inner());
        assert_ne!(entity_type.version_id(), updated_entity_type.version_id());

        // Clean up to avoid conflicts in next tests
        remove_base_id(&mut db, entity_type.inner().id()).await?;
        Ok(())
    }
}
