pub mod crud;
pub mod error;
pub mod knowledge;
pub mod ontology;

mod config;
mod pool;
mod validation;

mod fetcher;
pub(crate) mod postgres;

use hash_graph_store::{account::AccountStore, data_type::DataTypeStore};
use serde::Deserialize;
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

pub use self::{
    config::{DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType},
    fetcher::{FetchingPool, FetchingStore, TypeFetcher},
    pool::StorePool,
    postgres::{AsClient, PostgresStore, PostgresStorePool},
    validation::{StoreCache, StoreProvider},
};
use crate::store::{
    knowledge::EntityStore,
    ontology::{EntityTypeStore, PropertyTypeStore},
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
