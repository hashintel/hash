use core::error::Error;

use error_stack::Report;

/// The isolation level of a database transaction.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum IsolationLevel {
    /// An individual statement in the transaction will see rows committed before it began.
    ReadCommitted,
    /// All statements in the transaction will see the same view of rows committed before the
    /// first query in the transaction.
    RepeatableRead,
    /// The reads and writes in this transaction must be able to be committed as an atomic "unit"
    /// with respect to reads and writes of all other concurrent serializable transactions
    /// without interleaving.
    Serializable,
}

pub trait Transaction {
    type Error: Error + Send + Sync + 'static;

    async fn commit(self) -> Result<(), Report<Self::Error>>;
    async fn rollback(self) -> Result<(), Report<Self::Error>>;
}

/// A configurable, in-progress request to begin a [`Transaction`].
///
/// The builder is created by [`Context::transaction`] and begins the transaction when awaited.
/// Options adjust the transaction to be begun, e.g. its [`IsolationLevel`] or access mode:
///
/// ```ignore
/// let transaction = context
///     .transaction()
///     .isolation_level(IsolationLevel::RepeatableRead)
///     .read_only()
///     .await?;
/// ```
pub trait TransactionBuilder:
    IntoFuture<Output = Result<Self::Transaction, Report<Self::Error>>>
{
    type Transaction: Transaction;
    type Error: Error + Send + Sync + 'static;

    /// Sets the isolation level of the transaction.
    #[must_use]
    fn isolation_level(self, isolation_level: IsolationLevel) -> Self;

    /// Marks the transaction as read-only.
    #[must_use]
    fn read_only(self) -> Self;

    /// Marks the transaction as deferrable.
    ///
    /// If the transaction is also serializable and read-only, beginning the transaction may
    /// block, but when it completes the transaction is able to run with less overhead and a
    /// guarantee that it will not be aborted due to serialization failure.
    #[must_use]
    fn deferrable(self) -> Self;
}

/// The [`Transaction`] type begun by a [`Context`]'s [`TransactionBuilder`].
pub type ContextTransaction<'c, C> =
    <<C as Context>::TransactionBuilder<'c> as TransactionBuilder>::Transaction;

pub trait Context {
    type Error: Error + Send + Sync + 'static;
    type TransactionBuilder<'c>: TransactionBuilder<Error = Self::Error>
    where
        Self: 'c;

    /// Returns a [`TransactionBuilder`] which begins the transaction when awaited.
    fn transaction(&mut self) -> Self::TransactionBuilder<'_>;
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
