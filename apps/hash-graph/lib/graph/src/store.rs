pub mod crud;
pub mod error;
pub mod query;
pub mod test_graph;

mod account;
mod config;
mod knowledge;
mod migration;
mod ontology;
mod pool;
mod record;

#[cfg(feature = "type-fetcher")]
mod fetcher;
mod postgres;

use async_trait::async_trait;

#[cfg(feature = "type-fetcher")]
pub use self::fetcher::FetchingPool;
pub use self::{
    account::AccountStore,
    config::{DatabaseConnectionInfo, DatabaseType},
    error::{
        BaseUrlAlreadyExists, InsertionError, OntologyVersionDoesNotExist, QueryError, StoreError,
        UpdateError,
    },
    knowledge::EntityStore,
    migration::{Migration, MigrationState, StoreMigration},
    ontology::{DataTypeStore, EntityTypeStore, PropertyTypeStore},
    pool::StorePool,
    postgres::{AsClient, PostgresStore, PostgresStorePool},
    record::Record,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ConflictBehavior {
    /// If a conflict is detected, the operation will fail.
    Fail,
    /// If a conflict is detected, the operation will be skipped.
    Skip,
}
