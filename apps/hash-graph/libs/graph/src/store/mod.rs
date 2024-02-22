pub mod crud;
pub mod error;
pub mod query;

pub mod account;
mod config;
pub mod knowledge;
mod migration;
pub mod ontology;
mod pool;
mod record;
mod validation;

mod fetcher;
mod postgres;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

pub use self::{
    account::AccountStore,
    config::{DatabaseConnectionInfo, DatabaseType},
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
    record::{QueryRecord, SubgraphRecord},
    validation::{StoreCache, StoreProvider},
};

/// Describes the API of a store implementation.
///
/// # Errors
///
/// In addition to the errors described in the methods of this trait, further errors might also be
/// raised depending on the implementation, e.g. connection issues.
#[async_trait]
pub trait Store:
    AccountStore + DataTypeStore + PropertyTypeStore + EntityTypeStore + EntityStore
{
}
impl<S> Store for S where
    S: AccountStore + DataTypeStore + PropertyTypeStore + EntityTypeStore + EntityStore
{
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ConflictBehavior {
    /// If a conflict is detected, the operation will fail.
    Fail,
    /// If a conflict is detected, the operation will be skipped.
    Skip,
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
