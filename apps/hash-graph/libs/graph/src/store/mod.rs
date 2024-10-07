pub mod crud;
pub mod error;

mod config;
pub mod knowledge;
mod migration;
pub mod ontology;
mod pool;
mod validation;

mod fetcher;
pub(crate) mod postgres;

use hash_graph_store::account::AccountStore;
use serde::Deserialize;
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

pub use self::{
    config::{DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType},
    error::{
        BaseUrlAlreadyExists, InsertionError, OntologyVersionDoesNotExist, QueryError, StoreError,
        UpdateError,
    },
    fetcher::{FetchingPool, FetchingStore, TypeFetcher},
    knowledge::{
        EntityQueryCursor, EntityQuerySorting, EntityQuerySortingRecord, EntityStore,
        EntityValidationType,
    },
    migration::{Migration, MigrationState, StoreMigration},
    ontology::{DataTypeStore, EntityTypeStore, PropertyTypeStore},
    pool::StorePool,
    postgres::{AsClient, PostgresStore, PostgresStorePool},
    validation::{StoreCache, StoreProvider},
};

/// Describes the API of a store implementation.
///
/// # Errors
///
/// In addition to the errors described in the methods of this trait, further errors might also be
/// raised depending on the implementation, e.g. connection issues.
pub trait Store:
    AccountStore + DataTypeStore + PropertyTypeStore + EntityTypeStore + EntityStore
{
}

impl<S> Store for S where
    S: AccountStore + DataTypeStore + PropertyTypeStore + EntityTypeStore + EntityStore
{
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum Ordering {
    Ascending,
    Descending,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum NullOrdering {
    First,
    Last,
}
