mod database_type;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use serde::{de::DeserializeOwned, Serialize};
use sqlx::{Executor, PgPool, Postgres, Row, Transaction};
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
    async fn contains_base_uri(
        transaction: &mut Transaction<'_, Postgres>,
        base_uri: &BaseUri,
    ) -> Result<bool, QueryError> {
        Ok(transaction
            .fetch_one(
                sqlx::query(
                    r#"
                        SELECT EXISTS(
                            SELECT 1
                            FROM base_uris
                            WHERE base_uri = $1
                        );"#,
                )
                .bind(base_uri),
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable_lazy(|| base_uri.clone())?
            .get(0))
    }

    /// Checks if the specified [`VersionedUri`] exists in the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if checking for the [`VersionedUri`] failed.
    async fn contains_uri(
        transaction: &mut Transaction<'_, Postgres>,
        uri: &VersionedUri,
    ) -> Result<bool, QueryError> {
        Ok(transaction
            .fetch_one(
                sqlx::query(
                    r#"
                        SELECT EXISTS(
                            SELECT 1
                            FROM ids
                            WHERE base_uri = $1 AND version = $2
                        );"#,
                )
                .bind(uri.base_uri())
                .bind(i64::from(uri.version())),
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable_lazy(|| uri.clone())?
            .get(0))
    }

    /// Inserts the specified [`VersionedUri`] into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting the [`VersionedUri`] failed.
    async fn insert_uri(
        transaction: &mut Transaction<'_, Postgres>,
        uri: &VersionedUri,
        version_id: VersionId,
    ) -> Result<(), InsertionError> {
        transaction
            .fetch_one(
                sqlx::query(
                    r#"
                    INSERT INTO ids (base_uri, version, version_id)
                    VALUES ($1, $2, $3)
                    RETURNING version_id;
                    "#,
                )
                .bind(uri.base_uri())
                .bind(i64::from(uri.version()))
                .bind(version_id),
            )
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
    async fn insert_base_uri(
        transaction: &mut Transaction<'_, Postgres>,
        base_uri: &BaseUri,
    ) -> Result<(), InsertionError> {
        transaction
            .fetch_one(
                sqlx::query(
                    r#"
                    INSERT INTO base_uris (base_uri) 
                    VALUES ($1)
                    RETURNING base_uri;
                    "#,
                )
                .bind(base_uri),
            )
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
    async fn insert_version_id(
        transaction: &mut Transaction<'_, Postgres>,
        version_id: VersionId,
    ) -> Result<(), InsertionError> {
        transaction
            .fetch_one(
                sqlx::query(
                    r#"
                    INSERT INTO version_ids (version_id) 
                    VALUES ($1)
                    RETURNING version_id;
                    "#,
                )
                .bind(version_id),
            )
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
        transaction: &mut Transaction<'_, Postgres>,
        database_type: T,
        created_by: AccountId,
    ) -> Result<Qualified<T>, InsertionError>
    where
        T: DatabaseType + Serialize + Send + Sync,
    {
        let uri = database_type.uri();

        if Self::contains_base_uri(transaction, uri.base_uri())
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(BaseUriAlreadyExists)
                .attach_printable(uri.base_uri().clone())
                .change_context(InsertionError));
        }

        Self::insert_base_uri(transaction, uri.base_uri()).await?;

        if Self::contains_uri(transaction, uri)
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(InsertionError)
                .attach_printable(VersionedUriAlreadyExists)
                .attach(uri.clone()));
        }

        let version_id = VersionId::new(Uuid::new_v4());
        Self::insert_version_id(transaction, version_id).await?;
        Self::insert_uri(transaction, uri, version_id).await?;
        Self::insert_with_id(transaction, version_id, &database_type, created_by).await?;

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
        transaction: &mut Transaction<'_, Postgres>,
        database_type: T,
        updated_by: AccountId,
    ) -> Result<Qualified<T>, UpdateError>
    where
        T: DatabaseType + Serialize + Send + Sync,
    {
        let uri = database_type.uri();

        if !Self::contains_base_uri(transaction, uri.base_uri())
            .await
            .change_context(UpdateError)?
        {
            return Err(Report::new(BaseUriDoesNotExist)
                .attach_printable(uri.base_uri().clone())
                .change_context(UpdateError));
        }

        let version_id = VersionId::new(Uuid::new_v4());
        Self::insert_version_id(transaction, version_id)
            .await
            .change_context(UpdateError)?;
        Self::insert_uri(transaction, uri, version_id)
            .await
            .change_context(UpdateError)?;
        Self::insert_with_id(transaction, version_id, &database_type, updated_by)
            .await
            .change_context(UpdateError)?;

        Ok(Qualified::new(version_id, database_type, updated_by))
    }

    /// Inserts a [`DatabaseType`] identified by [`VersionId`], and associated with an
    /// [`AccountId`], into the database.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if inserting failed.
    async fn insert_with_id<T>(
        transaction: &mut Transaction<'_, Postgres>,
        version_id: VersionId,
        database_type: &T,
        created_by: AccountId,
    ) -> Result<(), InsertionError>
    where
        T: DatabaseType + Serialize + Sync,
    {
        // SAFETY: We insert a table name here, but `T::table()` is only accessible from within this
        //   module.
        transaction
            .fetch_one(
                sqlx::query(&format!(
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
                .bind(created_by),
            )
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
        let row = self
            .pool
            .fetch_one(
                sqlx::query(&format!(
                    r#"
                    SELECT "schema", created_by
                    FROM {}
                    WHERE version_id = $1;
                    "#,
                    T::table()
                ))
                .bind(version_id),
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(version_id)?;

        Ok(Qualified::new(
            version_id,
            serde_json::from_value(row.get(0))
                .report()
                .change_context(QueryError)?,
            row.get(1),
        ))
    }

    async fn insert_property_type_references(
        transaction: &mut Transaction<'_, Postgres>,
        property_type: &Qualified<PropertyType>,
    ) -> Result<(), InsertionError> {
        let property_type_ids = Self::property_type_reference_ids(
            transaction,
            property_type.inner().property_type_references(),
        )
        .await
        .change_context(InsertionError)
        .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            transaction
                .fetch_one(
                    sqlx::query(
                        r#"
                    INSERT INTO property_type_property_type_references (source_property_type_version_id, target_property_type_version_id)
                    VALUES ($1, $2)
                    RETURNING source_property_type_version_id;
                    "#,
                    )
                        .bind(property_type.version_id())
                        .bind(target_id),
                )
                .await
                .report()
                .change_context(InsertionError)?;
        }

        let data_type_ids = Self::data_type_reference_ids(
            transaction,
            property_type.inner().data_type_references(),
        )
        .await
        .change_context(InsertionError)
        .attach_printable("Could not find referenced data types")?;

        for target_id in data_type_ids {
            transaction
                .fetch_one(
                    sqlx::query(
                        r#"
                    INSERT INTO property_type_data_type_references (source_property_type_version_id, target_data_type_version_id)
                    VALUES ($1, $2)
                    RETURNING source_property_type_version_id;
                    "#,
                    )
                        .bind(property_type.version_id())
                        .bind(target_id),
                )
                .await
                .report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    async fn insert_entity_references(
        transaction: &mut Transaction<'_, Postgres>,
        entity_type: &Qualified<EntityType>,
    ) -> Result<(), InsertionError> {
        // TODO: Store this as mapping in `entity_type_property_type_references`
        let property_type_ids = Self::property_type_reference_ids(
            transaction,
            entity_type.inner().property_type_references(),
        )
        .await
        .change_context(InsertionError)
        .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            transaction
                .fetch_one(
                    sqlx::query(
                        r#"
                    INSERT INTO entity_type_property_types (source_entity_type_version_id, target_property_type_version_id)
                    VALUES ($1, $2)
                    RETURNING source_entity_type_version_id;
                    "#,
                    )
                        .bind(entity_type.version_id())
                        .bind(target_id),
                )
                .await
                .report()
                .change_context(InsertionError)?;
        }

        // TODO: Store link references

        Ok(())
    }

    async fn property_type_reference_ids<'p, I>(
        transaction: &mut Transaction<'_, Postgres>,
        property_type_references: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p PropertyTypeReference> + Send,
        I::IntoIter: Send,
    {
        let property_type_references = property_type_references.into_iter();
        let mut ids = Vec::with_capacity(property_type_references.size_hint().0);
        for reference in property_type_references {
            ids.push(Self::version_id_by_uri(transaction, reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn data_type_reference_ids<'p, I>(
        transaction: &mut Transaction<'_, Postgres>,
        data_type_references: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p DataTypeReference> + Send,
        I::IntoIter: Send,
    {
        let data_type_references = data_type_references.into_iter();
        let mut ids = Vec::with_capacity(data_type_references.size_hint().0);
        for reference in data_type_references {
            ids.push(Self::version_id_by_uri(transaction, reference.uri()).await?);
        }
        Ok(ids)
    }

    /// Fetches the [`VersionId`] of the specified [`VersionedUri`].
    ///
    /// # Errors:
    ///
    /// - if the entry referred to by `uri` does not exist.
    async fn version_id_by_uri(
        transaction: &mut Transaction<'_, Postgres>,
        uri: &VersionedUri,
    ) -> Result<VersionId, QueryError> {
        Ok(transaction
            .fetch_one(
                sqlx::query(
                    r#"
            SELECT version_id
            FROM ids
            WHERE base_uri = $1 AND version = $2;
            "#,
                )
                .bind(uri.base_uri())
                .bind(i64::from(uri.version())),
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable_lazy(|| uri.clone())?
            .get(0))
    }
}

#[async_trait]
impl Datastore for PostgresDatabase {
    async fn create_data_type(
        &self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<Qualified<DataType>, InsertionError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(InsertionError)?;

        let qualified = Self::create(&mut transaction, data_type, created_by).await?;

        transaction
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(qualified)
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
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(UpdateError)?;

        let qualified = Self::update(&mut transaction, data_type, updated_by).await?;

        transaction
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(qualified)
    }

    async fn create_property_type(
        &self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Qualified<PropertyType>, InsertionError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(InsertionError)?;

        let property_type = Self::create(&mut transaction, property_type, created_by).await?;

        Self::insert_property_type_references(&mut transaction, &property_type)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for property type")
            .attach_lazy(|| property_type.clone())?;

        transaction
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(property_type)
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
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(UpdateError)?;

        let property_type = Self::update(&mut transaction, property_type, updated_by).await?;

        Self::insert_property_type_references(&mut transaction, &property_type)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for property type")
            .attach_lazy(|| property_type.clone())?;

        transaction
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(property_type)
    }

    async fn create_entity_type(
        &self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<Qualified<EntityType>, InsertionError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(InsertionError)?;

        let entity_type = Self::create(&mut transaction, entity_type, created_by).await?;

        Self::insert_entity_references(&mut transaction, &entity_type)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(entity_type)
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
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(UpdateError)?;

        let entity_type = Self::update(&mut transaction, entity_type, updated_by).await?;

        Self::insert_entity_references(&mut transaction, &entity_type)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(entity_type)
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
