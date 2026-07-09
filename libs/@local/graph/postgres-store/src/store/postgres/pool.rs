use alloc::sync::Arc;

use deadpool_postgres::{
    Hook, ManagerConfig, Object, Pool, PoolConfig, PoolError, RecyclingMethod, Timeouts,
};
use error_stack::{Report, ResultExt as _};
use hash_graph_migrations::IsolationLevel;
use hash_graph_store::pool::StorePool;
use hash_temporal_client::TemporalClient;
use tokio_postgres::{
    Client, GenericClient, Socket, Transaction,
    tls::{MakeTlsConnect, TlsConnect},
};

use crate::store::{
    config::{DatabaseConnectionInfo, DatabasePoolConfig},
    error::StoreError,
    postgres::{PostgresStore, PostgresStoreSettings},
};

#[derive(Debug, Clone)]
pub struct PostgresStorePool {
    pool: Pool,
    pub settings: Arc<PostgresStoreSettings>,
}

impl PostgresStorePool {
    /// Creates a new `PostgresDatabasePool`.
    ///
    /// # Errors
    ///
    /// - if creating a connection returns an error.
    #[tracing::instrument(skip(tls))]
    pub async fn new<Tls>(
        db_info: &DatabaseConnectionInfo,
        pool_config: &DatabasePoolConfig,
        tls: Tls,
        settings: PostgresStoreSettings,
    ) -> Result<Self, Report<StoreError>>
    where
        Tls: Clone
            + MakeTlsConnect<
                Socket,
                Stream: Send + Sync,
                TlsConnect: TlsConnect<Socket, Future: Send> + Send + Sync,
            > + Send
            + Sync
            + 'static,
    {
        tracing::debug!(url=%db_info, "Creating connection pool to Postgres");

        let config = deadpool_postgres::Config {
            user: Some(db_info.user().to_owned()),
            password: Some(db_info.password().to_owned()),
            host: Some(db_info.host().to_owned()),
            port: Some(db_info.port()),
            dbname: Some(db_info.database().to_owned()),
            pool: Some(PoolConfig {
                max_size: pool_config.max_connections.get(),
                timeouts: Timeouts {
                    wait: None,
                    create: None,
                    recycle: None,
                },
                ..PoolConfig::default()
            }),
            manager: Some(ManagerConfig {
                recycling_method: RecyclingMethod::Fast,
            }),
            ..deadpool_postgres::Config::default()
        };

        Ok(Self {
            pool: config
                .builder(tls)
                .change_context(StoreError)
                .attach_with(|| db_info.clone())?
                .post_create(Hook::sync_fn(|_client, _metrics| {
                    tracing::info!("Created connection to postgres");
                    Ok(())
                }))
                .build()
                .change_context(StoreError)?,
            settings: Arc::new(settings),
        })
    }
}

impl StorePool for PostgresStorePool {
    type Error = PoolError;
    type Store<'pool> = PostgresStore<Object>;

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
        Ok(PostgresStore::new(
            self.pool.get().await?,
            temporal_client,
            Arc::clone(&self.settings),
        ))
    }
}

/// Options used to begin a database transaction.
///
/// The options are collected by a transaction builder and applied when the transaction is begun,
/// see [`AsClient::begin_transaction`].
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub struct TransactionOptions {
    pub isolation_level: Option<IsolationLevel>,
    pub read_only: bool,
    pub deferrable: bool,
}

pub trait AsClient: Send + Sync {
    type Client: GenericClient + Send + Sync;

    fn as_client(&self) -> &Self::Client;
    fn as_mut_client(&mut self) -> &mut Self::Client;

    /// Begins a database transaction configured with `options`.
    ///
    /// For a [`Client`]-backed store the options are compiled into the single `BEGIN` statement
    /// issued to the database, e.g. `START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ
    /// ONLY`. When called on an already-running [`Transaction`], a savepoint is created instead;
    /// savepoints run within the enclosing transaction and therefore inherit its characteristics,
    /// so the options are ignored.
    fn begin_transaction(
        &mut self,
        options: TransactionOptions,
    ) -> impl Future<Output = Result<Transaction<'_>, tokio_postgres::Error>> + Send;
}

impl AsClient for Object {
    type Client = Client;

    fn as_client(&self) -> &Self::Client {
        self
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self
    }

    async fn begin_transaction(
        &mut self,
        options: TransactionOptions,
    ) -> Result<Transaction<'_>, tokio_postgres::Error> {
        self.as_mut_client().begin_transaction(options).await
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

    async fn begin_transaction(
        &mut self,
        options: TransactionOptions,
    ) -> Result<Transaction<'_>, tokio_postgres::Error> {
        let mut builder = self.build_transaction();
        if let Some(isolation_level) = options.isolation_level {
            builder = builder.isolation_level(isolation_level.into());
        }
        if options.read_only {
            builder = builder.read_only(true);
        }
        if options.deferrable {
            builder = builder.deferrable(true);
        }
        builder.start().await
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

    async fn begin_transaction(
        &mut self,
        options: TransactionOptions,
    ) -> Result<Transaction<'_>, tokio_postgres::Error> {
        if options != TransactionOptions::default() {
            tracing::debug!(
                ?options,
                "transaction options are ignored: a savepoint inherits the characteristics of the \
                 enclosing transaction"
            );
        }
        self.transaction().await
    }
}

impl<C> AsClient for PostgresStore<C>
where
    C: AsClient,
{
    type Client = C::Client;

    fn as_client(&self) -> &Self::Client {
        self.client.as_client()
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self.client.as_mut_client()
    }

    async fn begin_transaction(
        &mut self,
        options: TransactionOptions,
    ) -> Result<Transaction<'_>, tokio_postgres::Error> {
        self.client.begin_transaction(options).await
    }
}
