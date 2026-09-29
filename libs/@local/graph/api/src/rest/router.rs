//! Assembly of the Graph HTTP APIs and their shared middleware.

use alloc::sync::Arc;

use axum::{Extension, Router};
use hash_graph_authorization::policies::store::{PolicyStore, PrincipalStore};
use hash_graph_embeddings::OpenAiEmbeddingClient;
use hash_graph_postgres_store::store::PostgresStorePool;
use hash_graph_store::pool::StorePool;
use hash_middleware::{authentication::AuthenticationMetrics, rate_limit::RateLimiters};
use hash_temporal_client::TemporalClient;
use opentelemetry::metrics::Meter;
use sentry::integrations::tower::{NewSentryLayer, SentryHttpLayer};
use tower::ServiceBuilder;
use type_system::ontology::json_schema::DomainValidator;

use super::{
    authentication, documentation,
    legacy::{self, ApiConfig, QueryLogger, RestApiStore, entity::ClusteringContext, hashql},
    middleware::Middleware,
    probe, rate_limit, telemetry,
};

pub struct Dependencies<S> {
    pub store: Arc<S>,
    pub postgres: PostgresStorePool,
    pub temporal_client: Option<Arc<TemporalClient>>,
    pub embedding_client: Option<Arc<OpenAiEmbeddingClient>>,
    pub domain_regex: DomainValidator,
    pub query_logger: Option<QueryLogger>,
    pub api_config: ApiConfig,
    pub session_auth: authentication::KratosSessionConfig,
    pub cloudflare_access: Option<authentication::CloudflareAccessConfig>,
    pub service_secret: String,
    pub rate_limit: rate_limit::RateLimitConfig,
    pub meter: Meter,
    pub compiler: Arc<hashql::CompilerContext>,
    pub clustering: Arc<ClusteringContext>,
}

/// Builds the Graph HTTP router with legacy routes, public and internal APIs, and documentation.
///
/// # Panics
///
/// Panics when called outside a Tokio runtime, if routes overlap, if an OpenAPI document does not
/// generate or serialize, or if the documentation routes cannot be built from the embedded Scalar
/// bundle and configuration.
pub fn router<S>(dependencies: Dependencies<S>) -> Router
where
    S: StorePool + Send + Sync + 'static,
    for<'p> S::Store<'p>: RestApiStore + PrincipalStore + PolicyStore,
{
    let environment = Arc::new(
        dependencies
            .cloudflare_access
            .map(|config| authentication::build_environment_provider(config, &dependencies.store)),
    );
    let explicit = || {
        authentication::build_explicit_providers(
            dependencies.service_secret.clone(),
            &dependencies.store,
        )
    };
    let public_provider = Arc::new((explicit(), Arc::clone(&environment)));
    let internal_provider = Arc::new((
        explicit(),
        (
            authentication::build_session_providers(
                dependencies.session_auth,
                &dependencies.store,
                &dependencies.meter,
            ),
            environment,
        ),
    ));
    let rate_limit_config =
        hash_middleware::rate_limit::RateLimitConfig::from(&dependencies.rate_limit);
    let middleware = Middleware {
        public_provider,
        internal_provider,
        service_secret: Arc::from(dependencies.service_secret),
        authentication_metrics: Arc::new(AuthenticationMetrics::new(&dependencies.meter)),
        rate_limiters: RateLimiters::start(&rate_limit_config, &dependencies.meter),
    };

    let apis = super::apis().collect::<Vec<_>>();
    let documentation = documentation::routes(&apis);
    let mut router = middleware
        .assemble(legacy::routes::<S>(), apis, documentation)
        .layer(
            ServiceBuilder::new()
                .layer(NewSentryLayer::new_from_top())
                .layer(SentryHttpLayer::default().enable_transaction()),
        )
        .layer(telemetry::layer())
        .layer(Extension(dependencies.store))
        .layer(Extension(Arc::new(dependencies.postgres)))
        .layer(Extension(dependencies.temporal_client))
        .layer(Extension(dependencies.embedding_client))
        .layer(Extension(dependencies.domain_regex))
        .layer(Extension(dependencies.api_config))
        .layer(Extension(dependencies.compiler))
        .layer(Extension(dependencies.clustering));

    if let Some(query_logger) = dependencies.query_logger {
        router = router.layer(Extension(query_logger));
    }

    // Merged after the layers, so the probe carries no budget, no span, and no extensions.
    router.merge(probe::router())
}
