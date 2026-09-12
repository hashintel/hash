//! HTTP routing with independently retained generation maintenance and acquisition.

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

use self::args::{DeltaArgs, DownloadArgs, LimitsArgs, ManagerArgs};
use super::RootArgs;
use crate::{
    api::{self, problem::IntoProblemLayer},
    device::PinnedDevice,
    file::{
        generation::{
            GenerationRoot,
            download::{Download, DownloadOptions, DownloadTask},
        },
        storage::{Storage, path::FilePath},
    },
    integrity::SecretString,
    serve::{
        authorization::authority::Authority,
        delta::EmbeddingWorkflow,
        runtime::{
            FeedOptions,
            manager::{GenerationManager, GenerationManagerTask, source::RuntimeSource},
        },
        secret::ServeSecret,
        visibility::cache::VisibilityLimits,
    },
};

mod args;
#[cfg(test)]
mod tests;

pub use self::args::ServeArgs;

/// A failure constructing process-level serving resources.
#[derive(Debug)]
pub enum ServeError {
    /// The configured source has no available storage backend.
    Download,
    /// Drawing the process's authority-key salt failed.
    Authority,
    /// The generation-maintenance configuration is invalid.
    Manager,
}

impl fmt::Display for ServeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Download => fmt.write_str("could not configure generation download"),
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
    /// The storage backend for downloaded files.
    pub storage: Storage,
}

/// HTTP routes with owned generation maintenance and optional source polling.
#[must_use = "the host must retain and run maintenance and any download task"]
pub struct Serve {
    router: Router,
    manager: GenerationManagerTask,
    download: Option<DownloadTask<Storage>>,
}

impl Serve {
    /// Separates routing from maintenance and the optional download future.
    ///
    /// The shutdown factory runs once for maintenance and once more for a configured downloader.
    /// After signalling shutdown, await each future to finish its in-flight work.
    pub fn into_parts<S>(
        self,
        mut shutdown: impl FnMut() -> S,
    ) -> (
        Router,
        impl Future<Output = ()> + Send,
        Option<impl Future<Output = ()> + Send>,
    )
    where
        S: Future<Output = ()> + Send,
    {
        let Self {
            router,
            manager,
            download,
        } = self;

        (
            router,
            manager.run(shutdown()),
            download.map(|task| {
                let download_shutdown = shutdown();
                task.run(download_shutdown)
            }),
        )
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
    download: DownloadArgs,
}

impl ServeCommand {
    /// Constructs a local-only serving invocation with fixed integration-test parameters.
    #[cfg(feature = "test-utils")]
    pub(crate) fn for_integration(root: GenerationRoot, secret: ServeSecret) -> Self {
        Self::new(
            RootArgs {
                root,
                device: PinnedDevice::host(),
            },
            args::integration_args(secret),
        )
    }

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
            download: args.download,
        }
    }

    /// Constructs HTTP routes and unstarted generation-maintenance and download tasks.
    ///
    /// The read API answers 503 until maintenance publishes a generation. The liveness route
    /// answers outside request budgets. Retained-generation admission lasts for
    /// [`VisibilityLimits::hard`] after replacement promotion. The host must run and retain the
    /// maintenance future and any download future from [`Serve::into_parts`] through listener
    /// failure and shutdown. Downloading verifies files and updates local current. Maintenance
    /// observes that pointer to open and promote generations.
    ///
    /// # Errors
    ///
    /// Returns [`ServeError`] for unavailable source backends, entropy failures or invalid
    /// maintenance settings. Backend validation performs no source reads. Generation opening
    /// failures belong to the maintenance loop.
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
            storage,
        }: ServeOptions<P>,
    ) -> Result<Serve, Report<ServeError>>
    where
        P: AuthenticationProvider<ActorId> + 'static,
    {
        crate::math::kernel::verify_cpu_baseline();

        let (download_path, download_options): (Option<FilePath>, DownloadOptions) =
            self.download.into();
        if let Some(source) = &download_path {
            source
                .validate_backend(&storage)
                .change_context(ServeError::Download)?;
        }

        let authority = Authority::new(self.secret.as_ref(), visibility.hard, SysRng)
            .change_context(ServeError::Authority)?;
        let feed = (!self.delta.no_delta).then(|| FeedOptions {
            task: self.delta.into(),
            device: self.device.resolve(),
            workflow: workflow.map(Arc::new),
        });
        let manager = GenerationManager::new(
            RuntimeSource {
                root: self.root.clone(),
                secret: self.secret,
                pool: Arc::clone(&pool),
                feed,
            },
            self.manager.into(),
            visibility.hard,
        )
        .change_context(ServeError::Manager)?;

        let download = if let Some(download) = download_path {
            let download = Download::new(storage, self.root, download);
            let task = download.into_task(download_options);
            Some(task)
        } else {
            None
        };

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

        Ok(Serve {
            router,
            manager: manager.into_task(),
            download,
        })
    }
}
