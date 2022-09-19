mod knowledge;
mod ontology;

mod context;
mod pool;
mod version_id;

use std::{
    collections::{hash_map::RawEntryMut, HashMap},
    future::Future,
    hash::Hash,
};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use postgres_types::ToSql;
use tokio_postgres::GenericClient;
use type_system::{
    uri::{BaseUri, VersionedUri},
    DataTypeReference, EntityType, EntityTypeReference, PropertyType, PropertyTypeReference,
};
use uuid::Uuid;

pub use self::{
    ontology::PersistedOntologyType,
    pool::{AsClient, PostgresStorePool},
};
use super::error::LinkRemovalError;
use crate::{
    knowledge::{Entity, EntityId, Link, PersistedEntityIdentifier},
    ontology::{AccountId, PersistedOntologyIdentifier},
    store::{
        error::VersionedUriAlreadyExists,
        postgres::{ontology::OntologyDatabaseType, version_id::VersionId},
        AccountStore, BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError,
        UpdateError,
    },
};

pub struct DependencyMap<V, T, D> {
    resolved: HashMap<V, (T, D)>,
}

impl<V, T, D> Default for DependencyMap<V, T, D> {
    fn default() -> Self {
        Self {
            resolved: HashMap::default(),
        }
    }
}

impl<V, T, D> DependencyMap<V, T, D> {
    pub fn new() -> Self {
        Self::default()
    }
}

impl<V, T, D> DependencyMap<V, T, D>
where
    V: Eq + Hash + Clone + Send + Sync,
    T: Send,
    D: PartialOrd + Send,
{
    /// Inserts a dependency into the map.
    ///
    /// If the dependency does not already exist in the dependency map, it will be inserted with the
    /// provided `depth` and a reference to this dependency will be returned in order to continue
    /// resolving it. In the case, that the dependency already exists, the `depth` will be compared
    /// with depth used when inserting it before:
    /// - If the new depth is higher, the depth will be updated and a reference to the dependency
    ///   will be returned in order to keep resolving it
    /// - Otherwise, `None` will be returned as no further resolution is needed
    pub async fn insert<F, R>(
        &mut self,
        identifier: &V,
        depth: D,
        resolver: F,
    ) -> Result<Option<&T>, QueryError>
    where
        F: Fn() -> R + Send + Sync,
        R: Future<Output = Result<T, QueryError>> + Send,
    {
        Ok(match self.resolved.raw_entry_mut().from_key(identifier) {
            RawEntryMut::Vacant(entry) => {
                let value = resolver().await?;
                let (_id, (value, _depth)) = entry.insert(identifier.clone(), (value, depth));
                Some(value)
            }
            RawEntryMut::Occupied(entry) => {
                let (value, used_depth) = entry.into_mut();
                if *used_depth < depth {
                    *used_depth = depth;
                    Some(value)
                } else {
                    None
                }
            }
        })
    }

    pub fn into_vec(self) -> Vec<T> {
        self.resolved.into_values().map(|value| value.0).collect()
    }

    pub fn remove(&mut self, identifier: &V) -> Option<T> {
        self.resolved.remove(identifier).map(|(value, _)| value)
    }
}

pub struct DependencySet<T, D> {
    resolved: HashMap<T, D>,
}

impl<T, D> Default for DependencySet<T, D> {
    fn default() -> Self {
        Self {
            resolved: HashMap::default(),
        }
    }
}

impl<T, D> DependencySet<T, D> {
    pub fn new() -> Self {
        Self::default()
    }
}

impl<T, D> DependencySet<T, D>
where
    T: Eq + Hash + Clone,
    D: PartialOrd + Send,
{
    /// Inserts a dependency into the map.
    ///
    /// If the dependency does not already exist in the dependency set, it will be inserted with the
    /// provided `depth` and a reference to this dependency will be returned in order to continue
    /// resolving it. In the case, that the dependency already exists, the `depth` will be compared
    /// with depth used when inserting it before:
    /// - If the new depth is higher, the depth will be updated and a reference to the dependency
    ///   will be returned in order to keep resolving it
    /// - Otherwise, `None` will be returned as no further resolution is needed
    pub fn insert(&mut self, identifier: &T, depth: D) -> Option<&T> {
        match self.resolved.raw_entry_mut().from_key(identifier) {
            RawEntryMut::Vacant(entry) => {
                let (value, _depth) = entry.insert(identifier.clone(), depth);
                Some(value)
            }
            RawEntryMut::Occupied(entry) => {
                let (value, used_depth) = entry.into_key_value();
                if *used_depth < depth {
                    *used_depth = depth;
                    Some(value)
                } else {
                    None
                }
            }
        }
    }

    pub fn into_vec(self) -> Vec<T> {
        self.resolved.into_keys().collect()
    }

    pub fn remove(&mut self, value: &T) -> Option<T> {
        self.resolved.remove_entry(value).map(|(value, _)| value)
    }
}

