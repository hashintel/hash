//! The serve surface: opening the active generation behind the read-API router.

use alloc::sync::Arc;
use core::{error::Error, fmt};
use std::io;

use axum::Router;
use camino::Utf8PathBuf;
use clap::Args;

use super::store::{ConnectError, connect};
use crate::{
    api,
    serve::{
        Atlas, CurrentError, GenerationRoot, GraphDatabaseClient, OpenAtlasError, OpenOptions,
        ServeLimits, VisibilityProof, WireSecret,
    },
};

/// Root and serving settings of one serve.
///
/// Listener address, lifecycle, and the store connection belong to the hosting binary; these flags
/// configure what the atlas serves, not where it listens or which store it dials.
#[derive(Debug, Args)]
pub struct ServeArgs {
    // NOTE: `ServeArgs` -> `ServeCommand`, `serde` -> `ServeCommand::run`
    /// The generation root directory.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ROOT", default_value_t = super::default_root())]
    root: Utf8PathBuf,

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

/// The per-request serving limits.
///
/// Absent flags read the documented defaults off [`ServeLimits`], so the default values live in
/// exactly one place. The manifest publishes whatever this resolves to - the handlers enforce the
/// same value by construction.
#[derive(Debug, Args)]
struct LimitsArgs {
    // NOTE: def before use...
    // NOTE: why don't you just implement `From` and take the defaults from `ServeLimits::default`?
    // the default is const anyway, so like it's literally 0-cost
    /// Most `coloredTypeIds` one tile request may carry.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_COLORED_TYPE_IDS")]
    colored_type_ids: Option<u32>,

    /// Most tiles one edges request may list.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_EDGES_TILES")]
    edges_tiles: Option<u32>,

    /// Most edges one response delivers before rank truncation.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_EDGES")]
    edges: Option<u32>,

    /// Most entity ids one translate request may carry.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_TRANSLATE_ENTITY_IDS")]
    translate_entity_ids: Option<u32>,

    /// Most ego-graph edges one locate response delivers before the nearest-partner truncation.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_EDGES")]
    locate_edges: Option<u32>,

    /// Most properties one located source ships in its trailer map.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_PROPERTIES")]
    locate_properties: Option<u32>,

    /// Most direct types one locate edge ships.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_LINK_TYPE_IDS")]
    locate_link_type_ids: Option<u32>,

    /// Most properties one locate edge ships.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_LINK_PROPERTIES")]
    locate_link_properties: Option<u32>,

    /// The sealed-blob asynchronous-refresh horizon, seconds.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_SEAL_SOFT_SECONDS")]
    seal_soft_seconds: Option<u64>,

    /// The sealed-blob rejection bound, seconds.
    #[arg(long, env = "HASH_GRAPH_ATLAS_LIMIT_SEAL_HARD_SECONDS")]
    seal_hard_seconds: Option<u64>, // NOTE: doesn't clap support parsing durations?
}

impl LimitsArgs {
    /// Resolves the configured limits over the documented defaults.
    fn resolve(&self) -> ServeLimits {
        let mut limits = ServeLimits::default();
        if let Some(value) = self.colored_type_ids {
            limits.tile.colored_type_ids = value;
        }
        if let Some(value) = self.edges_tiles {
            limits.edges.tiles = value;
        }
        if let Some(value) = self.edges {
            limits.edges.edges = value;
        }
        if let Some(value) = self.translate_entity_ids {
            limits.translate.entity_ids = value;
        }
        if let Some(value) = self.locate_edges {
            limits.locate.edges = value;
        }
        if let Some(value) = self.locate_properties {
            limits.locate.properties = value;
        }
        if let Some(value) = self.locate_link_type_ids {
            limits.locate.link_type_ids = value;
        }
        if let Some(value) = self.locate_link_properties {
            limits.locate.link_properties = value;
        }
        if let Some(value) = self.seal_soft_seconds {
            limits.seal.soft = core::time::Duration::from_secs(value);
        }
        if let Some(value) = self.seal_hard_seconds {
            limits.seal.hard = core::time::Duration::from_secs(value);
        }

        limits
    }
}

/// One serve invocation's failure, by step.
#[derive(Debug)]
pub enum ServeError {
    /// The generation root could not open.
    Root(io::Error),
    /// The current-generation pointer could not be read.
    Current(CurrentError),
    /// The root holds no activated generation.
    Missing,
    /// No wire secret is configured.
    Secret,
    /// The active generation's artifacts could not open.
    Open(OpenAtlasError),
    /// The store connection failed.
    Connect(ConnectError),
}

impl fmt::Display for ServeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(_) => fmt.write_str("the generation root could not open"),
            Self::Current(_) => fmt.write_str("the current-generation pointer could not be read"),
            Self::Missing => fmt.write_str(
                "the root holds no activated generation; run `hash-graph atlas fit` first",
            ),
            Self::Secret => fmt.write_str(
                "no wire secret is configured; set --secret or HASH_GRAPH_ATLAS_SECRET to 64 hex \
                 characters (openssl rand -hex 32)",
            ),
            Self::Open(_) => fmt.write_str("the active generation's artifacts could not open"),
            Self::Connect(error) => fmt::Display::fmt(error, fmt),
        }
    }
}

impl Error for ServeError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Root(error) => Some(error),
            Self::Current(error) => Some(error),
            Self::Missing | Self::Secret => None,
            Self::Open(error) => Some(error),
            Self::Connect(error) => error.source(),
        }
    }
}

/// Opens the root's active generation and builds the read-API router over it.
///
/// `/status` liveness route included.
///
/// The hosting binary owns the listener, lifecycle, middleware, the store connection string `dsn`
/// (detail trailers hydrate from the store on every serve), and the visibility proof `proof` - the
/// authority every response is masked by, named explicitly at the call site; the router carries
/// everything the atlas serves.
///
/// # Errors
///
/// Returns a [`ServeError`] naming the step that failed: opening the root, reading the
/// current-generation pointer, the pointer being absent, the wire secret being unconfigured,
/// opening the generation's artifacts, or dialing the store the detail trailers hydrate from.
pub async fn open_router(
    args: ServeArgs,
    dsn: &str,
    proof: VisibilityProof,
) -> Result<Router, ServeError> {
    crate::math::kernel::verify_cpu_baseline();

    let root = GenerationRoot::new(args.root.as_path()).map_err(ServeError::Root)?;
    let generation = root
        .current()
        .map_err(ServeError::Current)?
        .ok_or(ServeError::Missing)?;

    let options = OpenOptions {
        wire_secret: args.secret.ok_or(ServeError::Secret)?,
    };
    let atlas = Arc::new(Atlas::open(&root, generation, &options).map_err(ServeError::Open)?);
    tracing::info!(
        root = %args.root,
        generation = %atlas.generation(),
        "serving the active generation"
    );

    // The store rides every serve: detail trailers hydrate live.
    let client = connect(dsn).await.map_err(ServeError::Connect)?;
    tracing::info!("detail trailers hydrate from the store");
    let details = Arc::new(GraphDatabaseClient::new(client));

    Ok(
        api::router(atlas, args.limits.resolve(), details, proof).route(
            "/status",
            axum::routing::get(async || axum::http::StatusCode::OK),
        ),
    )
}
