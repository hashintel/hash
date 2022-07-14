mod database_type;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use serde::{de::DeserializeOwned, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    datastore::{
        error::VersionedUriAlreadyExists, postgres::database_type::DataBaseType,
        BaseUriAlreadyExists, BaseUriDoesNotExist, DatabaseConnectionInfo, Datastore,
        DatastoreError, InsertionError, QueryError, UpdateError,
    },
    types::{
        schema::{DataType, EntityType, PropertyType},
        AccountId, BaseUri, Qualified, VersionId, VersionedUri,
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

    /// Checks if the specified [`BaseUri`] exists in the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if checking for the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    async fn contains_base_uri(&mut self, base_uri: &BaseUri) -> Result<bool, QueryError> {
        let (exists,) =
            sqlx::query_as(r#"SELECT EXISTS(SELECT 1 FROM base_uris WHERE base_uri = $1);"#)
                .bind(base_uri)
                .fetch_one(&self.pool)
                .await
                .report()
                .change_context(QueryError)
                .attach_printable_lazy(|| base_uri.clone())?;

        Ok(exists)
    }

    /// Checks if the specified [`VersionedUri`] exists in the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if checking for the [`VersionedUri`] failed.
    async fn contains_uri(&mut self, uri: &VersionedUri) -> Result<bool, QueryError> {
        let (exists,) = sqlx::query_as(
            r#"SELECT EXISTS(SELECT 1 FROM ids WHERE base_uri = $1 AND version = $2);"#,
        )
        .bind(uri.base_uri())
        .bind(i64::from(uri.version()))
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(QueryError)
        .attach_printable_lazy(|| uri.clone())?;

        Ok(exists)
    }

    /// Inserts the specified [`VersionedUri`] into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting the [`VersionedUri`] failed.
    async fn insert_uri(&mut self, uri: &VersionedUri) -> Result<VersionId, InsertionError> {
        if self
            .contains_uri(uri)
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(InsertionError)
                .attach_printable(VersionedUriAlreadyExists)
                .attach(uri.clone()));
        }

        // TODO: Make this a transaction
        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id).await?;

        sqlx::query(r#"INSERT INTO ids (base_uri, version, version_id) VALUES ($1, $2, $3);"#)
            .bind(uri.base_uri())
            .bind(i64::from(uri.version()))
            .bind(version_id)
            .execute(&self.pool)
            .await
            .report()
            .change_context(InsertionError)
            .attach_printable_lazy(|| uri.clone())?;

        Ok(version_id)
    }

    /// Inserts the specified [`BaseUri`] into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    async fn insert_base_uri(&mut self, base_uri: &BaseUri) -> Result<(), InsertionError> {
        sqlx::query(r#"INSERT INTO base_uris (base_uri) VALUES ($1);"#)
            .bind(base_uri)
            .execute(&self.pool)
            .await
            .report()
            .change_context(InsertionError)
            .attach_printable_lazy(|| base_uri.clone())?;

        Ok(())
    }

    /// Inserts the specified [`VersionId`] into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting the [`VersionId`] failed.
    async fn insert_version_id(&mut self, version_id: VersionId) -> Result<(), InsertionError> {
        sqlx::query(r#"INSERT INTO version_ids (version_id) VALUES ($1);"#)
            .bind(version_id)
            .execute(&self.pool)
            .await
            .report()
            .change_context(InsertionError)
            .attach_printable(version_id)?;

        Ok(())
    }

    async fn create<T>(
        &mut self,
        database_type: T,
        created_by: AccountId,
    ) -> Result<Qualified<T>, InsertionError>
    where
        T: DataBaseType + Serialize + Send + Sync,
    {
        let uri = database_type.id();

        if self
            .contains_base_uri(uri.base_uri())
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(InsertionError)
                .attach_printable(BaseUriAlreadyExists)
                .attach_printable(uri.base_uri().clone()));
        }

        self.insert_base_uri(uri.base_uri()).await?;

        let version_id = self.insert_uri(uri).await?;

        self.insert_with_id(version_id, &database_type, created_by)
            .await?;

        Ok(Qualified::new(version_id, database_type, created_by))
    }

    async fn update<T>(
        &mut self,
        database_type: T,
        updated_by: AccountId,
    ) -> Result<Qualified<T>, UpdateError>
    where
        T: DataBaseType + Serialize + Send + Sync,
    {
        let uri = database_type.id();

        if !self
            .contains_base_uri(uri.base_uri())
            .await
            .change_context(UpdateError)?
        {
            return Err(Report::new(UpdateError)
                .attach_printable(BaseUriDoesNotExist)
                .attach_printable(uri.base_uri().clone()));
        }

        let version_id = self.insert_uri(uri).await.change_context(UpdateError)?;

        self.insert_with_id(version_id, &database_type, updated_by)
            .await
            .change_context(UpdateError)?;

        Ok(Qualified::new(version_id, database_type, updated_by))
    }

    /// Inserts a [`DataBaseType`] identified by [`VersionId`], and associated with an
    /// [`AccountId`], into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting failed.
    async fn insert_with_id<T>(
        &mut self,
        version_id: VersionId,
        database_type: &T,
        created_by: AccountId,
    ) -> Result<(), InsertionError>
    where
        T: DataBaseType + Serialize + Sync,
    {
        sqlx::query(&format!(
            r#"
            INSERT INTO {} (
                version_id,
                schema,
                created_by
            ) 
            VALUES ($1, $2, $3);
            "#,
            T::table()
        ))
        .bind(version_id)
        .bind(
            serde_json::to_value(database_type)
                .unwrap_or_else(|err| unreachable!("Could not serialize data type: {err}")),
        )
        .bind(created_by)
        .execute(&self.pool)
        .await
        .report()
        .change_context(InsertionError)?;

        Ok(())
    }

    async fn get_by_version<T: DataBaseType + DeserializeOwned>(
        &mut self,
        version_id: VersionId,
    ) -> Result<Qualified<T>, QueryError> {
        let (data_type, created_by) = sqlx::query_as(&format!(
            r#"
            SELECT "schema", created_by
            FROM {}
            WHERE version_id = $1;
            "#,
            T::table()
        ))
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
}

