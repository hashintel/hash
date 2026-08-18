//! Opening the active generation behind the read-API router.

use alloc::sync::Arc;
use core::{error::Error, fmt, time::Duration};

use axum::Router;
use clap::Args;
use hash_graph_postgres_store::store::PostgresStorePool;
use rand::rngs::SysRng;

use crate::{
    api,
    file::generation::{CurrentError, GenerationRoot},
    serve::{
        Atlas, DeltaCell, DeltaConsumer, DeltaEpoch, DeltaPolling, DeltaRegister, EdgesLimits,
        EmbeddingEnsure, GraphDatabaseClient, LocateLimits, OpenAtlasError, OpenOptions,
        PlacementError, ServeLimits, StagingArm, TileLimits, TranslateLimits, VisibilityLimits,
        WireSecret,
    },
};

/// The per-request serving limits.
///
/// Every default reads off [`ServeLimits::default`], so the default values live in exactly one
/// place and `--help` renders them. The manifest publishes whatever these resolve to - the handlers
/// enforce the same values by construction.
#[derive(Debug, Args)]
struct LimitsArgs {
    /// Most `coloredTypeIds` one tile request may carry.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_COLORED_TYPE_IDS",
        default_value_t = ServeLimits::default().tile.colored_type_ids,
    )]
    colored_type_ids: u32,

    /// Most tiles one edges request may list.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_EDGES_TILES",
        default_value_t = ServeLimits::default().edges.tiles,
    )]
    edges_tiles: u32,

    /// Most edges one response delivers before rank truncation.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_EDGES",
        default_value_t = ServeLimits::default().edges.edges,
    )]
    edges: u32,

    /// Most entity ids one translate request may carry.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_TRANSLATE_ENTITY_IDS",
        default_value_t = ServeLimits::default().translate.entity_ids,
    )]
    translate_entity_ids: u32,

    /// Most ego-graph edges one locate response delivers before the nearest-partner truncation.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_EDGES",
        default_value_t = ServeLimits::default().locate.edges,
    )]
    locate_edges: u32,

    /// Most properties one located source delivers in its trailer map.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_PROPERTIES",
        default_value_t = ServeLimits::default().locate.properties,
    )]
    locate_properties: u32,

    /// Most direct types one locate edge delivers.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_LINK_TYPE_IDS",
        default_value_t = ServeLimits::default().locate.link_type_ids,
    )]
    locate_link_type_ids: u32,

    /// Most properties one locate edge delivers.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_LINK_PROPERTIES",
        default_value_t = ServeLimits::default().locate.link_properties,
    )]
    locate_link_properties: u32,
}

impl From<LimitsArgs> for ServeLimits {
    fn from(args: LimitsArgs) -> Self {
        Self {
            tile: TileLimits {
                colored_type_ids: args.colored_type_ids,
            },
            edges: EdgesLimits {
                tiles: args.edges_tiles,
                edges: args.edges,
            },
            locate: LocateLimits {
                edges: args.locate_edges,
                properties: args.locate_properties,
                link_type_ids: args.locate_link_type_ids,
                link_properties: args.locate_link_properties,
            },
            translate: TranslateLimits {
                entity_ids: args.translate_entity_ids,
            },
        }
    }
}

/// The delta consumer's polling knobs and its opt-out.
///
/// Every default reads off [`DeltaPolling`]'s pinned values, so the defaults live in exactly one
/// place and `--help` renders them.
#[derive(Debug, Args)]
struct DeltaArgs {
    /// Seconds between entity feed polls.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_POLL_INTERVAL",
        default_value_t = DeltaPolling::default().interval.as_secs(),
    )]
    delta_poll_interval: u64,

    /// Seconds a poll reads behind its own watermark, covering the feed's commit-visibility
    /// window.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_SAFETY_LAG",
        default_value_t = DeltaPolling::default().safety_lag.as_secs(),
    )]
    delta_safety_lag: u64,

    /// Staging cycles an arrival's embedding read runs on each side of its ensure.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_RETRY_POLLS",
        default_value_t = DeltaPolling::default().retry_polls,
    )]
    delta_retry_polls: u32,

    /// Number of items that may be queued behind the watermark before backpressure is applied.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_PLACEMENT_BACKLOG",
        default_value_t = DeltaPolling::default().placement_backlog,
    )]
    delta_placement_backlog: usize,

    /// Serve the generation's fit-time bytes alone, starting no delta consumer.
    #[arg(long, env = "HASH_GRAPH_ATLAS_NO_DELTA")]
    no_delta: bool,
}

