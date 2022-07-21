mod database_type;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use serde::{de::DeserializeOwned, Serialize};
use sqlx::{
    postgres::PgConnectOptions, ConnectOptions, Executor, PgPool, Postgres, Row, Transaction,
};
use tracing::log::LevelFilter;
use uuid::Uuid;

use crate::{
    knowledge::{Entity, EntityId},
    ontology::{
        types::{
            uri::{BaseUri, VersionedUri},
            DataType, DataTypeReference, EntityType, EntityTypeReference, LinkType, Persisted,
            PropertyType, PropertyTypeReference,
        },
        AccountId, VersionId,
    },
    store::{
        error::VersionedUriAlreadyExists, postgres::database_type::DatabaseType,
        BaseUriAlreadyExists, BaseUriDoesNotExist, DatabaseConnectionInfo, InsertionError,
        QueryError, Store, StoreError, UpdateError,
    },
};

/// A Postgres-backed store
#[derive(Clone)]
pub struct PostgresDatabase {
    pub pool: PgPool,
}

impl PostgresDatabase {
    /// Creates a new `PostgresDatabase` object.
    ///
    /// # Errors
    ///
    /// - [`StoreError`], if creating a [`PgPool`] connection returns an error.
    pub async fn new(db_info: &DatabaseConnectionInfo) -> Result<Self, StoreError> {
        tracing::debug!("Creating connection pool to Postgres");
        let mut connection_options = PgConnectOptions::default()
            .username(db_info.user())
            .password(db_info.password())
            .host(db_info.host())
            .port(db_info.port())
            .database(db_info.database());
        connection_options.log_statements(LevelFilter::Trace);
        Ok(Self {
            pool: PgPool::connect_with(connection_options)
                .await
                .report()
                .change_context(StoreError)
                .attach_printable_lazy(|| db_info.clone())?,
        })
    }

    /// Inserts the specified [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountId`] already exists.
    // TODO: Revisit this when having authentication in place
    pub async fn insert_account_id(&self, account_id: AccountId) -> Result<(), InsertionError> {
        self.pool
            .fetch_one(
                sqlx::query(
                    r#"
                    INSERT INTO accounts (account_id)
                    VALUES ($1)
                    RETURNING account_id;
                    "#,
                )
                .bind(account_id),
            )
            .await
            .report()
            .change_context(InsertionError)
            .attach_printable(account_id)?;

        Ok(())
    }

    /// Checks if the specified [`BaseUri`] exists in the database.
    ///
    /// # Errors
    ///
    /// - [`StoreError`], if checking for the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
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
    /// - [`StoreError`], if checking for the [`VersionedUri`] failed.
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
    /// - [`StoreError`], if inserting the [`VersionedUri`] failed.
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
    /// - [`StoreError`], if inserting the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
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
    /// - [`StoreError`], if inserting the [`VersionId`] failed.
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
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
    async fn create<T>(
        transaction: &mut Transaction<'_, Postgres>,
        database_type: T,
        created_by: AccountId,
    ) -> Result<Persisted<T>, InsertionError>
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

        Ok(Persisted::new(version_id, database_type, created_by))
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
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
    async fn update<T>(
        transaction: &mut Transaction<'_, Postgres>,
        database_type: T,
        updated_by: AccountId,
    ) -> Result<Persisted<T>, UpdateError>
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

