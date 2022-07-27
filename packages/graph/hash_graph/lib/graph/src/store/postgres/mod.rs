mod database_type;
mod pool;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use serde::{de::DeserializeOwned, Serialize};
use tokio_postgres::GenericClient;
use uuid::Uuid;

pub use self::pool::{AsClient, PostgresStorePool};
use super::error::LinkActivationError;
use crate::{
    knowledge::{Entity, EntityId, Link, LinkStatus, Links, Outgoing},
    ontology::{
        types::{
            uri::{BaseUri, VersionedUri},
            DataType, DataTypeReference, EntityType, EntityTypeReference, LinkType, Persisted,
            PropertyType, PropertyTypeReference,
        },
        AccountId, VersionId,
    },
    store::{
        error::{EntityDoesNotExist, VersionedUriAlreadyExists},
        postgres::database_type::DatabaseType,
        BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError, Store, UpdateError,
    },
};

/// A Postgres-backed store
pub struct PostgresStore<C> {
    client: C,
}

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    /// Creates a new `PostgresDatabase` object.
    #[must_use]
    pub const fn new(client: C) -> Self {
        Self { client }
    }

    /// Inserts the specified [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountId`] already exists.
    // TODO: Revisit this when having authentication in place
    pub async fn insert_account_id(&self, account_id: AccountId) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO accounts (account_id)
                    VALUES ($1)
                    RETURNING account_id;
                "#,
                &[&account_id],
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
    /// - if checking for the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
    async fn contains_base_uri(&self, base_uri: &BaseUri) -> Result<bool, QueryError> {
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                    SELECT EXISTS(
                        SELECT 1
                        FROM base_uris
                        WHERE base_uri = $1
                    );
                "#,
                &[&base_uri],
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
    /// - if checking for the [`VersionedUri`] failed.
    async fn contains_uri(&self, uri: &VersionedUri) -> Result<bool, QueryError> {
        let version = i64::from(uri.version());
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                    SELECT EXISTS(
                        SELECT 1
                        FROM ids
                        WHERE base_uri = $1 AND version = $2
                    );
                "#,
                &[uri.base_uri(), &version],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable_lazy(|| uri.clone())?
            .get(0))
    }

    /// Inserts the specified [`EntityId`] into the database.
    ///
    /// # Errors
    ///
    /// - if inserting the [`EntityId`] failed.
    async fn insert_entity_id(&self, entity_id: EntityId) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO entity_ids (entity_id)
                    VALUES ($1)
                    RETURNING entity_id;
                "#,
                &[&entity_id],
            )
            .await
            .report()
            .change_context(InsertionError)
            .attach_printable(entity_id)?;

        Ok(())
    }

    /// Checks if the specified [`Entity`] exists in the database.
    ///
    /// # Errors
    ///
    /// - if checking for the [`VersionedUri`] failed.
    async fn contains_entity(&self, entity_id: EntityId) -> Result<bool, QueryError> {
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                    SELECT EXISTS(
                        SELECT 1
                        FROM entity_ids
                        WHERE entity_id = $1
                    );
                "#,
                &[&entity_id],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(entity_id)?
            .get(0))
    }

    /// Inserts the specified [`VersionedUri`] into the database.
    ///
    /// # Errors
    ///
    /// - if inserting the [`VersionedUri`] failed.
    async fn insert_uri(
        &self,
        uri: &VersionedUri,
        version_id: VersionId,
    ) -> Result<(), InsertionError> {
        let version = i64::from(uri.version());
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO ids (base_uri, version, version_id)
                    VALUES ($1, $2, $3)
                    RETURNING version_id;
                "#,
                &[uri.base_uri(), &version, &version_id],
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
    /// - if inserting the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
    async fn insert_base_uri(&self, base_uri: &BaseUri) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO base_uris (base_uri) 
                    VALUES ($1)
                    RETURNING base_uri;
                "#,
                &[&base_uri],
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
    /// - if inserting the [`VersionId`] failed.
    async fn insert_version_id(&self, version_id: VersionId) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO version_ids (version_id) 
                    VALUES ($1)
                    RETURNING version_id;
                "#,
                &[&version_id],
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
        &self,
        database_type: T,
        created_by: AccountId,
    ) -> Result<Persisted<T>, InsertionError>
    where
        T: DatabaseType + Serialize + Send + Sync,
    {
        let uri = database_type.uri();

        if self
            .contains_base_uri(uri.base_uri())
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(BaseUriAlreadyExists)
                .attach_printable(uri.base_uri().clone())
                .change_context(InsertionError));
        }

        self.insert_base_uri(uri.base_uri()).await?;

        if self
            .contains_uri(uri)
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(InsertionError)
                .attach_printable(VersionedUriAlreadyExists)
                .attach(uri.clone()));
        }

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id).await?;
        self.insert_uri(uri, version_id).await?;
        self.insert_with_id(version_id, &database_type, created_by)
            .await?;

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
        &self,
        database_type: T,
        updated_by: AccountId,
    ) -> Result<Persisted<T>, UpdateError>
    where
        T: DatabaseType + Serialize + Send + Sync,
    {
        let uri = database_type.uri();

        if !self
            .contains_base_uri(uri.base_uri())
            .await
            .change_context(UpdateError)?
        {
            return Err(Report::new(BaseUriDoesNotExist)
                .attach_printable(uri.base_uri().clone())
                .change_context(UpdateError));
        }

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id)
            .await
            .change_context(UpdateError)?;
        self.insert_uri(uri, version_id)
            .await
            .change_context(UpdateError)?;
        self.insert_with_id(version_id, &database_type, updated_by)
            .await
            .change_context(UpdateError)?;

        Ok(Persisted::new(version_id, database_type, updated_by))
    }

    /// Inserts a [`DatabaseType`] identified by [`VersionId`], and associated with an
    /// [`AccountId`], into the database.
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    async fn insert_with_id<T>(
        &self,
        version_id: VersionId,
        database_type: &T,
        created_by: AccountId,
    ) -> Result<(), InsertionError>
    where
        T: DatabaseType + Serialize + Sync,
    {
        let value = serde_json::to_value(database_type)
            .report()
            .change_context(InsertionError)?;
        // SAFETY: We insert a table name here, but `T::table()` is only accessible from within this
        //   module.
        self.as_client()
            .query_one(
                &format!(
                    r#"
                        INSERT INTO {} (version_id, schema, created_by)
                        VALUES ($1, $2, $3)
                        RETURNING version_id;
                    "#,
                    T::table()
                ),
                &[&version_id, &value, &created_by],
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
            .client
            .as_client()
            .query_one(
                &format!(
                    r#"
                    SELECT "schema", created_by
                    FROM {}
                    WHERE version_id = $1;
                    "#,
                    T::table()
                ),
                &[&version_id],
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
        &self,
        property_type: &Persisted<PropertyType>,
    ) -> Result<(), InsertionError> {
        let property_type_ids = self
            .property_type_reference_ids(property_type.inner().property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            let version_id = property_type.version_id();
            self.as_client().query_one(
                    r#"
                        INSERT INTO property_type_property_type_references (source_property_type_version_id, target_property_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_property_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .report()
                .change_context(InsertionError)?;
        }

        let data_type_ids = self
            .data_type_reference_ids(property_type.inner().data_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced data types")?;

        for target_id in data_type_ids {
            let version_id = property_type.version_id();
            self.as_client().query_one(
                    r#"
                        INSERT INTO property_type_data_type_references (source_property_type_version_id, target_data_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_property_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    async fn insert_entity_type_references(
        &self,
        entity_type: &Persisted<EntityType>,
    ) -> Result<(), InsertionError> {
        let property_type_ids = self
            .property_type_reference_ids(entity_type.inner().property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            let version_id = entity_type.version_id();
            self.as_client().query_one(
                    r#"
                        INSERT INTO entity_type_property_type_references (source_entity_type_version_id, target_property_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_entity_type_version_id;
                    "#,
                    &[&version_id, &target_id],
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

        let link_type_ids = self
            .link_type_uris_to_version_ids(link_type_uris)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced link types")?;

        for target_id in link_type_ids {
            let version_id = entity_type.version_id();
            self.as_client().query_one(
                    r#"
                        INSERT INTO entity_type_link_type_references (source_entity_type_version_id, target_link_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_entity_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .report()
                .change_context(InsertionError)?;
        }

        let entity_type_reference_ids = self
            .entity_type_reference_ids(entity_type_references)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced entity types")?;

        for target_id in entity_type_reference_ids {
            let version_id = entity_type.version_id();
            self.as_client().query_one(
                    r#"
                        INSERT INTO entity_type_entity_type_links (source_entity_type_version_id, target_entity_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_entity_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    // TODO: Tidy these up by having an `Into<VersionedUri>` method or something for the references
    async fn property_type_reference_ids<'p, I>(
        &self,
        property_type_references: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p PropertyTypeReference> + Send,
        I::IntoIter: Send,
    {
        let property_type_references = property_type_references.into_iter();
        let mut ids = Vec::with_capacity(property_type_references.size_hint().0);
        for reference in property_type_references {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn data_type_reference_ids<'p, I>(
        &self,
        data_type_references: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p DataTypeReference> + Send,
        I::IntoIter: Send,
    {
        let data_type_references = data_type_references.into_iter();
        let mut ids = Vec::with_capacity(data_type_references.size_hint().0);
        for reference in data_type_references {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn entity_type_reference_ids<'p, I>(
        &self,
        entity_type_references: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p EntityTypeReference> + Send,
        I::IntoIter: Send,
    {
        let entity_type_references = entity_type_references.into_iter();
        let mut ids = Vec::with_capacity(entity_type_references.size_hint().0);
        for reference in entity_type_references {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn link_type_uris_to_version_ids<'p, I>(
        &self,
        link_type_uris: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p VersionedUri> + Send,
        I::IntoIter: Send,
    {
        let link_type_uris = link_type_uris.into_iter();
        let mut ids = Vec::with_capacity(link_type_uris.size_hint().0);
        for uri in link_type_uris {
            ids.push(self.version_id_by_uri(uri).await?);
        }
        Ok(ids)
    }

    async fn insert_entity(
        &self,
        entity_id: EntityId,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        account_id: AccountId,
    ) -> Result<EntityId, InsertionError> {
        let entity_type_id = self
            .version_id_by_uri(&entity_type_uri)
            .await
            .change_context(InsertionError)?;

        // TODO: Validate entity against entity type

        let value = serde_json::to_value(entity)
            .report()
            .change_context(InsertionError)?;
        self.as_client().query_one(
                r#"
                    INSERT INTO entities (entity_id, version, entity_type_version_id, properties, created_by) 
                    VALUES ($1, clock_timestamp(), $2, $3, $4)
                    RETURNING entity_id;
                "#,
                &[&entity_id, &entity_type_id, &value, &account_id]
            )
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(entity_id)
    }

    async fn update_link_status(
        &self,
        active: LinkStatus,
        source_entity: EntityId,
        target_entity: EntityId,
        link_type_version_id: VersionId,
    ) -> Result<(), LinkActivationError> {
        self.as_client()
            .query_one(
                r#"
                    UPDATE links 
                    SET active = $1
                    WHERE source_entity_id = $2 AND target_entity_id = $3 AND link_type_version_id = $4
                    RETURNING source_entity_id, target_entity_id, link_type_version_id;
                "#,
                &[&active, &source_entity, &target_entity, &link_type_version_id],
            )
            .await
            .report()
            .change_context(LinkActivationError)?;

        Ok(())
    }
}

#[async_trait]
impl<C> Store for PostgresStore<C>
where
    C: AsClient,
{
    async fn version_id_by_uri(&self, uri: &VersionedUri) -> Result<VersionId, QueryError> {
        let version = i64::from(uri.version());
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                    SELECT version_id
                    FROM ids
                    WHERE base_uri = $1 AND version = $2;
                "#,
                &[uri.base_uri(), &version],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable_lazy(|| uri.clone())?
            .get(0))
    }

    async fn create_data_type(
        &mut self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<Persisted<DataType>, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(InsertionError)?,
        );

        let persisted = transaction.create(data_type, created_by).await?;

        transaction
            .client
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
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<Persisted<DataType>, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(UpdateError)?,
        );

        let persisted = transaction.update(data_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(persisted)
    }

    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Persisted<PropertyType>, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(InsertionError)?,
        );

        let property_type = transaction.create(property_type, created_by).await?;

        transaction
            .insert_property_type_references(&property_type)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for property type")
            .attach_lazy(|| property_type.clone())?;

        transaction
            .client
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
        &mut self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<Persisted<PropertyType>, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(UpdateError)?,
        );

        let property_type = transaction.update(property_type, updated_by).await?;

        transaction
            .insert_property_type_references(&property_type)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for property type")
            .attach_lazy(|| property_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(property_type)
    }

    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<Persisted<EntityType>, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(InsertionError)?,
        );

        let entity_type = transaction.create(entity_type, created_by).await?;

        transaction
            .insert_entity_type_references(&entity_type)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
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
        &mut self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<Persisted<EntityType>, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(UpdateError)?,
        );

        let entity_type = transaction.update(entity_type, updated_by).await?;

        transaction
            .insert_entity_type_references(&entity_type)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(entity_type)
    }

    async fn create_link_type(
        &mut self,
        link_type: LinkType,
        created_by: AccountId,
    ) -> Result<Persisted<LinkType>, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(InsertionError)?,
        );

        let persisted = transaction.create(link_type, created_by).await?;

        transaction
            .client
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
        &mut self,
        link_type: LinkType,
        updated_by: AccountId,
    ) -> Result<Persisted<LinkType>, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(UpdateError)?,
        );

        let persisted = transaction.update(link_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(persisted)
    }

    async fn create_entity(
        &mut self,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        created_by: AccountId,
    ) -> Result<EntityId, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(InsertionError)?,
        );

        let entity_id = EntityId::new(Uuid::new_v4());

        transaction.insert_entity_id(entity_id).await?;
        transaction
            .insert_entity(entity_id, entity, entity_type_uri, created_by)
            .await?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(entity_id)
    }

    async fn get_entity(&self, entity_id: EntityId) -> Result<Entity, QueryError> {
        let row = self
            .client
            .as_client()
            .query_one(
                r#"
                    SELECT properties
                    FROM entities
                    WHERE entity_id = $1 AND version = (
                        SELECT MAX("version")
                        FROM entities
                        WHERE entity_id = $1
                    );
                "#,
                &[&entity_id],
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
        &mut self,
        entity_id: EntityId,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        updated_by: AccountId,
    ) -> Result<(), UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(UpdateError)?,
        );

        if !transaction
            .contains_entity(entity_id)
            .await
            .change_context(UpdateError)?
        {
            return Err(Report::new(EntityDoesNotExist)
                .attach_printable(entity_id)
                .change_context(UpdateError));
        }

        transaction
            .insert_entity(entity_id, entity, entity_type_uri, updated_by)
            .await
            .change_context(UpdateError)?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(())
    }

    async fn create_link(
        &mut self,
        link: Link,
        created_by: AccountId,
    ) -> Result<Link, InsertionError> {
        let link_type_version_id = self
            .version_id_by_uri(link.link_type_uri())
            .await
            .change_context(InsertionError)
            .attach_printable(link.source_entity())?;
        let inserted_link = self.as_client()
            .query_one(
                r#"
                    INSERT INTO links (source_entity_id, target_entity_id, link_type_version_id, multi, multi_order, created_by)
                    VALUES ($1, $2, $3, false, null, $4)
                    RETURNING source_entity_id, target_entity_id, link_type_version_id;
                "#,
                &[&link.source_entity(), &link.target_entity(), &link_type_version_id, &created_by],
            )
            .await;

        if let Err(error) = inserted_link {
            // In the case of inserting a new link errors, we try to update an existing link that
            // has previously been set to inactive
            self.update_link_status(
                LinkStatus::Active,
                link.source_entity(),
                link.target_entity(),
                link_type_version_id,
            )
            .await
            .change_context(InsertionError)
            .attach_printable(created_by)
            .attach_printable(error)
            .attach_lazy(|| link.clone())?;
        }

        Ok(link)
    }

    async fn get_link_target(
        &self,
        source_entity_id: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<Outgoing, QueryError> {
        let version = i64::from(link_type_uri.version());
        let link = self
            .client
            .as_client()
            .query_one(
                r#"
                -- Gather all single-links
                WITH single_links AS (
                    SELECT link_type_version_id, target_entity_id
                    FROM links
                    INNER JOIN ids ON ids.version_id = links.link_type_version_id
                    WHERE active AND NOT multi AND source_entity_id = $1 AND base_uri = $2 AND "version" = $3
                ),
                -- Gather all multi-links
                multi_links AS (
                    SELECT link_type_version_id, ARRAY_AGG(target_entity_id ORDER BY multi_order ASC) AS target_entity_ids
                    FROM links
                    INNER JOIN ids ON ids.version_id = links.link_type_version_id
                    WHERE active AND multi AND source_entity_id = $1 AND base_uri = $2 AND "version" = $3
                    GROUP BY link_type_version_id
                )
                -- Combine single and multi links with null values in rows where the other doesn't exist
                SELECT link_type_version_id, target_entity_id AS single_link, NULL AS multi_link FROM single_links 
                UNION 
                SELECT link_type_version_id, NULL AS single_link, target_entity_ids AS multi_link from multi_links
                "#,
                &[&source_entity_id, link_type_uri.base_uri(), &version],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(source_entity_id)
            .attach_printable(link_type_uri.clone())?;

        let val: (Option<EntityId>, Option<Vec<EntityId>>) = (link.get(1), link.get(2));
        match val {
            (Some(entity_id), None) => Ok(Outgoing::Single(entity_id)),
            (None, Some(entity_ids)) => Ok(Outgoing::Multiple(entity_ids)),
            _ => Err(Report::new(QueryError)
                .attach_printable(source_entity_id)
                .attach_printable(link_type_uri.clone())),
        }
    }

    async fn get_entity_links(&self, source_entity_id: EntityId) -> Result<Links, QueryError> {
        let multi_links = self
            .client
            .as_client()
            .query(
                r#"
                WITH aggregated as (
                    SELECT link_type_version_id, ARRAY_AGG(target_entity_id ORDER BY multi_order ASC) as links
                    FROM links
                    WHERE active AND multi and source_entity_id = $1
                    GROUP BY link_type_version_id
                )
                SELECT base_uri, "version", links FROM aggregated
                INNER JOIN ids ON ids.version_id = aggregated.link_type_version_id
                "#,
                &[&source_entity_id],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(source_entity_id)?
            .into_iter()
            .map(|row| (VersionedUri::new(row.get(0), row.get::<_, i64>(1) as u32), Outgoing::Multiple(row.get(2))));

        let single_links = self
            .client
            .as_client()
            .query(
                r#"
                SELECT base_uri, "version", target_entity_id
                FROM links
                INNER JOIN ids ON ids.version_id = links.link_type_version_id
                WHERE active AND NOT multi and source_entity_id = $1
                "#,
                &[&source_entity_id],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(source_entity_id)?
            .into_iter()
            .map(|row| {
                (
                    VersionedUri::new(row.get(0), row.get::<_, i64>(1) as u32),
                    Outgoing::Single(row.get(2)),
                )
            });

        Ok(Links::new(multi_links.chain(single_links).collect()))
    }

    async fn inactivate_link(&mut self, link: Link) -> Result<(), LinkActivationError> {
        let link_type_version_id = self
            .version_id_by_uri(link.link_type_uri())
            .await
            .change_context(InsertionError)
            .attach_printable(link.source_entity())
            .change_context(LinkActivationError)?;

        self.update_link_status(
            LinkStatus::Inactive,
            link.source_entity(),
            link.target_entity(),
            link_type_version_id,
        )
        .await
        .attach_printable_lazy(|| link.clone())?;

        Ok(())
    }
}