impl From<&DeltaArgs> for DeltaPolling {
    fn from(args: &DeltaArgs) -> Self {
        Self {
            interval: Duration::from_secs(args.delta_poll_interval),
            safety_lag: Duration::from_secs(args.delta_safety_lag),
            retry_polls: args.delta_retry_polls,
            placement_backlog: args.delta_placement_backlog,
        }
    }
}

/// Root and serving settings of one serve.
///
/// Listener address, lifecycle, and the store connection belong to the hosting binary; these flags
/// configure what the atlas serves, not where it listens or which store it dials.
#[derive(Debug, Args)]
pub struct ServeArgs {
    #[command(flatten)]
    limits: LimitsArgs,

    #[command(flatten)]
    delta: DeltaArgs,

    /// The server secret behind the wire row-id codec.
    ///
    /// Required for serving: exactly 64 hexadecimal characters (32 bytes). Generate one with
    /// `openssl rand -hex 32`. The secret must not change for a generation that has ever served.
    /// Rotate generations to rotate secrets.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_SECRET",
        hide_env_values = true,
        value_parser = WireSecret::from_hex,
    )]
    secret: Option<WireSecret>,
}

/// One serve invocation's failure, by step.
#[derive(Debug)]
pub enum ServeError {
    /// Reading the current-generation pointer failed.
    Current(CurrentError),
    /// The root holds no activated generation.
    Missing,
    /// Neither the flag nor the environment supplies a wire secret.
    Secret,
    /// The active generation's artifacts could not open.
    Open(OpenAtlasError),
    /// The generation stages a projector checkpoint whose publish path did not reopen.
    Placement(PlacementError),
    /// Drawing the delta epoch failed.
    ///
    /// Entropy failure refuses the serve rather than starting a register lifetime under a
    /// predictable name. The source is the system generator's own error, type-erased because its
    /// defining crate is not a public dependency.
    Epoch(Box<dyn Error + Send + Sync>),
}

impl fmt::Display for ServeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Current(_) => fmt.write_str("the current-generation pointer could not be read"),
            Self::Missing => fmt.write_str(
                "the root holds no activated generation; run `hash-graph atlas fit` first",
            ),
            Self::Secret => fmt.write_str(
                "no wire secret is configured; set --secret or HASH_GRAPH_ATLAS_SECRET to 64 hex \
                 characters (openssl rand -hex 32)",
            ),
            Self::Open(_) => fmt.write_str("the active generation's artifacts could not open"),
            Self::Placement(_) => fmt.write_str(
                "the generation promises online placement its artifacts cannot deliver; refit, or \
                 disable the delta consumer with --no-delta",
            ),
            Self::Epoch(_) => fmt.write_str("the delta epoch could not be drawn"),
        }
    }
}

impl Error for ServeError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Current(error) => Some(error),
            Self::Missing | Self::Secret => None,
            Self::Open(error) => Some(error),
            Self::Placement(error) => Some(error),
            Self::Epoch(error) => Some(error.as_ref()),
        }
    }
}

/// One serve invocation, resolved: the enforced limits and the wire secret over an opened root.
#[derive(Debug)]
pub struct ServeCommand {
    root: GenerationRoot,
    limits: ServeLimits,
    secret: Option<WireSecret>,
    delta: DeltaArgs,
}

impl ServeCommand {
    /// Resolves the parsed flags into one serve invocation over the root.
    #[must_use]
    pub fn new(root: super::RootArgs, args: ServeArgs) -> Self {
        Self {
            root: root.root,
            limits: args.limits.into(),
            secret: args.secret,
            delta: args.delta,
        }
    }

