use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use sqlx::{postgres::PgConnectOptions, ConnectOptions, PgPool};
use tracing::log::LevelFilter;

use crate::store::{DatabaseConnectionInfo, PostgresDatabase, StoreError, StorePool};

pub struct PostgresDatabasePool {
    pool: PgPool,
}

impl PostgresDatabasePool {
    /// Creates a new `PostgresDatabasePool`.
    ///
    /// # Errors
    ///
    /// - if creating a connection returns an error.
    pub async fn new(db_info: &DatabaseConnectionInfo) -> Result<Self, StoreError> {
        tracing::debug!("Creating connection pool to Postgres");
        let mut connection_options = PgConnectOptions::default()
            .username(db_info.user())
            .password(db_info.password())
            .host(db_info.host())
            .port(db_info.port())
            .database(db_info.database());
        connection_options.log_statements(LevelFilter::Trace);

        Ok(Self {
            pool: PgPool::connect_with(connection_options)
                .await
                .report()
                .change_context(StoreError)
                .attach_printable_lazy(|| db_info.clone())?,
        })
    }
}

#[async_trait]
impl StorePool for PostgresDatabasePool {
    type Error = sqlx::Error;
    type Store = PostgresDatabase;

    async fn acquire(&self) -> Result<Self::Store, Self::Error> {
        Ok(PostgresDatabase::new(self.pool.acquire().await?))
    }
}