/// Utility function used for [`GenericClient::query_raw`] to infer the parameter as
/// [`dyn ToSql`][ToSql].
///
/// [`GenericClient::query_raw`]: tokio_postgres::GenericClient::query_raw
fn parameter_list<const N: usize>(list: [&(dyn ToSql + Sync); N]) -> [&(dyn ToSql + Sync); N] {
    list
}

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

    /// Checks if the specified [`BaseUri`] exists in the database.
    ///
    /// # Errors
    ///
    /// - if checking for the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
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
                &[&base_uri.as_str()],
            )
            .await
            .into_report()
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
                        FROM type_ids
                        WHERE base_uri = $1 AND version = $2
                    );
                "#,
                &[&uri.base_uri().as_str(), &version],
            )
            .await
            .into_report()
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
            .into_report()
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
            .into_report()
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
                    INSERT INTO type_ids (base_uri, version, version_id)
                    VALUES ($1, $2, $3)
                    RETURNING version_id;
                "#,
                &[&uri.base_uri().as_str(), &version, &version_id],
            )
            .await
            .into_report()
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
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn insert_base_uri(&self, base_uri: &BaseUri) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO base_uris (base_uri)
                    VALUES ($1)
                    RETURNING base_uri;
                "#,
                &[&base_uri.as_str()],
            )
            .await
            .into_report()
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
            .into_report()
            .change_context(InsertionError)
            .attach_printable(version_id)?;

        Ok(())
    }

    /// Inserts the specified [`OntologyDatabaseType`].
    ///
    /// This first extracts the [`BaseUri`] from the [`VersionedUri`] and attempts to insert it into
    /// the database. It will create a new [`VersionId`] for this [`VersionedUri`] and then finally
    /// inserts the entry.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUri`] already exists
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create<T>(
        &self,
        database_type: T,
        owned_by_id: AccountId,
    ) -> Result<(VersionId, PersistedOntologyIdentifier), InsertionError>
    where
        T: OntologyDatabaseType + Send + Sync + Into<serde_json::Value>,
    {
        let uri = database_type.versioned_uri().clone();

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
            .contains_uri(&uri)
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(InsertionError)
                .attach_printable(VersionedUriAlreadyExists)
                .attach(uri.clone()));
        }

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id).await?;
        self.insert_uri(&uri, version_id).await?;

        self.insert_with_id(version_id, database_type, owned_by_id)
            .await?;

        Ok((
            version_id,
            PersistedOntologyIdentifier::new(uri, owned_by_id),
        ))
    }

    /// Updates the specified [`OntologyDatabaseType`].
    ///
    /// First this ensures the [`BaseUri`] of the type already exists. It then creates a
    /// new [`VersionId`] from the contained [`VersionedUri`] and inserts the type.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUri`] does not already exist
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn update<T>(
        &self,
        database_type: T,
        updated_by: AccountId,
    ) -> Result<(VersionId, PersistedOntologyIdentifier), UpdateError>
    where
        T: OntologyDatabaseType + Send + Sync + Into<serde_json::Value>,
    {
        let uri = database_type.versioned_uri().clone();

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
        self.insert_uri(&uri, version_id)
            .await
            .change_context(UpdateError)?;
        self.insert_with_id(version_id, database_type, updated_by)
            .await
            .change_context(UpdateError)?;

        Ok((
            version_id,
            PersistedOntologyIdentifier::new(uri, updated_by),
        ))
    }

    /// Inserts an [`OntologyDatabaseType`] identified by [`VersionId`], and associated with an
    /// [`AccountId`], into the database.
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    async fn insert_with_id<T>(
        &self,
        version_id: VersionId,
        database_type: T,
        owned_by_id: AccountId,
    ) -> Result<(), InsertionError>
    where
        T: OntologyDatabaseType + Send + Sync + Into<serde_json::Value>,
    {
        let value: serde_json::Value = database_type.into();
        // Generally bad practice to construct a query without preparation, but it's not possible to
        // pass a table name as a parameter and `T::table()` is well-defined, so this is a safe
        // usage.
        self.as_client()
            .query_one(
                &format!(
                    r#"
                        INSERT INTO {} (version_id, schema, owned_by_id)
                        VALUES ($1, $2, $3)
                        RETURNING version_id;
                    "#,
                    T::table()
                ),
                &[&version_id, &value, &owned_by_id],
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn insert_property_type_references(
        &self,
        property_type: &PropertyType,
        version_id: VersionId,
    ) -> Result<(), InsertionError> {
        let property_type_ids = self
            .property_type_reference_ids(property_type.property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            self.as_client().query_one(
                    r#"
                        INSERT INTO property_type_property_type_references (source_property_type_version_id, target_property_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_property_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        let data_type_ids = self
            .data_type_reference_ids(property_type.data_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced data types")?;

        for target_id in data_type_ids {
            self.as_client().query_one(
                    r#"
                        INSERT INTO property_type_data_type_references (source_property_type_version_id, target_data_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_property_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    async fn insert_entity_type_references(
        &self,
        entity_type: &EntityType,
        version_id: VersionId,
    ) -> Result<(), InsertionError> {
        let property_type_ids = self
            .property_type_reference_ids(entity_type.property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            self.as_client().query_one(
                    r#"
                        INSERT INTO entity_type_property_type_references (source_entity_type_version_id, target_property_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_entity_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        let (link_type_ids, entity_type_references): (
            Vec<&VersionedUri>,
            Vec<&EntityTypeReference>,
        ) = entity_type.link_type_references().into_iter().unzip();

        let link_type_ids = self
            .link_type_ids_to_version_ids(link_type_ids)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced link types")?;

        for target_id in link_type_ids {
            self.as_client().query_one(
                    r#"
                        INSERT INTO entity_type_link_type_references (source_entity_type_version_id, target_link_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_entity_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        let entity_type_reference_ids = self
            .entity_type_reference_ids(entity_type_references)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced entity types")?;

        for target_id in entity_type_reference_ids {
            self.as_client().query_one(
                    r#"
                        INSERT INTO entity_type_entity_type_links (source_entity_type_version_id, target_entity_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_entity_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    // TODO: Tidy these up by having an `Into<VersionedUri>` method or something for the references
    async fn property_type_reference_ids<'p, I>(
        &self,
        referenced_property_types: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p PropertyTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_property_types = referenced_property_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_property_types.size_hint().0);
        for reference in referenced_property_types {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn data_type_reference_ids<'p, I>(
        &self,
        referenced_data_types: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p DataTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_data_types = referenced_data_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_data_types.size_hint().0);
        for reference in referenced_data_types {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn entity_type_reference_ids<'p, I>(
        &self,
        referenced_entity_types: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p EntityTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_entity_types = referenced_entity_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_entity_types.size_hint().0);
        for reference in referenced_entity_types {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn link_type_ids_to_version_ids<'p, I>(
        &self,
        link_type_ids: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p VersionedUri> + Send,
        I::IntoIter: Send,
    {
        let link_type_ids = link_type_ids.into_iter();
        let mut ids = Vec::with_capacity(link_type_ids.size_hint().0);
        for uri in link_type_ids {
            ids.push(self.version_id_by_uri(uri).await?);
        }
        Ok(ids)
    }

    async fn insert_entity(
        &self,
        entity_id: EntityId,
        entity: Entity,
        entity_type_id: VersionedUri,
        account_id: AccountId,
    ) -> Result<PersistedEntityIdentifier, InsertionError> {
        let entity_type_id = self
            .version_id_by_uri(&entity_type_id)
            .await
            .change_context(InsertionError)?;

        // TODO: Validate entity against entity type
        //  https://app.asana.com/0/0/1202629282579257/f

        let value = serde_json::to_value(entity)
            .into_report()
            .change_context(InsertionError)?;
        let version = self.as_client().query_one(
                r#"
                    INSERT INTO entities (entity_id, version, entity_type_version_id, properties, owned_by_id)
                    VALUES ($1, clock_timestamp(), $2, $3, $4)
                    RETURNING version;
                "#,
                &[&entity_id, &entity_type_id, &value, &account_id]
            )
            .await
            .into_report()
            .change_context(InsertionError)?.get(0);

        Ok(PersistedEntityIdentifier::new(
            entity_id, version, account_id,
        ))
    }

    /// Fetches the [`VersionId`] of the specified [`VersionedUri`].
    ///
    /// # Errors:
    ///
    /// - if the entry referred to by `uri` does not exist.
    async fn version_id_by_uri(&self, uri: &VersionedUri) -> Result<VersionId, QueryError> {
        let version = i64::from(uri.version());
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                SELECT version_id
                FROM type_ids
                WHERE base_uri = $1 AND version = $2;
                "#,
                &[&uri.base_uri().as_str(), &version],
            )
            .await
            .into_report()
            .change_context(QueryError)
            .attach_printable_lazy(|| uri.clone())?
            .get(0))
    }

    /// Inserts a [`Link`] associated with an [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if the [`Link`] exists already
    /// - if the [`Link`]s link type doesn't exist
    /// - if inserting the link failed.
    async fn insert_link(&self, link: &Link, owned_by_id: AccountId) -> Result<(), InsertionError> {
        let link_type_version_id = self
            .version_id_by_uri(link.link_type_id())
            .await
            .change_context(InsertionError)
            .attach_printable(link.source_entity())?;

        self.as_client()
        .query_one(
            // TODO: Currently we insert `null` for the `link_order`, this needs to change as we
            //   implement ordered links.
            //   https://app.asana.com/0/1202805690238892/1202937382769278/f
            r#"
            INSERT INTO links (source_entity_id, target_entity_id, link_type_version_id, link_order, owned_by_id, created_at)
            VALUES ($1, $2, $3, null, $4, clock_timestamp())
            RETURNING source_entity_id, target_entity_id, link_type_version_id;
            "#,
            &[&link.source_entity(), &link.target_entity(), &link_type_version_id, &owned_by_id],
        )
        .await
        .into_report()
        .change_context(InsertionError)
        .attach_printable(owned_by_id)
        .attach_lazy(|| link.clone())?;

        Ok(())
    }

    /// Moves a [`Link`] associated with an [`AccountId`] from the `links` table into the
    /// `link_histories` table.
    ///
    /// # Errors
    ///
    /// - if the [`Link`] doesn't exist
    /// - if the [`Link`]s link type doesn't exist
    /// - if inserting the link failed.
    async fn move_link_to_history(
        &self,
        link: &Link,
        removed_by_id: AccountId,
    ) -> Result<(), LinkRemovalError> {
        let link_type_version_id = self
            .version_id_by_uri(link.link_type_id())
            .await
            .change_context(InsertionError)
            .attach_printable(link.source_entity())
            .change_context(LinkRemovalError)?;

        self.as_client()
            .query_one(
                // This query removes a link from the `links` table and then immediately inserts
                // into the link_histories table.
                r#"
                WITH removed AS (
                    DELETE FROM links
                    WHERE source_entity_id = $1
                        AND target_entity_id = $2
                        AND link_type_version_id = $3
                    RETURNING source_entity_id, target_entity_id, link_type_version_id,
                    link_order, owned_by_id, created_at
                )
                INSERT INTO link_histories(source_entity_id, target_entity_id, link_type_version_id,
                    link_order, owned_by_id, created_at, removed_by_id, removed_at)
                -- When inserting into `link_histories`, `removed_by_id` and `removed_at` are provided
                SELECT *, $4, clock_timestamp() FROM removed
                RETURNING source_entity_id, target_entity_id, link_type_version_id;
                "#,
                &[
                    &link.source_entity(),
                    &link.target_entity(),
                    &link_type_version_id,
                    &removed_by_id,
                ],
            )
            .await
            .into_report()
            .change_context(LinkRemovalError)?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> AccountStore for PostgresStore<C> {
    async fn insert_account_id(&mut self, account_id: AccountId) -> Result<(), InsertionError> {
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
            .into_report()
            .change_context(InsertionError)
            .attach_printable(account_id)?;

        Ok(())
    }
}
