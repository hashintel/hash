//! The serve surface: opening the active generation behind the read-API router.

use alloc::sync::Arc;
use core::{error::Error, fmt, time::Duration};

use axum::Router;
use clap::Args;
use hash_graph_postgres_store::store::PostgresStorePool;

use crate::{
    api,
    serve::{
        Atlas, CurrentError, EdgesLimits, GenerationRoot, GraphDatabaseClient, LocateLimits,
        OpenAtlasError, OpenOptions, SealLimits, ServeLimits, TileLimits, TranslateLimits,
        VisibilityLimits, WireSecret,
    },
};

/// The per-request serving limits.
///
/// Every default reads off [`ServeLimits::default`], so the default values live in exactly one
/// place and `--help` renders them. The manifest publishes whatever these resolve to - the
/// handlers enforce the same values by construction.
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

    /// Most properties one located source ships in its trailer map.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_PROPERTIES",
        default_value_t = ServeLimits::default().locate.properties,
    )]
    locate_properties: u32,

    /// Most direct types one locate edge ships.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_LINK_TYPE_IDS",
        default_value_t = ServeLimits::default().locate.link_type_ids,
    )]
    locate_link_type_ids: u32,

    /// Most properties one locate edge ships.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_LINK_PROPERTIES",
        default_value_t = ServeLimits::default().locate.link_properties,
    )]
    locate_link_properties: u32,

    /// The sealed-blob asynchronous-refresh horizon, seconds.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_SEAL_SOFT_SECONDS",
        default_value_t = ServeLimits::default().seal.soft.as_secs(),
    )]
    seal_soft_seconds: u64,

    /// The sealed-blob rejection bound, seconds.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_SEAL_HARD_SECONDS",
        default_value_t = ServeLimits::default().seal.hard.as_secs(),
    )]
    seal_hard_seconds: u64,
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
            seal: SealLimits {
                soft: Duration::from_secs(args.seal_soft_seconds),
                hard: Duration::from_secs(args.seal_hard_seconds),
            },
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

    /// The server secret behind the wire row-id codec.
    ///
    /// Required for serving: exactly 64 hexadecimal characters (32 bytes). Generate one with
    /// `openssl rand -hex 32`. The secret must not change for a generation that has ever served;
    /// rotate generations to rotate secrets.
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
    /// The current-generation pointer could not be read.
    Current(CurrentError),
    /// The root holds no activated generation.
    Missing,
    /// No wire secret is configured.
    Secret,
    /// The active generation's artifacts could not open.
    Open(OpenAtlasError),
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
        }
    }
}

impl Error for ServeError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Current(error) => Some(error),
            Self::Missing | Self::Secret => None,
            Self::Open(error) => Some(error),
        }
    }
}

/// One serve invocation, resolved: the enforced limits and the wire secret over an opened root.
#[derive(Debug)]
pub struct ServeCommand {
    root: GenerationRoot,
    limits: ServeLimits,
    secret: Option<WireSecret>,
}

impl ServeCommand {
    /// Resolves the parsed flags into one serve invocation over the root.
    #[must_use]
    pub fn new(root: super::RootArgs, args: ServeArgs) -> Self {
        Self {
            root: root.root,
            limits: args.limits.into(),
            secret: args.secret,
        }
    }

    /// Opens the root's active generation and builds the read-API router over it.
    ///
    /// `/status` liveness route included.
    ///
    /// The hosting binary owns the listener, lifecycle, middleware, the dialed store connection
    /// `pool` - every store read the serving process makes goes through it, detail trailers and
    /// permission resolution alike - and `visibility`, the window a resolved scope is reused for.
    /// The router carries everything the atlas serves.
    ///
    /// # Errors
    ///
    /// Returns a [`ServeError`] naming the step that failed: reading the current-generation
    /// pointer, the pointer being absent, the wire secret being unconfigured, or opening the
    /// generation's artifacts.
    pub fn run(
        self,
        pool: Arc<PostgresStorePool>,
        visibility: VisibilityLimits,
    ) -> Result<Router, ServeError> {
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
            Arc::new(Atlas::open(&self.root, generation, &options).map_err(ServeError::Open)?);
        tracing::info!(
            root = %self.root.path(),
            generation = %atlas.generation(),
            "serving the active generation"
        );

        // The store rides every serve: detail trailers hydrate live and each caller's scope
        // resolves through the same pool.
        let details = Arc::new(GraphDatabaseClient::new(Arc::clone(&pool)));
        tracing::info!("detail trailers hydrate from the store");

        Ok(
            api::router(atlas, self.limits, details, pool, visibility).route(
                "/status",
                axum::routing::get(async || axum::http::StatusCode::OK),
            ),
        )
    }
}
