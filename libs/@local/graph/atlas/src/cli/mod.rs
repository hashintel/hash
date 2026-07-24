//! The operator commands: fit a generation, serve the atlas.
//!
//! The `hash-graph atlas` subcommand consumes this module: [`FitArgs`] and [`fit`] run one
//! production generation over the live store, and [`ServeArgs`] and [`open_router`] open the root's
//! active generation and build the read-API router ([`crate::api`]) the graph binary hosts. The
//! store flags mirror the graph's `HASH_GRAPH_PG_*` environment, so one deployment configuration
//! drives both.
//!
//! The graph binary is the one entry point; these commands carry no listener, lifecycle, or
//! store dialing of their own beyond what their arguments name.

use alloc::sync::Arc;
use core::{error::Error, fmt, num::NonZero};
use std::{io, time::Instant};

use axum::Router;
use clap::Args;

use crate::{
    api,
    run::{self, ConnectError, RunError},
    serve::{
        Atlas, CurrentError, GenerationRoot, GraphDatabaseClient, OpenAtlasError, OpenOptions,
        ServeLimits, VisibilityProof, WireSecret,
    },
};

/// Returns the default generation root under the temp directory.
fn default_root() -> String {
    std::env::temp_dir()
        .join("atlas-generations")
        .to_str()
        .expect("the temp directory is UTF-8")
        .to_owned()
}

/// Store, root, and run settings of one fit.
#[derive(Debug, Args)]
#[command(group = clap::ArgGroup::new("classifier_input")
    .required(true)
    .args(["annotations", "classifier"]))]
#[expect(
    clippy::struct_excessive_bools,
    reason = "the flags are independent operator switches"
)]
pub struct FitArgs {
    /// The generation root directory.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ROOT", default_value_t = default_root())]
    root: String,

    /// The run seed; equal seeds replay every draw, the admission probe's included.
    #[arg(long, env = "HASH_GRAPH_ATLAS_SEED", default_value_t = 0)]
    seed: u64,

    /// The landmark capacity.
    #[arg(long, default_value = "4096")]
    landmarks: NonZero<u32>,

    /// Ignore the root's active generation instead of reusing it as the prior.
    #[arg(long)]
    fresh: bool,

    /// Sampled anchor rows of the admission probe.
    #[arg(long, default_value = "1024")]
    anchors: NonZero<usize>,

    /// Sampled comparison rows of the admission probe.
    #[arg(long, default_value = "4096")]
    comparisons: NonZero<usize>,

    /// Path of a reviewed-verdicts document to supply.
    ///
    /// The trained placement's phase boundary freezes its Proximal radius from the reviewed pairs,
    /// so a corpus whose relations carry Proximal force needs one to train.
    #[arg(long, env = "HASH_GRAPH_ATLAS_VERDICTS")]
    verdicts: Option<String>,

    /// Path of a quality-thresholds document overriding the source defaults.
    ///
    /// A JSON object with any of `minimum_recall`, `minimum_trustworthiness`,
    /// `minimum_continuity`, `maximum_intrusion_rate`, `minimum_triplet_agreement` (each in
    /// `[0, 1]`) and `maximum_density_spread` (finite, non-negative, at most the `f32` maximum).
    /// A present field overrides its default, an unknown field refuses the document, and an
    /// out-of-domain value refuses the run before it starts. The source defaults are maximally
    /// permissive, gating evidence presence rather than fidelity.
    #[arg(long, env = "HASH_GRAPH_ATLAS_QUALITY_THRESHOLDS")]
    quality_thresholds: Option<String>,

    /// Path of an annotation-corpus document: the classifier's training supply.
    ///
    /// The run assembles it, fits the relation classifier, and stages the corpus, the embedding
    /// table, and the model beside the generation.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ANNOTATIONS")]
    annotations: Option<String>,

    /// Path of a fitted classifier artifact (.clsf) to supply in place of fitting one.
    #[arg(long, env = "HASH_GRAPH_ATLAS_CLASSIFIER")]
    classifier: Option<String>,

    /// Override the trained placement's step count.
    ///
    /// Keeps the ratified options and the midpoint boundary.
    #[arg(long)]
    projector_steps: Option<NonZero<usize>>,

    /// Place at the landmark baseline instead of training the projector: the fallback placer.
    #[arg(long)]
    baseline: bool,

    /// Assert the Proximal radius instead of measuring it at the phase boundary.
    ///
    /// Finite, above the Coincident radius `0.05`; contradicts --baseline.
    #[arg(long, conflicts_with = "baseline")]
    assert_proximal_radius: Option<f32>,

    /// Train the full placement with the relation evidence withheld.
    ///
    /// No reviewed verdicts or radius needed, every other objective term trains. The unblocking
    /// flag for corpora without reviewed-Proximal coverage.
    #[arg(
        long,
        conflicts_with = "baseline",
        conflicts_with = "assert_proximal_radius"
    )]
    vacuous_placement: bool,

    /// Construct the k-NN lists by NN-Descent instead of the HNSW backend.
    ///
    /// Either construction answers to the same recall admission.
    #[arg(long)]
    nn_descent: bool,

    /// Where the admission report JSON lands.
    #[arg(long, default_value = "admission-report.json")]
    report: String,
}

