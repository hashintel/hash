use core::error::Error;

use error_stack::Report;
// use tokio_postgres::{Client, Transaction};

pub trait Transaction {
    type Error: Error + Send + Sync + 'static;

    async fn commit(self) -> Result<(), Report<Self::Error>>;
    async fn rollback(self) -> Result<(), Report<Self::Error>>;
}

pub trait Context {
    type Transaction<'c>: Transaction
    where
        Self: 'c;
    type Error: Error + Send + Sync + 'static;

    async fn transaction(&mut self) -> Result<Self::Transaction<'_>, Report<Self::Error>>;
}

/// Provides the context for a migration.
///
/// Because different migrations may require different contexts, this trait is used to provide the
/// context for a migration. This allows the migration to be agnostic to the context it is run in.
pub trait ContextProvider<C> {
    /// Provides the context for a migration.
    fn provide(&mut self) -> &mut C;
}

impl<T> ContextProvider<Self> for T {
    fn provide(&mut self) -> &mut Self {
        self
    }
}
