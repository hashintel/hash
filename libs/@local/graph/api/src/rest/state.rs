use alloc::sync::Arc;

use error_stack::Report;
use hash_graph_store::pool::StorePool;
use hash_temporal_client::TemporalClient;

use super::PublicApiConfig;

/// The store pool, the Temporal client and the configuration a handler reads through [`State`].
///
/// [`State`]: axum::extract::State
pub(crate) struct ApiState<S> {
    store: Arc<S>,
    temporal_client: Option<Arc<TemporalClient>>,
    public_api_config: PublicApiConfig,
}

impl<S> ApiState<S> {
    pub(crate) const fn new(
        store: Arc<S>,
        temporal_client: Option<Arc<TemporalClient>>,
        public_api_config: PublicApiConfig,
    ) -> Self {
        Self {
            store,
            temporal_client,
            public_api_config,
        }
    }

    pub(crate) const fn public_api_config(&self) -> PublicApiConfig {
        self.public_api_config
    }
}

impl<S: StorePool> ApiState<S> {
    /// Acquires a store from the pool.
    ///
    /// The store starts the workflows that follow a write, such as computing embeddings, through
    /// the Temporal client.
    ///
    /// # Errors
    ///
    /// Returns the pool's error if no store can be acquired.
    pub(crate) fn acquire(
        &self,
    ) -> impl Future<Output = Result<S::Store<'_>, Report<S::Error>>> + Send {
        self.store.acquire(self.temporal_client.clone())
    }
}

impl<S> Clone for ApiState<S> {
    fn clone(&self) -> Self {
        Self {
            store: Arc::clone(&self.store),
            temporal_client: self.temporal_client.clone(),
            public_api_config: self.public_api_config,
        }
    }
}
