mod database_type;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use serde::{de::DeserializeOwned, Serialize};
use sqlx::{Executor, PgPool, Postgres};
use uuid::Uuid;

use crate::{
    datastore::{
        error::VersionedUriAlreadyExists, postgres::database_type::DatabaseType,
        BaseUriAlreadyExists, BaseUriDoesNotExist, DatabaseConnectionInfo, Datastore,
        DatastoreError, InsertionError, QueryError, UpdateError,
    },
    types::{
        schema::{DataType, DataTypeReference, EntityType, PropertyType, PropertyTypeReference},
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
    async fn contains_base_uri<'e, E>(executor: E, base_uri: &BaseUri) -> Result<bool, QueryError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let (exists,) =
            sqlx::query_as(r#"SELECT EXISTS(SELECT 1 FROM base_uris WHERE base_uri = $1);"#)
                .bind(base_uri)
                .fetch_one(executor)
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
    async fn contains_uri<'e, E>(executor: E, uri: &VersionedUri) -> Result<bool, QueryError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let (exists,) = sqlx::query_as(
            r#"SELECT EXISTS(SELECT 1 FROM ids WHERE base_uri = $1 AND version = $2);"#,
        )
        .bind(uri.base_uri())
        .bind(i64::from(uri.version()))
        .fetch_one(executor)
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
    async fn insert_uri<'e, E>(
        executor: E,
        uri: &VersionedUri,
        version_id: VersionId,
    ) -> Result<(), InsertionError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let _version_id: (VersionId,) = sqlx::query_as(
            r#"
            INSERT INTO ids (base_uri, version, version_id)
            VALUES ($1, $2, $3)
            RETURNING version_id;
            "#,
        )
        .bind(uri.base_uri())
        .bind(i64::from(uri.version()))
        .bind(version_id)
        .fetch_one(executor)
        .await
        .report()
        .change_context(InsertionError)
        .attach_printable_lazy(|| uri.clone())?;

        Ok(())
    }

    /// Inserts the specified [`BaseUri`] into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    async fn insert_base_uri<'e, E>(executor: E, base_uri: &BaseUri) -> Result<(), InsertionError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let _base_uri: (BaseUri,) = sqlx::query_as(
            r#"
            INSERT INTO base_uris (base_uri) 
            VALUES ($1)
            RETURNING base_uri;
            "#,
        )
        .bind(base_uri)
        .fetch_one(executor)
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
    async fn insert_version_id<'e, E>(
        executor: E,
        version_id: VersionId,
    ) -> Result<(), InsertionError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let _version_id: (VersionId,) = sqlx::query_as(
            r#"
            INSERT INTO version_ids (version_id) 
            VALUES ($1)
            RETURNING version_id;
            "#,
        )
        .bind(version_id)
        .fetch_one(executor)
        .await
        .report()
        .change_context(InsertionError)
        .attach_printable(version_id)?;

        Ok(())
    }

    /// Inserts the specified [`DatabaseType`].
    ///
    /// This first extracts the [`BaseUri`] from the [`VersionedUri`] and attempts to insert it into
    /// the database. It will create a new [`VersionId`] for this [`VersionedUri`] and then finally
    /// inserts the entry.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUri`] already exists
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    async fn create<T>(
        &self,
        database_type: T,
        created_by: AccountId,
    ) -> Result<Qualified<T>, InsertionError>
    where
        T: DatabaseType + Serialize + Send + Sync,
    {
        let uri = database_type.uri();

        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(InsertionError)?;

        if Self::contains_base_uri(&mut transaction, uri.base_uri())
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(BaseUriAlreadyExists)
                .attach_printable(uri.base_uri().clone())
                .change_context(InsertionError));
        }

        Self::insert_base_uri(&mut transaction, uri.base_uri()).await?;

        if Self::contains_uri(&mut transaction, uri)
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(InsertionError)
                .attach_printable(VersionedUriAlreadyExists)
                .attach(uri.clone()));
        }

        let version_id = VersionId::new(Uuid::new_v4());
        Self::insert_version_id(&mut transaction, version_id).await?;
        Self::insert_uri(&mut transaction, uri, version_id).await?;
        Self::insert_with_id(&mut transaction, version_id, &database_type, created_by).await?;

        transaction
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(Qualified::new(version_id, database_type, created_by))
    }

    /// Updates the specified [`DatabaseType`].
    ///
    /// First this ensures the [`BaseUri`] of the type already exists. It then creates a
    /// new [`VersionId`] from the contained [`VersionedUri`] and inserts the type.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUri`] does not already exist
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    async fn update<T>(
        &self,
        database_type: T,
        updated_by: AccountId,
    ) -> Result<Qualified<T>, UpdateError>
    where
        T: DatabaseType + Serialize + Send + Sync,
    {
        let uri = database_type.uri();

        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(UpdateError)?;

        if !Self::contains_base_uri(&mut transaction, uri.base_uri())
            .await
            .change_context(UpdateError)?
        {
            return Err(Report::new(BaseUriDoesNotExist)
                .attach_printable(uri.base_uri().clone())
                .change_context(UpdateError));
        }

        let version_id = VersionId::new(Uuid::new_v4());
        Self::insert_version_id(&mut transaction, version_id)
            .await
            .change_context(UpdateError)?;
        Self::insert_uri(&mut transaction, uri, version_id)
            .await
            .change_context(UpdateError)?;
        Self::insert_with_id(&mut transaction, version_id, &database_type, updated_by)
            .await
            .change_context(UpdateError)?;

        transaction
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(Qualified::new(version_id, database_type, updated_by))
    }

    /// Inserts a [`DatabaseType`] identified by [`VersionId`], and associated with an
    /// [`AccountId`], into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting failed.
    async fn insert_with_id<'e, E, T>(
        executor: E,
        version_id: VersionId,
        database_type: &T,
        created_by: AccountId,
    ) -> Result<(), InsertionError>
    where
        E: Executor<'e, Database = Postgres>,
        T: DatabaseType + Serialize + Sync,
    {
        // SAFETY: We insert a table name here, but `T::table()` is only accessible from within this
        //   module.
        let _version_id: (VersionId,) = sqlx::query_as(&format!(
            r#"
            INSERT INTO {} (version_id, schema, created_by) 
            VALUES ($1, $2, $3)
            RETURNING version_id;
            "#,
            T::table()
        ))
        .bind(version_id)
        .bind(
            serde_json::to_value(database_type)
                .report()
                .change_context(InsertionError)?,
        )
        .bind(created_by)
        .fetch_one(executor)
        .await
        .report()
        .change_context(InsertionError)?;

        Ok(())
    }

    /// Returns the specified [`DatabaseType`].
    ///
    /// # Errors
    ///
    /// - If the specified [`VersionId`] does not already exist.
    // TODO: We can't distinguish between an DB error and a non-existing version currently
    async fn get_by_version<T>(&self, version_id: VersionId) -> Result<Qualified<T>, QueryError>
    where
        T: DatabaseType + DeserializeOwned,
    {
        // SAFETY: We insert a table name here, but `T::table()` is only accessible from within this
        //   module.
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
                .report()
                .change_context(QueryError)?,
            created_by,
        ))
    }

    async fn insert_property_type_references(
        &self,
        property_type: &PropertyType,
    ) -> Result<(), InsertionError> {
        // TODO: Store this as mapping in `property_type_property_type_references`
        let _property_type_ids = self
            .property_type_reference_ids(property_type.property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        // TODO: Store this as mapping in `property_type_data_type_references`
        let _data_type_ids = self
            .data_type_reference_ids(property_type.data_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced data types")?;

        Ok(())
    }

    async fn insert_entity_references(
        &self,
        entity_type: &EntityType,
    ) -> Result<(), InsertionError> {
        // TODO: Store this as mapping in `entity_type_property_types`
        let _property_type_ids = self
            .property_type_reference_ids(entity_type.property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        // TODO: Store link references

        Ok(())
    }

    async fn property_type_reference_ids<'p, I>(
        &self,
        property_type_references: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p PropertyTypeReference> + Send,
        I::IntoIter: Send,
    {
        futures::future::try_join_all(
            property_type_references
                .into_iter()
                .map(|reference| self.version_id_by_uri(reference.uri())),
        )
        .await
    }

    async fn data_type_reference_ids<'p, I>(
        &self,
        data_type_references: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p DataTypeReference> + Send,
        I::IntoIter: Send,
    {
        futures::future::try_join_all(
            data_type_references
                .into_iter()
                .map(|reference| self.version_id_by_uri(reference.uri())),
        )
        .await
    }
}

#[async_trait]
impl Datastore for PostgresDatabase {
    async fn version_id_by_uri(&self, uri: &VersionedUri) -> Result<VersionId, QueryError> {
        let (version_id,) = sqlx::query_as(
            r#"
            SELECT version_id
            FROM ids
            WHERE base_uri = $1 AND version = $2;
            "#,
        )
        .bind(uri.base_uri())
        .bind(i64::from(uri.version()))
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(QueryError)
        .attach_printable_lazy(|| uri.clone())?;

        Ok(version_id)
    }

    async fn create_data_type(
        &self,
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

    async fn update_data_type(
        &self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<Qualified<DataType>, UpdateError> {
        self.update(data_type, updated_by).await
    }

    async fn create_property_type(
        &self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Qualified<PropertyType>, InsertionError> {
        self.insert_property_type_references(&property_type)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for property type")
            .attach_lazy(|| property_type.clone())?;
        self.create(property_type, created_by).await
    }

    async fn get_property_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<PropertyType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn update_property_type(
        &self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<Qualified<PropertyType>, UpdateError> {
        self.insert_property_type_references(&property_type)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for property type")
            .attach_lazy(|| property_type.clone())?;
        self.update(property_type, updated_by).await
    }

    async fn create_entity_type(
        &self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<Qualified<EntityType>, InsertionError> {
        self.insert_entity_references(&entity_type)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;
        self.create(entity_type, created_by).await
    }

    async fn get_entity_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<EntityType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn update_entity_type(
        &self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<Qualified<EntityType>, UpdateError> {
        self.insert_entity_references(&entity_type)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;
        self.update(entity_type, updated_by).await
    }

    async fn create_entity() -> Result<(), InsertionError> {
        todo!()
    }

    async fn get_entity() -> Result<(), QueryError> {
        todo!()
    }

    async fn update_entity() -> Result<(), UpdateError> {
        todo!()
    }
}