        Ok(Persisted::new(version_id, database_type, updated_by))
    }

    /// Inserts a [`DatabaseType`] identified by [`VersionId`], and associated with an
    /// [`AccountId`], into the database.
    ///
    /// # Errors
    ///
    /// - [`StoreError`], if inserting failed.
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
    async fn get_by_version<T>(&self, version_id: VersionId) -> Result<Persisted<T>, QueryError>
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

        Ok(Persisted::new(
            version_id,
            serde_json::from_value(row.get(0))
                .report()
                .change_context(QueryError)?,
            row.get(1),
        ))
    }

    async fn insert_property_type_references(
        transaction: &mut Transaction<'_, Postgres>,
        property_type: &Persisted<PropertyType>,
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

    async fn insert_entity_type_references(
        transaction: &mut Transaction<'_, Postgres>,
        entity_type: &Persisted<EntityType>,
    ) -> Result<(), InsertionError> {
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
                        INSERT INTO entity_type_property_type_references (source_entity_type_version_id, target_property_type_version_id)
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

        let (link_type_uris, entity_type_references): (
            Vec<&VersionedUri>,
            Vec<&EntityTypeReference>,
        ) = entity_type
            .inner()
            .link_type_references()
            .into_iter()
            .unzip();

        let link_type_ids = Self::link_type_uris_to_version_ids(transaction, link_type_uris)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced link types")?;

        for target_id in link_type_ids {
            transaction
                .fetch_one(
                    sqlx::query(
                        r#"
                        INSERT INTO entity_type_link_type_references (source_entity_type_version_id, target_link_type_version_id)
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

        let entity_type_reference_ids =
            Self::entity_type_reference_ids(transaction, entity_type_references)
                .await
                .change_context(InsertionError)
                .attach_printable("Could not find referenced entity types")?;

        for target_id in entity_type_reference_ids {
            transaction
                .fetch_one(
                    sqlx::query(
                        r#"
                        INSERT INTO entity_type_entity_type_links (source_entity_type_version_id, target_entity_type_version_id)
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

        Ok(())
    }

    // TODO: Tidy these up by having an `Into<VersionedUri>` method or something for the references
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

    async fn entity_type_reference_ids<'p, I>(
        transaction: &mut Transaction<'_, Postgres>,
        entity_type_references: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p EntityTypeReference> + Send,
        I::IntoIter: Send,
    {
        let entity_type_references = entity_type_references.into_iter();
        let mut ids = Vec::with_capacity(entity_type_references.size_hint().0);
        for reference in entity_type_references {
            ids.push(Self::version_id_by_uri(transaction, reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn link_type_uris_to_version_ids<'p, I>(
        transaction: &mut Transaction<'_, Postgres>,
        link_type_uris: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p VersionedUri> + Send,
        I::IntoIter: Send,
    {
        let link_type_uris = link_type_uris.into_iter();
        let mut ids = Vec::with_capacity(link_type_uris.size_hint().0);
        for uri in link_type_uris {
            ids.push(Self::version_id_by_uri(transaction, uri).await?);
        }
        Ok(ids)
    }

    async fn version_id_by_uri_impl(
        executor: impl Executor<'_, Database = Postgres>,
        uri: &VersionedUri,
    ) -> Result<VersionId, QueryError> {
        Ok(executor
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

    #[allow(
        clippy::same_name_method,
        reason = "This is required because the way SQLx implements their executors"
    )]
    async fn version_id_by_uri(
        transaction: &mut Transaction<'_, Postgres>,
        uri: &VersionedUri,
    ) -> Result<VersionId, QueryError> {
        Self::version_id_by_uri_impl(transaction, uri).await
    }
}

#[async_trait]
impl Store for PostgresDatabase {
    async fn version_id_by_uri(&self, uri: &VersionedUri) -> Result<VersionId, QueryError> {
        Self::version_id_by_uri_impl(&self.pool, uri).await
    }

    async fn create_data_type(
        &self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<Persisted<DataType>, InsertionError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(InsertionError)?;

        let persisted = Self::create(&mut transaction, data_type, created_by).await?;

        transaction
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(persisted)
    }

    async fn get_data_type(
        &self,
        version_id: VersionId,
    ) -> Result<Persisted<DataType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn update_data_type(
        &self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<Persisted<DataType>, UpdateError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(UpdateError)?;

        let persisted = Self::update(&mut transaction, data_type, updated_by).await?;

        transaction
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(persisted)
    }

    async fn create_property_type(
        &self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Persisted<PropertyType>, InsertionError> {
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
    ) -> Result<Persisted<PropertyType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn update_property_type(
        &self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<Persisted<PropertyType>, UpdateError> {
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
    ) -> Result<Persisted<EntityType>, InsertionError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(InsertionError)?;

        let entity_type = Self::create(&mut transaction, entity_type, created_by).await?;

        Self::insert_entity_type_references(&mut transaction, &entity_type)
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
    ) -> Result<Persisted<EntityType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn update_entity_type(
        &self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<Persisted<EntityType>, UpdateError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(UpdateError)?;

        let entity_type = Self::update(&mut transaction, entity_type, updated_by).await?;

        Self::insert_entity_type_references(&mut transaction, &entity_type)
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

    async fn create_link_type(
        &self,
        link_type: LinkType,
        created_by: AccountId,
    ) -> Result<Persisted<LinkType>, InsertionError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(InsertionError)?;

        let persisted = Self::create(&mut transaction, link_type, created_by).await?;

        transaction
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(persisted)
    }

    async fn get_link_type(
        &self,
        version_id: VersionId,
    ) -> Result<Persisted<LinkType>, QueryError> {
        self.get_by_version(version_id).await
    }

    async fn update_link_type(
        &self,
        link_type: LinkType,
        updated_by: AccountId,
    ) -> Result<Persisted<LinkType>, UpdateError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(UpdateError)?;

        let persisted = Self::update(&mut transaction, link_type, updated_by).await?;

        transaction
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(persisted)
    }

    async fn create_entity(
        &self,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        created_by: AccountId,
    ) -> Result<EntityId, InsertionError> {
        let mut transaction = self
            .pool
            .begin()
            .await
            .report()
            .change_context(InsertionError)?;

        let entity_type_id = Self::version_id_by_uri(&mut transaction, &entity_type_uri)
            .await
            .change_context(InsertionError)?;
        let entity_type = self
            .get_by_version::<EntityType>(entity_type_id)
            .await
            .change_context(InsertionError)?;

        entity_type
            .inner()
            .validate(entity)
            .change_context(InsertionError)?;

        let entity_id = EntityId::new(Uuid::new_v4());
        transaction
            .fetch_one(
                sqlx::query(
                    r#"
                    INSERT INTO entities (entity_id, entity_type_version_id, properties, created_by) 
                    VALUES ($1, $2, $3, $4)
                    RETURNING entity_id;
                    "#,
                )
                    .bind(entity_id)
                    .bind(entity_type_id)
                    .bind(
                        serde_json::to_value(entity)
                            .report()
                            .change_context(InsertionError)?,
                    )
                    .bind(created_by),
            )
            .await
            .report()
            .change_context(InsertionError)?;

        transaction
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(entity_id)
    }

    async fn get_entity(&self, entity_id: EntityId) -> Result<Entity, QueryError> {
        let row = self
            .pool
            .fetch_one(
                sqlx::query(
                    r#"
                    SELECT properties
                    FROM entities
                    WHERE entity_id = $1;
                    "#,
                )
                .bind(entity_id),
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(entity_id)?;

        Ok(serde_json::from_value(row.get(0))
            .report()
            .change_context(QueryError)?)
    }

    async fn update_entity(
        &self,
        entity_id: EntityId,
        entity: &Entity,
        updated_by: AccountId,
    ) -> Result<(), UpdateError> {
        todo!()
    }
}