/// Root and serving settings of one serve.
///
/// Listener address, lifecycle, and the store connection belong to the hosting binary; these flags
/// configure what the atlas serves, not where it listens or which store it dials.
#[derive(Debug, Args)]
pub struct ServeArgs {
    /// The generation root directory.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ROOT", default_value_t = default_root())]
    root: String,

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
    seal_hard_seconds: Option<u64>,
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

/// One fit invocation's failure, by step.
///
/// The store and run variants splice into the chain transparently (their display text and sources
/// are the wrapped fault's, unchanged); the report variant names its own step.
#[derive(Debug)]
pub enum FitError {
    /// The store connection failed.
    Connect(ConnectError),
    /// The run failed.
    Run(RunError),
    /// The admission report could not be written.
    Report(io::Error),
}

impl fmt::Display for FitError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(error) => fmt::Display::fmt(error, fmt),
            Self::Run(error) => fmt::Display::fmt(error, fmt),
            Self::Report(_) => fmt.write_str("the admission report could not be written"),
        }
    }
}

impl Error for FitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Connect(error) => error.source(),
            Self::Run(error) => error.source(),
            Self::Report(error) => Some(error),
        }
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

/// Runs one production generation run over the store at `dsn` and prints its summary.
///
/// The hosting binary supplies the connection string; the graph binary renders it from the same
/// store flags its server reads.
///
/// # Errors
///
/// Returns a [`FitError`] naming the step that failed: dialing the store, the run itself, or
/// writing the admission report.
#[expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the summary is the command's product; `Duration` formats through `Debug`"
)]
pub async fn fit(args: FitArgs, dsn: &str) -> Result<(), FitError> {
    crate::math::kernel::verify_cpu_baseline();

    let options = run::Options {
        seed: args.seed,
        landmarks: args.landmarks,
        fresh: args.fresh,
        asserted_proximal_radius: args.assert_proximal_radius,
        vacuous_placement: args.vacuous_placement,
        anchors: args.anchors,
        comparisons: args.comparisons,
        verdicts: args.verdicts,
        quality_thresholds: args.quality_thresholds,
        annotations: args.annotations,
        classifier: args.classifier,
        projector_steps: args.projector_steps,
        baseline: args.baseline,
        nn_descent: args.nn_descent,
    };
    tracing::info!(
        root = args.root,
        seed = options.seed,
        landmarks = options.landmarks.get(),
        fresh = options.fresh,
        anchors = options.anchors.get(),
        comparisons = options.comparisons.get(),
        verdicts = options.verdicts.as_deref().unwrap_or("<none>"),
        quality_thresholds = options.quality_thresholds.as_deref().unwrap_or("<defaults>"),
        annotations = options.annotations.as_deref().unwrap_or("<none>"),
        classifier = options.classifier.as_deref().unwrap_or("<none>"),
        projector_steps = options.projector_steps.map_or(0, NonZero::get),
        baseline = options.baseline,
        nn_descent = options.nn_descent,
        asserted_proximal_radius = ?options.asserted_proximal_radius,
        vacuous_placement = options.vacuous_placement,
        "starting the production run"
    );

    let mut client = run::connect(dsn).await.map_err(FitError::Connect)?;
    let started = Instant::now();
    let summary = run::live(&mut client, &args.root, options)
        .await
        .map_err(FitError::Run)?;
    let elapsed = started.elapsed();

    std::fs::write(&args.report, &summary.report).map_err(FitError::Report)?;

    println!();
    println!("generation  {}", summary.generation);
    println!("nodes       {}", summary.nodes);
    println!("edges       {}", summary.edges);
    println!("recall      {:.4}", summary.recall);
    println!(
        "cards       {} reused, {} embedded",
        summary.reused, summary.embedded
    );
    println!("passes      {}", summary.passes);
    println!("activated   {}", summary.activated);
    println!("report      {}", args.report);
    println!("wall        {elapsed:.1?}");

    Ok(())
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

    let root = GenerationRoot::new(args.root.as_str()).map_err(ServeError::Root)?;
    let generation = root
        .current()
        .map_err(ServeError::Current)?
        .ok_or(ServeError::Missing)?;

    let options = OpenOptions {
        wire_secret: args.secret.ok_or(ServeError::Secret)?,
    };
    let atlas = Arc::new(Atlas::open(&root, generation, &options).map_err(ServeError::Open)?);
    tracing::info!(
        root = args.root,
        generation = %atlas.generation(),
        "serving the active generation"
    );

    // The store rides every serve: detail trailers hydrate live.
    let client = run::connect(dsn).await.map_err(ServeError::Connect)?;
    tracing::info!("detail trailers hydrate from the store");
    let details = Arc::new(GraphDatabaseClient::new(client));

    Ok(
        api::router(atlas, args.limits.resolve(), details, proof).route(
            "/status",
            axum::routing::get(async || axum::http::StatusCode::OK),
        ),
    )
}
