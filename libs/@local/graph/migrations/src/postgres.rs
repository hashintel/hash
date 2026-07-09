use core::iter;

use error_stack::Report;
use futures::{StreamExt as _, TryStreamExt as _};
use postgres_types::ToSql;
use time::OffsetDateTime;
use tokio_postgres::{Client, GenericClient};
use tracing::Instrument as _;

use crate::{
    Digest, MigrationInfo, MigrationState, StateStore,
    context::{Context, IsolationLevel, Transaction, TransactionBuilder},
};

impl From<IsolationLevel> for tokio_postgres::IsolationLevel {
    fn from(isolation_level: IsolationLevel) -> Self {
        match isolation_level {
            IsolationLevel::ReadCommitted => Self::ReadCommitted,
            IsolationLevel::RepeatableRead => Self::RepeatableRead,
            IsolationLevel::Serializable => Self::Serializable,
        }
    }
}

impl Transaction for tokio_postgres::Transaction<'_> {
    type Error = tokio_postgres::Error;

    async fn commit(self) -> Result<(), Report<Self::Error>> {
        tracing::trace!("Committing transaction");
        self.commit().await.map_err(Report::new)
    }

    async fn rollback(self) -> Result<(), Report<Self::Error>> {
        tracing::trace!("Rolling back transaction");
        self.rollback().await.map_err(Report::new)
    }
}

/// A [`TransactionBuilder`] which delegates to [`Client::build_transaction`].
///
/// All configured options are compiled into the single `BEGIN` statement issued when the builder
/// is awaited, e.g. `START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.
pub struct PostgresTransactionBuilder<'c> {
    builder: tokio_postgres::TransactionBuilder<'c>,
}

impl<'c> IntoFuture for PostgresTransactionBuilder<'c> {
    type Output = Result<tokio_postgres::Transaction<'c>, Report<tokio_postgres::Error>>;

    type IntoFuture = impl Future<Output = Self::Output>;

    fn into_future(self) -> Self::IntoFuture {
        async move {
            tracing::trace!("Starting transaction");
            self.builder.start().await.map_err(Report::new)
        }
    }
}

impl<'c> TransactionBuilder for PostgresTransactionBuilder<'c> {
    type Error = tokio_postgres::Error;
    type Transaction = tokio_postgres::Transaction<'c>;

    fn isolation_level(mut self, isolation_level: IsolationLevel) -> Self {
        self.builder = self.builder.isolation_level(isolation_level.into());
        self
    }

    fn read_only(mut self) -> Self {
        self.builder = self.builder.read_only(true);
        self
    }

    fn deferrable(mut self) -> Self {
        self.builder = self.builder.deferrable(true);
        self
    }
}

impl Context for Client {
    type Error = tokio_postgres::Error;
    type TransactionBuilder<'c>
        = PostgresTransactionBuilder<'c>
    where
        Self: 'c;

    fn transaction(&mut self) -> Self::TransactionBuilder<'_> {
        PostgresTransactionBuilder {
            builder: self.build_transaction(),
        }
    }
}

#[derive(Debug, postgres_types::ToSql, postgres_types::FromSql)]
#[postgres(name = "migration_states")]
struct MigrationStateRow {
    // Postgres does not have a `u32` type, so we use `i64` instead.
    number: i64,
    name: String,
    // Postgres does not have a `usize` type, so we use `i64` instead.
    size: i64,
    digest: Digest,
    applied_on: Option<OffsetDateTime>,
}

impl MigrationStateRow {
    #[expect(
        clippy::cast_lossless,
        clippy::cast_possible_wrap,
        reason = "Postgres does not have a `u32` type so we cast it to `i64` and back"
    )]
    fn from_info(info: MigrationInfo, state: &MigrationState) -> Self {
        Self {
            number: info.number as i64,
            name: info.name.into_owned(),
            size: info.size as i64,
            digest: info.digest,
            applied_on: match state {
                MigrationState::Applied { on } => Some(*on),
                MigrationState::NotApplied => None,
            },
        }
    }

    #[expect(
        clippy::cast_sign_loss,
        clippy::cast_possible_truncation,
        reason = "Postgres does not have a `u32` type so we cast it to `i64` and back"
    )]
    fn into_info(self) -> (MigrationInfo, MigrationState) {
        (
            MigrationInfo {
                number: self.number as u32,
                name: self.name.into(),
                size: self.size as usize,
                digest: self.digest,
            },
            self.applied_on
                .map_or(MigrationState::NotApplied, |on| MigrationState::Applied {
                    on,
                }),
        )
    }
}

