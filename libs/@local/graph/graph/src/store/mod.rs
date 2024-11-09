pub mod error;

mod config;
mod validation;

pub(crate) mod postgres;

use hash_graph_store::{
    account::AccountStore, data_type::DataTypeStore, entity::EntityStore,
    entity_type::EntityTypeStore, property_type::PropertyTypeStore,
};

pub use self::{
    config::{DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType},
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