#[async_trait]
impl Datastore for PostgresDatabase {
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<Qualified<DataType>, InsertionError> {
        self.create(data_type, created_by).await
    }

    async fn get_data_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<DataType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn get_data_type_many() -> Result<(), QueryError> {
        todo!()
    }

    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<Qualified<DataType>, UpdateError> {
        self.update(data_type, updated_by).await
    }

    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Qualified<PropertyType>, InsertionError> {
        self.create(property_type, created_by).await
    }

    async fn get_property_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<PropertyType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn get_property_type_many() -> Result<(), QueryError> {
        todo!()
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<Qualified<PropertyType>, UpdateError> {
        self.update(property_type, updated_by).await
    }

    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<Qualified<EntityType>, InsertionError> {
        self.create(entity_type, created_by).await
    }

    async fn get_entity_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<EntityType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn get_entity_type_many() -> Result<(), QueryError> {
        todo!()
    }

    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<Qualified<EntityType>, UpdateError> {
        self.update(entity_type, updated_by).await
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
    use std::{collections::HashMap, sync::LazyLock};

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

    /// Removes the [`BaseUri`] and all related data from the database.
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    // TODO: We don't intend to remove data. This is used for cleaning up the database after running
    //   a test case. Remove this as soon as we have a proper test framework.
    async fn remove_base_uri(
        db: &mut PostgresDatabase,
        base_uri: &BaseUri,
    ) -> Result<(), DatastoreError> {
        sqlx::query(r#"DELETE FROM base_uris WHERE base_uri = $1;"#)
            .bind(base_uri)
            .execute(&db.pool)
            .await
            .report()
            .change_context(DatastoreError)
            .attach_printable("Could not delete base_uri")
            .attach_printable_lazy(|| format!("{base_uri:?}"))?;

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
        remove_base_uri(&mut db, data_type.inner().id().base_uri()).await?;

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
        remove_base_uri(&mut db, data_type.inner().id().base_uri()).await?;
        Ok(())
    }

    /// Returns the primitive `Object` data type.
    #[must_use]
    pub fn object_v2() -> DataType {
        DataType::new(
            VersionedUri::new(
                "https://blockprotocol.org/types/@blockprotocol/data-type/object".to_owned(),
                2,
            ),
            "Object".to_owned(),
            Some("A plain JSON object with no pre-defined structure".to_owned()),
            "object".to_owned(),
            HashMap::default(),
        )
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
            .update_data_type(object_v2(), account_id)
            .await
            .change_context(DatastoreError)?;

        assert_ne!(data_type.inner(), updated_data_type.inner());
        assert_ne!(data_type.version_id(), updated_data_type.version_id());

        // Clean up to avoid conflicts in next tests
        remove_base_uri(&mut db, data_type.inner().id().base_uri()).await?;
        Ok(())
    }

    fn quote_property_type_v1() -> PropertyType {
        serde_json::from_value(serde_json::json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/favorite-quote/v/1",
          "title": "Favorite Quote",
          "oneOf": [
            { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text/v/1" }
          ]
        }))
        .expect("Invalid property type")
    }

    fn quote_property_type_v2() -> PropertyType {
        serde_json::from_value(serde_json::json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/favorite-quote/v/2",
          "title": "Favourite Quote",
          "oneOf": [
            { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text/v/1" }
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
        remove_base_uri(&mut db, property_type.inner().id().base_uri()).await?;
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
        remove_base_uri(&mut db, property_type.inner().id().base_uri()).await?;
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
        remove_base_uri(&mut db, property_type.inner().id().base_uri()).await?;
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
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name/v/1"
                },
                "https://blockprotocol.org/types/@alice/property-type/blurb": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/blurb/v/1"
                },
                "https://blockprotocol.org/types/@alice/property-type/published-on": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/published-on/v/1"
                }
            },
            "required": [
                "https://blockprotocol.org/types/@alice/property-type/name"
            ],
        }))
        .expect("Invalid entity type")
    }

    fn book_entity_type_v2() -> EntityType {
        serde_json::from_value(serde_json::json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/book/v/2",
            "title": "Book",
            "type": "object",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/name": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name/v/1"
                },
                "https://blockprotocol.org/types/@alice/property-type/blurb": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/blurb/v/1"
                },
                "https://blockprotocol.org/types/@alice/property-type/published-on": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/published-on/v/1"
                }
            },
            "required": [
                "https://blockprotocol.org/types/@alice/property-type/name"
            ],
            "links": {
                "https://blockprotocol.org/types/@alice/property-type/written-by/v/1": {}
            },
            "requiredLinks": [
                "https://blockprotocol.org/types/@alice/property-type/written-by/v/1"
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
        remove_base_uri(&mut db, entity_type.inner().id().base_uri()).await?;
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
        remove_base_uri(&mut db, entity_type.inner().id().base_uri()).await?;
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
        remove_base_uri(&mut db, entity_type.inner().id().base_uri()).await?;
        Ok(())
    }
}
