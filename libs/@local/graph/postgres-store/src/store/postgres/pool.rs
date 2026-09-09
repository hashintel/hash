use alloc::sync::Arc;
use core::{
    future::Future,
    ops::{Deref, DerefMut},
};

use deadpool::managed::{Object, Pool};
use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_store::pool::StorePool;
use hash_temporal_client::TemporalClient;
use postgres_types::BorrowToSql;
use tokio_postgres::{Client, Config, GenericClient, Row, ToStatement, Transaction};

use crate::store::{
    config::{DatabaseConnectionInfo, DatabasePoolConfig},
    error::StoreError,
    postgres::{
        PostgresStore, PostgresStoreSettings,
        connection::{ConnectionError, ConnectionManager, ManagedConnection, PostgresTls},
    },
};

/// A connection checked out of a [`PostgresStorePool`], returned to it on drop.
#[derive(Debug)]
pub struct PooledConnection(Object<ConnectionManager>);

impl Deref for PooledConnection {
    type Target = ManagedConnection;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for PooledConnection {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

#[derive(Debug, Clone)]
pub struct PostgresStorePool {
    pool: Pool<ConnectionManager>,
    pub settings: Arc<PostgresStoreSettings>,
}

impl PostgresStorePool {
    /// Creates a pool of connections to the database `db_info` names.
    ///
    /// No connection is established here: the pool builds one when it is first asked for a
    /// connection, so a database that cannot be reached surfaces at [`StorePool::acquire`].
    ///
    /// # Errors
    ///
    /// - if the pool is configured with a timeout but has no runtime to enforce it
    #[tracing::instrument(skip(tls))]
    pub fn new<Tls>(
        db_info: &DatabaseConnectionInfo,
        pool_config: &DatabasePoolConfig,
        tls: Tls,
        settings: PostgresStoreSettings,
    ) -> Result<Self, Report<StoreError>>
    where
        Tls: PostgresTls,
    {
        tracing::debug!(url=%db_info, "Creating connection pool to Postgres");

        let mut config = Config::new();
        config
            .user(db_info.user())
            .password(db_info.password())
            .host(db_info.host())
            .port(db_info.port())
            .dbname(db_info.database());

        Ok(Self {
            // TODO(BE-703): The default timeouts are all unbounded, so a saturated pool waits
            //   forever rather than reporting that it has nothing to give.
            pool: Pool::builder(ConnectionManager::new(config, tls))
                .max_size(pool_config.max_connections.get())
                .build()
                .change_context(StoreError)
                .attach_with(|| db_info.clone())?,
            settings: Arc::new(settings),
        })
    }
}

impl StorePool for PostgresStorePool {
    type Error = ConnectionError;
    type Store<'pool> = PostgresStore<PooledConnection>;

    async fn acquire(
        &self,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> Result<Self::Store<'_>, Report<Self::Error>> {
        self.acquire_owned(temporal_client).await
    }

    async fn acquire_owned(
        &self,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> Result<Self::Store<'static>, Report<Self::Error>> {
        let connection = self.pool.get().await.map_err(ConnectionError::from_pool)?;

        Ok(PostgresStore::new(
            PooledConnection(connection),
            temporal_client,
            Arc::clone(&self.settings),
        ))
    }
}

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

impl From<IsolationLevel> for tokio_postgres::IsolationLevel {
    fn from(isolation_level: IsolationLevel) -> Self {
        match isolation_level {
            IsolationLevel::ReadCommitted => Self::ReadCommitted,
            IsolationLevel::RepeatableRead => Self::RepeatableRead,
            IsolationLevel::Serializable => Self::Serializable,
        }
    }
}

/// Options used to begin a database transaction.
///
/// The options are collected by a [`PostgresStoreTransactionBuilder`] and compiled into the
/// single `START TRANSACTION` statement issued to the database when the transaction is begun,
/// e.g. `START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.
///
/// [`PostgresStoreTransactionBuilder`]: crate::store::PostgresStoreTransactionBuilder
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub struct TransactionOptions {
    pub isolation_level: Option<IsolationLevel>,
    pub read_only: bool,
    pub deferrable: bool,
}

mod sealed {
    pub trait Sealed {}
}

/// A type-level marker describing whether a [`PostgresStore`] is currently inside a database
/// transaction.
///
/// The trait is sealed: the set of states is closed over [`NoTransaction`] and [`InTransaction`].
/// The state determines which transaction APIs exist on the store: a *configurable* top-level
/// transaction ([`PostgresStore::transaction`]) can only be begun in the [`NoTransaction`] state,
/// while a store in the [`InTransaction`] state can only nest by creating savepoints, which have
/// no configurable characteristics of their own.
pub trait TransactionState: sealed::Sealed + Send + Sync + 'static {}

/// Marker for a [`PostgresStore`] which is not inside a database transaction.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct NoTransaction;

impl sealed::Sealed for NoTransaction {}
impl TransactionState for NoTransaction {}

/// Marker for a [`PostgresStore`] which is inside a database transaction.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct InTransaction;

impl sealed::Sealed for InTransaction {}
impl TransactionState for InTransaction {}

pub trait AsClient: Send + Sync {
    type Client: GenericClient + Send + Sync;

    fn as_client(&self) -> &Self::Client;
    fn as_mut_client(&mut self) -> &mut Self::Client;
}

/// The iterator-parameter twin of the row-returning [`GenericClient`] conveniences.
///
/// The compiler yields its statement parameters as an iterator, and the convenience methods
/// take a slice they immediately convert back into an iterator, so every call site would
/// otherwise collect a vector only to satisfy the signature. The twin takes the iterator
/// directly.
pub trait GenericClientIter: GenericClient + Sync {
    /// Executes the statement and collects the resulting rows.
    ///
    /// This is the iterator twin of [`GenericClient::query`], for parameters that arrive as
    /// an iterator rather than a slice.
    ///
    /// # Errors
    ///
    /// Propagates the client's [`tokio_postgres::Error`] when statement preparation,
    /// execution or row streaming fails.
    // The explicit `+ Send` return type stays. An `async fn` here would hide the future's
    // auto traits from callers generic over the client.
    fn query_params_iter<T, I>(
        &self,
        statement: &T,
        parameters: I,
    ) -> impl Future<Output = Result<Vec<Row>, tokio_postgres::Error>> + Send
    where
        T: ?Sized + ToStatement + Sync + Send,
        I: IntoIterator<Item: BorrowToSql, IntoIter: ExactSizeIterator + Send> + Sync + Send,
    {
        async move {
            self.query_raw(statement, parameters)
                .await?
                .try_collect()
                .await
        }
    }
}

impl<C> GenericClientIter for C where C: GenericClient + Sync {}

impl AsClient for PooledConnection {
    type Client = Client;

    fn as_client(&self) -> &Self::Client {
        self.client()
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self.client_mut()
    }
}

impl AsClient for Client {
    type Client = Self;

    fn as_client(&self) -> &Self::Client {
        self
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self
    }
}

impl AsClient for Transaction<'_> {
    type Client = Self;

    fn as_client(&self) -> &Self::Client {
        self
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self
    }
}

impl<C, S> AsClient for PostgresStore<C, S>
where
    C: AsClient,
    S: TransactionState,
{
    type Client = C::Client;

    fn as_client(&self) -> &Self::Client {
        self.client.as_client()
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self.client.as_mut_client()
    }
}
