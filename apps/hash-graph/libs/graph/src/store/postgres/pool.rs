use alloc::sync::Arc;
use core::{fmt::Debug, num::NonZero, time::Duration};

use async_trait::async_trait;
use authorization::AuthorizationApi;
use bb8_postgres::{
    bb8::{CustomizeConnection, ErrorSink, ManageConnection, Pool, PooledConnection, RunError},
    PostgresConnectionManager,
};
use error_stack::{Report, ResultExt};
use temporal_client::TemporalClient;
use tokio_postgres::{
    tls::{MakeTlsConnect, TlsConnect},
    Client, Config, Error, GenericClient, Socket, Transaction,
};

use crate::store::{
    config::DatabasePoolConfig, DatabaseConnectionInfo, PostgresStore, StoreError, StorePool,
};

pub struct PostgresStorePool<Tls>
where
    Tls: MakeTlsConnect<Socket>,
    PostgresConnectionManager<Tls>: ManageConnection,
{
    pool: Pool<PostgresConnectionManager<Tls>>,
}

#[derive(Debug, Copy, Clone)]
struct ErrorLogger;

impl ErrorSink<Error> for ErrorLogger {
    fn sink(&self, error: Error) {
        tracing::error!(%error, "Store connection pool has encountered an error");
    }

    fn boxed_clone(&self) -> Box<dyn ErrorSink<Error>> {
        Box::new(*self)
    }
}

#[derive(Debug)]
struct OnAcquireLogger;

#[async_trait]
impl<C, E> CustomizeConnection<C, E> for OnAcquireLogger
where
    C: Send + 'static,
    E: 'static,
{
    async fn on_acquire(&self, _connection: &mut C) -> Result<(), E> {
        tracing::info!("Acquiring connection to postgres");
        Ok(())
    }
}

impl<Tls: Clone + Send + Sync + 'static> PostgresStorePool<Tls>
where
    Tls: MakeTlsConnect<
            Socket,
            Stream: Send + Sync,
            TlsConnect: Send + TlsConnect<Socket, Future: Send>,
        >,
{
    /// Creates a new `PostgresDatabasePool`.
    ///
    /// # Errors
    ///
    /// - if creating a connection returns an error.
    #[tracing::instrument(skip(tls))]
    pub async fn new(
        db_info: &DatabaseConnectionInfo,
        pool_config: &DatabasePoolConfig,
        tls: Tls,
    ) -> Result<Self, Report<StoreError>> {
        tracing::debug!(url=%db_info, "Creating connection pool to Postgres");
        let mut config = Config::new();
        config
            .user(db_info.user())
            .password(db_info.password())
            .host(db_info.host())
            .port(db_info.port())
            .dbname(db_info.database());

        Ok(Self {
            pool: Pool::builder()
                .error_sink(Box::new(ErrorLogger))
                .connection_customizer(Box::new(OnAcquireLogger))
                .max_size(pool_config.max_connections.get())
                .min_idle(pool_config.min_idle_connections.map(NonZero::get))
                .max_lifetime(Duration::from_secs(
                    pool_config.max_connection_lifetime.get(),
                ))
                .connection_timeout(Duration::from_secs(pool_config.connection_timeout.get()))
                .idle_timeout(Duration::from_secs(
                    pool_config.connection_idle_timeout.get(),
                ))
                .build(PostgresConnectionManager::new(config, tls))
                .await
                .change_context(StoreError)
                .attach_printable_lazy(|| db_info.clone())?,
        })
    }
}

#[async_trait]
impl<Tls: Clone + Send + Sync + 'static> StorePool for PostgresStorePool<Tls>
where
    Tls: MakeTlsConnect<
            Socket,
            Stream: Send + Sync,
            TlsConnect: Send + TlsConnect<Socket, Future: Send>,
        >,
{
    type Error = RunError<Error>;
    type Store<'pool, A: AuthorizationApi> =
        PostgresStore<PooledConnection<'pool, PostgresConnectionManager<Tls>>, A>;

    async fn acquire<A: AuthorizationApi>(
        &self,
        authorization_api: A,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> Result<Self::Store<'_, A>, Report<Self::Error>> {
        Ok(PostgresStore::new(
            self.pool.get().await?,
            authorization_api,
            temporal_client,
        ))
    }

    async fn acquire_owned<A: AuthorizationApi>(
        &self,
        authorization_api: A,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> Result<Self::Store<'static, A>, Report<Self::Error>> {
        tracing::warn!("Acquiring owned connection from Postgres pool");
        Ok(PostgresStore::new(
            self.pool.get_owned().await?,
            authorization_api,
            temporal_client,
        ))
    }
}

pub trait AsClient: Send + Sync {
    type Client: GenericClient + Send + Sync;

    fn as_client(&self) -> &Self::Client;
    fn as_mut_client(&mut self) -> &mut Self::Client;
}

impl<Tls: Clone + Send + Sync + 'static> AsClient
    for PooledConnection<'_, PostgresConnectionManager<Tls>>
where
    Tls: MakeTlsConnect<
            Socket,
            Stream: Send + Sync,
            TlsConnect: Send + TlsConnect<Socket, Future: Send>,
        >,
{
    type Client = Client;

    fn as_client(&self) -> &Self::Client {
        self
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self
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

impl<C, A> AsClient for PostgresStore<C, A>
where
    C: AsClient,
    A: Send + Sync,
{
    type Client = C::Client;

    fn as_client(&self) -> &Self::Client {
        self.client.as_client()
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self.client.as_mut_client()
    }
}
