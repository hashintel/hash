//! Bounded current-snapshot extraction from HASH Graph PostgreSQL.
//!
//! The extractor holds one read-only repeatable-read transaction only while
//! copying rows into owned Rust buffers. Permission checks and numerical work
//! run after commit. The snapshot and WAL identities are explicitly local
//! application attestations, not store-issued linearization proofs.

mod error;
#[path = "query.rs"]
mod extraction;
mod model;
mod vector;

use core::num::NonZeroUsize;

use hash_graph_postgres_store::store::{
    AsClient as _, DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hash_graph_store::pool::StorePool as _;
use tokio_postgres::NoTls;

pub(super) use self::{
    error::PostgresExtractionError,
    model::{PostgresExtraction, SnapshotEnvelope},
};
use crate::{
    fit::{FitRequestV1, configuration::LoadedFitWorkerConfiguration},
    salt::{
        ContentHash, ContentHasher,
        fit_boundary::{AuthorizationRevision, AuthorizationRevisionProvider, SnapshotError},
    },
};

pub(super) type FitStore = <PostgresStorePool as hash_graph_store::pool::StorePool>::Store<'static>;

pub(super) struct ConnectedExtraction {
    pub store: FitStore,
    pub extraction: PostgresExtraction,
}

/// Live WAL-based revision sampler for the explicitly optimistic M0 profile.
pub(super) struct OptimisticAuthorizationRevisionProvider<'store> {
    store: &'store FitStore,
}

impl<'store> OptimisticAuthorizationRevisionProvider<'store> {
    #[must_use]
    pub(super) const fn new(store: &'store FitStore) -> Self {
        Self { store }
    }
}

impl AuthorizationRevisionProvider for OptimisticAuthorizationRevisionProvider<'_> {
    async fn authorization_revision(&self) -> Result<AuthorizationRevision, SnapshotError> {
        optimistic_authorization_revision(self.store)
            .await
            .map(AuthorizationRevision::new)
            .map_err(|_error| SnapshotError::AuthorizationRevision)
    }
}

pub(super) async fn connect_and_extract(
    worker: &LoadedFitWorkerConfiguration,
    request: &FitRequestV1,
) -> Result<ConnectedExtraction, PostgresExtractionError> {
    let postgres = &worker.document.postgres;
    let connection = DatabaseConnectionInfo::new(
        DatabaseType::Postgres,
        postgres.user.clone(),
        worker.postgres_password.clone(),
        postgres.host.clone(),
        postgres.port,
        postgres.database.clone(),
    );
    let pool = PostgresStorePool::new(
        &connection,
        &DatabasePoolConfig {
            max_connections: NonZeroUsize::new(1).expect("one connection is non-zero"),
        },
        NoTls,
        PostgresStoreSettings {
            validate_links: false,
            skip_embedding_creation: true,
            ..PostgresStoreSettings::default()
        },
    )
    .await
    .map_err(|report| PostgresExtractionError::Store(report.to_string()))?;
    let mut store = pool
        .acquire_owned(None)
        .await
        .map_err(|report| PostgresExtractionError::Store(report.to_string()))?;
    let transaction = store
        .repeatable_read_transaction()
        .await
        .map_err(|report| PostgresExtractionError::Store(report.to_string()))?;
    let extraction = extraction::extract_current_snapshot(transaction.as_client(), request).await?;
    transaction
        .commit()
        .await
        .map_err(|report| PostgresExtractionError::Store(report.to_string()))?;
    Ok(ConnectedExtraction { store, extraction })
}

pub(super) async fn optimistic_authorization_revision(
    store: &FitStore,
) -> Result<ContentHash, PostgresExtractionError> {
    let row = store
        .as_client()
        .query_one("SELECT current_database(), pg_current_wal_lsn()::text", &[])
        .await?;
    let database: String = row.try_get(0)?;
    let wal: String = row.try_get(1)?;
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.optimistic-wal-revision.v1");
    hasher.update(database.as_bytes());
    hasher.update(wal.as_bytes());
    Ok(hasher.finish())
}
