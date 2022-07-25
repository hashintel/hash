use async_trait::async_trait;
use bb8_postgres::{
    bb8::{ErrorSink, Pool, PooledConnection, RunError},
    PostgresConnectionManager,
};
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::{Client, Config, Error, GenericClient, NoTls, Transaction};

use crate::store::{DatabaseConnectionInfo, PostgresStore, StoreError, StorePool};

pub struct PostgresStorePool {
    pool: Pool<PostgresConnectionManager<NoTls>>,
}

#[derive(Debug, Copy, Clone)]
struct ErrorLogger;

impl ErrorSink<Error> for ErrorLogger {
    fn sink(&self, error: Error) {
        tracing::error!(%error, "Store pool has encountered an error");
    }

    fn boxed_clone(&self) -> Box<dyn ErrorSink<Error>> {
        Box::new(*self)
    }
}

impl PostgresStorePool {
    /// Creates a new `PostgresDatabasePool`.
    ///
    /// # Errors
    ///
    /// - if creating a connection returns an error.
    pub async fn new(db_info: &DatabaseConnectionInfo) -> Result<Self, StoreError> {
        tracing::debug!("Creating connection pool to Postgres");
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
                .build(PostgresConnectionManager::new(config, NoTls))
                .await
                .report()
                .change_context(StoreError)
                .attach_printable_lazy(|| db_info.clone())?,
        })
    }
}

#[async_trait]
impl StorePool for PostgresStorePool {
    type Error = RunError<Error>;
    type Store<'pool> = PostgresStore<PooledConnection<'pool, PostgresConnectionManager<NoTls>>>;

    async fn acquire(&self) -> Result<Self::Store<'_>, Self::Error> {
        Ok(PostgresStore::new(self.pool.get().await?))
    }

    async fn acquire_owned(&self) -> Result<Self::Store<'static>, Self::Error> {
        Ok(PostgresStore::new(self.pool.get_owned().await?))
    }
}

pub trait AsClient: Send + Sync {
    type Client: GenericClient + Send + Sync;

    fn as_client(&self) -> &Self::Client;
    fn as_mut_client(&mut self) -> &mut Self::Client;
}

impl AsClient for PooledConnection<'_, PostgresConnectionManager<NoTls>> {
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

impl<T: AsClient> AsClient for PostgresStore<T> {
    type Client = T::Client;

    fn as_client(&self) -> &Self::Client {
        self.client.as_client()
    }

    fn as_mut_client(&mut self) -> &mut Self::Client {
        self.client.as_mut_client()
    }
}
