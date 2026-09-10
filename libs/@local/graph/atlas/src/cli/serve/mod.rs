//! HTTP routing and owned generation maintenance.

use alloc::sync::Arc;
use core::{error::Error, fmt};

use axum::Router;
use error_stack::{Report, ResultExt as _};
use hash_graph_postgres_store::store::PostgresStorePool;
use hash_middleware::{
    authentication::{
        AuthenticationLayer, AuthenticationMetrics, provider::AuthenticationProvider,
    },
    rate_limit::{IpGateLayer, PrincipalLimitLayer, RateLimitConfig, RateLimiters},
    telemetry::HttpTracingLayer,
};
use rand::rngs::SysRng;
use tower::ServiceBuilder;
use type_system::principal::actor::ActorId;

pub use self::args::ServeArgs;
use self::args::{DeltaArgs, LimitsArgs, ManagerArgs};
use super::RootArgs;
use crate::{
    api::{self, problem::IntoProblemLayer},
    device::PinnedDevice,
    file::generation::GenerationRoot,
    integrity::SecretString,
    serve2::{
        authorization::authority::Authority,
        delta::EmbeddingWorkflow,
        runtime::{
            FeedOptions,
            manager::{GenerationManager, source::RuntimeSource},
        },
        secret::ServeSecret,
        visibility::cache::VisibilityLimits,
    },
};

mod args;
#[cfg(test)]
mod tests;

/// A failure constructing process-level serving resources.
#[derive(Debug)]
pub enum ServeError {
    /// Drawing the process's authority-key salt failed.
    Authority,
    /// The generation-maintenance configuration is invalid.
    Manager,
}

impl fmt::Display for ServeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Authority => fmt.write_str("could not initialize the authority key"),
            Self::Manager => fmt.write_str("could not configure generation maintenance"),
        }
    }
}

impl Error for ServeError {}

/// The liveness endpoint, outside request budgets and request tracing.
const STATUS_PATH: &str = "/status";

/// Authentication, store access and budgets supplied by the hosting binary.
pub struct ServeOptions<P> {
    /// The credential verifier chain resolving request headers to actors.
    pub provider: Arc<P>,
    /// The delegation secret internal services use to bypass request budgets.
    pub service_secret: SecretString,
    /// Address and principal request budgets.
    pub rate_limit: RateLimitConfig,
    /// Shared connections for feeds, visibility resolution and document hydration.
    pub pool: Arc<PostgresStorePool>,
    /// The shared scope-cache budget and reuse windows.
    pub visibility: VisibilityLimits,
    /// Optional embedding workflow submission for arrivals missing embeddings.
    pub workflow: Option<EmbeddingWorkflow>,
}

/// HTTP routes and the owned generation-maintenance task.
#[must_use = "generation maintenance must be retained and run by the host"]
pub struct Serving {
    router: Router,
    manager: GenerationManager,
}

impl Serving {
    /// Separates HTTP routing from maintenance retained until shutdown completes.
    pub fn into_parts(
        self,
        shutdown: impl Future<Output = ()> + Send,
    ) -> (Router, impl Future<Output = ()> + Send) {
        let Self {
            router,
            mut manager,
        } = self;
        (router, async move { manager.run(shutdown).await })
    }
}

/// One serving invocation's root, limits and execution settings.
#[derive(Debug)]
pub struct ServeCommand {
    root: GenerationRoot,
    device: PinnedDevice,
    limits: LimitsArgs,
    secret: ServeSecret,
    delta: DeltaArgs,
    manager: ManagerArgs,
}

impl ServeCommand {
    /// Resolves parsed flags into one serving invocation.
    #[must_use]
    pub fn new(root: RootArgs, args: ServeArgs) -> Self {
        Self {
            root: root.root,
            device: root.device,
            limits: args.limits,
            secret: args.secret,
            delta: args.delta,
            manager: args.manager,
        }
    }

    /// Constructs HTTP routes and unstarted generation maintenance.
    ///
    /// The read API answers 503 until maintenance publishes a generation. The liveness route
    /// answers outside request budgets. Retained-generation admission lasts for
    /// [`VisibilityLimits::hard`] after replacement promotion. The host must run and retain the
    /// maintenance future returned by [`Serving::into_parts`] through listener failure and
    /// shutdown.
    ///
    /// # Errors
    ///
    /// Returns [`ServeError::Authority`] for an entropy failure or [`ServeError::Manager`] for
    /// invalid maintenance settings. Generation opening failures belong to the maintenance loop.
    ///
    /// # Panics
    ///
    /// Panics outside a Tokio runtime. The rate limiters start their eviction task on that runtime.
    pub fn run<P>(
        self,
        ServeOptions {
            provider,
            service_secret,
            rate_limit,
            pool,
            visibility,
            workflow,
        }: ServeOptions<P>,
    ) -> Result<Serving, Report<ServeError>>
    where
        P: AuthenticationProvider<ActorId> + 'static,
    {
        crate::math::kernel::verify_cpu_baseline();

        let authority = Authority::new(self.secret.as_ref(), visibility.hard, SysRng)
            .change_context(ServeError::Authority)?;
        let feed = (!self.delta.no_delta).then(|| FeedOptions {
            task: self.delta.into(),
            device: self.device.resolve(),
            workflow: workflow.map(Arc::new),
        });
        let manager = GenerationManager::new(
            RuntimeSource {
                root: self.root,
                secret: self.secret,
                pool: Arc::clone(&pool),
                feed,
            },
            self.manager.into(),
            visibility.hard,
        )
        .change_context(ServeError::Manager)?;

        let meter = opentelemetry::global::meter("hash-graph-atlas");
        let limiters = RateLimiters::start(&rate_limit, &meter);
        let service_secret = service_secret.into_unguarded();

        let router = api::router(
            Arc::clone(manager.registry()),
            Arc::new(authority),
            self.limits.into(),
            pool,
            visibility,
        )
        .route_layer(
            // PrincipalLimitLayer requires the request extension written by AuthenticationLayer.
            ServiceBuilder::new()
                .layer(IntoProblemLayer)
                .layer(AuthenticationLayer::<_, ActorId> {
                    provider,
                    service_secret: Arc::clone(&service_secret),
                    metrics: Arc::new(AuthenticationMetrics::new(&meter)),
                    bootstrap_route: |_path| false,
                    caller: core::marker::PhantomData,
                })
                .layer(IntoProblemLayer)
                .layer(PrincipalLimitLayer {
                    limiters: Arc::clone(&limiters),
                    service_secret: Arc::clone(&service_secret),
                }),
        )
        .layer(
            ServiceBuilder::new()
                .layer(IntoProblemLayer)
                .layer(IpGateLayer {
                    limiters,
                    service_secret,
                }),
        )
        .route(
            STATUS_PATH,
            axum::routing::get(async || axum::http::StatusCode::OK),
        )
        .layer(HttpTracingLayer::new(|path| path == STATUS_PATH));

        Ok(Serving { router, manager })
    }
}
