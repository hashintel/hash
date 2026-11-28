use alloc::sync::Arc;

use axum::extract::FromRef;
use error_stack::Report;
use hash_graph_store::{filter::protection::PropertyProtectionFilterConfig, pool::StorePool};
use hash_temporal_client::TemporalClient;

use super::{PublicApiConfig, internal::CompilerState};

/// The store pool, the Temporal client and the configuration a handler reads through [`State`].
///
/// [`State`]: axum::extract::State
pub(crate) struct ApiState<S> {
    pub mut(self) store: Arc<S>,
    pub mut(self) temporal_client: Option<Arc<TemporalClient>>,
    pub mut(self) public_api_config: PublicApiConfig,
    pub mut(self) compiler: Arc<CompilerState>,
    pub mut(self) filter_protection: Arc<PropertyProtectionFilterConfig<'static>>,
}

impl<S: StorePool> ApiState<S> {
    pub(crate) const fn new(
        store: Arc<S>,
        temporal_client: Option<Arc<TemporalClient>>,
        public_api_config: PublicApiConfig,
        compiler: Arc<CompilerState>,
        filter_protection: Arc<PropertyProtectionFilterConfig<'static>>,
    ) -> Self {
        Self {
            store,
            temporal_client,
            public_api_config,
            compiler,
            filter_protection,
        }
    }

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
            compiler: Arc::clone(&self.compiler),
            filter_protection: Arc::clone(&self.filter_protection),
        }
    }
}

impl<S> FromRef<ApiState<S>> for Arc<CompilerState> {
    fn from_ref(input: &ApiState<S>) -> Self {
        Self::clone(&input.compiler)
    }
}

impl<S> FromRef<ApiState<S>> for Arc<S>
where
    S: StorePool,
{
    fn from_ref(input: &ApiState<S>) -> Self {
        Self::clone(&input.store)
    }
}

impl<S> FromRef<ApiState<S>> for Option<Arc<TemporalClient>> {
    fn from_ref(input: &ApiState<S>) -> Self {
        input.temporal_client.clone()
    }
}

pub(crate) struct FilterProtection(pub Arc<PropertyProtectionFilterConfig<'static>>);

impl<S> FromRef<ApiState<S>> for FilterProtection {
    fn from_ref(input: &ApiState<S>) -> Self {
        Self(Arc::clone(&input.filter_protection))
    }
}