    /// Opens the root's active generation and builds the read-API router over it.
    ///
    /// `/status` liveness route included.
    ///
    /// The hosting binary owns the listener, lifecycle, middleware, the dialed store connection
    /// `pool` - every store read the serving process makes goes through it, detail trailers and
    /// permission resolution alike - and `visibility`, the window over which the router reuses a
    /// resolved scope. The router carries everything the atlas serves.
    ///
    /// When the generation records temporal axes and the delta opt-out is unset, the invocation
    /// also spawns the delta consumer and the staging arm onto the caller's runtime. The
    /// consumer polls the entity feed through the same pool for the process's lifetime, and the
    /// staging arm walks classified arrivals toward placement, ensuring embeddings when the
    /// caller supplies `ensure` and staging without ensures otherwise. Consumer initialization
    /// draws a fresh delta epoch, which every authority token seals, so the tokens minted beside
    /// an earlier register lifetime refuse uniformly and their sessions bootstrap again.
    ///
    /// # Errors
    ///
    /// Returns a [`ServeError`] naming the step that failed: [`ServeError::Current`] for reading
    /// the current-generation pointer, [`ServeError::Missing`] for a root with no activated
    /// generation, [`ServeError::Secret`] for an invocation with no wire secret,
    /// [`ServeError::Open`] for artifacts that do not open, and [`ServeError::Epoch`] when the
    /// delta epoch's entropy draw fails.
    pub fn run(
        self,
        pool: Arc<PostgresStorePool>,
        visibility: VisibilityLimits,
        ensure: Option<EmbeddingEnsure>,
    ) -> Result<Router, ServeError> {
        // Embedders reach this entry without passing through the shell's main.
        crate::math::kernel::verify_cpu_baseline();

        let generation = self
            .root
            .current()
            .map_err(ServeError::Current)?
            .ok_or(ServeError::Missing)?;

        let options = OpenOptions {
            wire_secret: self.secret.ok_or(ServeError::Secret)?,
        };
        let atlas =
            Arc::new(Atlas::open(&self.root, generation, options).map_err(ServeError::Open)?);
        tracing::info!(
            root = %self.root.path(),
            generation = %atlas.generation(),
            "serving the active generation"
        );

        // Every serve reads the store, so detail trailers hydrate live and each caller's scope
        // resolves through the same pool.
        let details = Arc::new(GraphDatabaseClient::new(Arc::clone(&pool)));
        tracing::info!("detail trailers hydrate from the store");

        // The cell rides the router in every mode. Without a consumer it stays empty for the
        // process's lifetime, and every ingress capture answers `None` at no cost.
        let cell = Arc::new(DeltaCell::default());

        let epoch = if self.delta.no_delta {
            tracing::info!("configuration turns the delta consumer off");
            None
        } else if let Some(fitted) = atlas.fitted_at() {
            // The epoch draw is the first act of consumer initialization, so a failed draw
            // spawns nothing and refuses the serve whole.
            let epoch = DeltaEpoch::fresh(&mut SysRng)
                .map_err(|error| ServeError::Epoch(Box::new(error)))?;
            let polling = DeltaPolling::from(&self.delta);

            let placer = atlas.arrival_placer().map_err(ServeError::Placement)?;
            let (placements_tx, placements_rx) =
                tokio::sync::mpsc::channel(polling.placement_backlog);

            let consumer = DeltaConsumer::new(
                Arc::clone(&pool),
                Arc::clone(&atlas),
                Arc::clone(&cell),
                fitted,
                DeltaRegister::from_atlas(&atlas),
                polling,
                placements_rx,
            );
            let arm = StagingArm::new(
                Arc::clone(&pool),
                Arc::clone(&cell),
                polling,
                ensure,
                placer,
                placements_tx,
            );

            let _consumer_handle = tokio::spawn(consumer.run());
            let _staging_handle = tokio::spawn(arm.run());

            Some(epoch)
        } else {
            tracing::info!("the generation records no temporal axes, so no delta consumer runs");
            None
        };

        Ok(
            api::router(atlas, self.limits, details, pool, visibility, epoch, cell).route(
                "/status",
                axum::routing::get(async || axum::http::StatusCode::OK),
            ),
        )
    }
}
