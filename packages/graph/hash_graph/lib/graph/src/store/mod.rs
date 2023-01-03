pub mod crud;
pub mod error;
pub mod query;

mod account;
mod config;
mod knowledge;
mod ontology;
mod pool;
mod postgres;
mod record;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::{GenericClient, Transaction};

pub use self::{
    account::AccountStore,
    config::{DatabaseConnectionInfo, DatabaseType},
    error::{
        BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError, StoreError,
        UpdateError,
    },
    knowledge::EntityStore,
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
    type Transaction<'t>: Store + Send
    where
        Self: 't;

    async fn transaction(&mut self) -> Result<Self::Transaction<'_>, StoreError>;
}

#[async_trait]
impl<C: AsClient> Store for PostgresStore<C> {
    type Transaction<'t>
    where
        C: 't,
    = PostgresStore<Transaction<'t>>;

    async fn transaction(&mut self) -> Result<Self::Transaction<'_>, StoreError> {
        Ok(PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(StoreError)?,
        ))
    }
}