impl<C> StateStore for C
where
    C: GenericClient,
{
    type Error = tokio_postgres::Error;

    async fn initialize(&self) -> Result<(), Report<Self::Error>> {
        self.simple_query(
            "
                CREATE TABLE IF NOT EXISTS migration_states (
                    number BIGINT PRIMARY KEY,
                    name TEXT NOT NULL,
                    size BIGINT NOT NULL,
                    digest BYTEA NOT NULL,
                    applied_on TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            ",
        )
        .instrument(tracing::info_span!(
            "CREATE",
            otel.kind = "client",
            db.system = "postgresql",
            peer.service = "Postgres",
        ))
        .await?;

        Ok(())
    }

    async fn add(&self, info: MigrationInfo) -> Result<(), Report<Self::Error>> {
        let info_row = [MigrationStateRow::from_info(
            info,
            &MigrationState::Applied {
                on: OffsetDateTime::now_utc(),
            },
        )];
        let info_row_ref = info_row.as_slice();
        self.execute(
            "
                INSERT INTO migration_states
                SELECT * FROM UNNEST($1::migration_states[]);
            ",
            &[&info_row_ref],
        )
        .instrument(tracing::info_span!(
            "INSERT",
            otel.kind = "client",
            db.system = "postgresql",
            peer.service = "Postgres",
        ))
        .await?;
        Ok(())
    }

    async fn update(&self, info: MigrationInfo) -> Result<(), Report<Self::Error>> {
        let info_row = [MigrationStateRow::from_info(
            info,
            &MigrationState::Applied {
                on: OffsetDateTime::now_utc(),
            },
        )];
        let info_row_ref = info_row.as_slice();
        self.execute(
            "
                UPDATE migration_states
                SET name = data.name,
                    size = data.size,
                    digest = data.digest,
                    applied_on = now()
                FROM (SELECT * FROM UNNEST($1::migration_states[]))
                  AS data(number, name, size, digest)
                WHERE migration_states.number = data.number;
            ",
            &[&info_row_ref],
        )
        .instrument(tracing::info_span!(
            "UPDATE",
            otel.kind = "client",
            db.system = "postgresql",
            peer.service = "Postgres",
        ))
        .await?;
        Ok(())
    }

    async fn get_all(&self) -> Result<Vec<(MigrationInfo, MigrationState)>, Report<Self::Error>> {
        self.query_raw(
            "SELECT ROW(migration_states.*)::migration_states FROM migration_states;",
            iter::empty::<&(dyn ToSql + Sync)>(),
        )
        .instrument(tracing::info_span!(
            "SELECT",
            otel.kind = "client",
            db.system = "postgresql",
            peer.service = "Postgres",
        ))
        .await?
        .map(|row| Ok(row?.try_get::<_, MigrationStateRow>(0)?.into_info()))
        .try_collect()
        .await
    }

    #[expect(
        clippy::cast_lossless,
        reason = "Postgres does not have a `u32` type so we cast it to `i64` and back"
    )]
    async fn remove(
        &self,
        number: u32,
    ) -> Result<Option<(MigrationInfo, MigrationState)>, Report<Self::Error>> {
        self.query_opt(
            "
                DELETE FROM migration_states
                WHERE number = $1
                RETURNING ROW(migration_states.*)::migration_states;
            ",
            &[&(number as i64)],
        )
        .instrument(tracing::info_span!(
            "DELETE",
            otel.kind = "client",
            db.system = "postgresql",
            peer.service = "Postgres",
        ))
        .await?
        .map(|row| Ok(row.try_get::<_, MigrationStateRow>(0)?.into_info()))
        .transpose()
    }
}
