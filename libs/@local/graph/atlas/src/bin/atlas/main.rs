//! The atlas operator tool: fit a generation, serve the atlas.
//!
//! A testing companion for the SALT pipeline, not a production
//! service:
//!
//! ```text
//! cargo run -p hash-graph-atlas --features cli --release --bin atlas -- fit
//! cargo run -p hash-graph-atlas --features cli --release --bin atlas -- serve
//! ```
//!
//! `fit` runs the production generation runner end to end over the
//! live store: prior resolution, fit, admission probe, and the
//! activation decision. `serve` hosts the atlas read API over the
//! root's active generation: the Surface v1 bootstrap and tile
//! routes, unauthenticated, with the generation pinned at startup.
#![expect(
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::use_debug,
    reason = "the tool reports on stdout and fails on stderr; `Duration` formats through `Debug`"
)]

extern crate alloc;

use alloc::sync::Arc;
use core::{error::Error, fmt, num::NonZero};
use std::{process::ExitCode, time::Instant};

use clap::{Args, Parser, Subcommand};
use hash_graph_atlas::{
    run,
    serve::{Atlas, GenerationRoot, OpenOptions, PostgresDetails, ServeCaps},
};
use tracing_subscriber::{EnvFilter, fmt::format::FmtSpan};

mod routes;

/// The SALT Atlas testing tool.
#[derive(Debug, Parser)]
#[command(name = "atlas", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Fits one generation over the live store and activates it on
    /// admission.
    Fit(FitArgs),
    /// Serves the atlas read API over the active generation.
    Serve(ServeArgs),
}

/// Store, root, and run settings of one fit.
#[derive(Debug, Args)]
struct FitArgs {
    /// The store connection string.
    #[arg(
        long,
        env = "ATLAS_DSN",
        default_value = "host=localhost port=5432 user=graph password=graph dbname=graph"
    )]
    dsn: String,

    /// The generation root directory.
    #[arg(long, env = "ATLAS_ROOT", default_value_t = default_root())]
    root: String,

    /// The run seed; equal seeds replay every draw, the admission
    /// probe's included.
    #[arg(long, env = "ATLAS_SEED", default_value_t = 0)]
    seed: u64,

    /// The landmark capacity.
    #[arg(long, default_value = "4096")]
    landmarks: NonZero<u32>,

    /// Ignore the root's active generation instead of reusing it as
    /// the prior.
    #[arg(long)]
    fresh: bool,

    /// Sampled anchor rows of the admission probe.
    #[arg(long, default_value = "1024")]
    anchors: NonZero<usize>,

    /// Sampled comparison rows of the admission probe.
    #[arg(long, default_value = "4096")]
    comparisons: NonZero<usize>,

    /// Path of a reviewed-verdicts document to supply. The trained
    /// placement's phase boundary freezes its Proximal radius from
    /// the reviewed pairs, so a corpus whose relations carry Proximal
    /// force needs one to train.
    #[arg(long, env = "ATLAS_VERDICTS")]
    verdicts: Option<String>,

    /// Override the trained placement's step count, keeping the
    /// ratified options and the midpoint boundary.
    #[arg(long)]
    projector_steps: Option<NonZero<usize>>,

    /// Place at the landmark baseline instead of training the
    /// projector: the fallback placer.
    #[arg(long)]
    baseline: bool,

    /// Assert the Proximal radius instead of measuring it at the
    /// phase boundary. Finite, above the Coincident radius (0.05
    /// ratified); contradicts --baseline.
    #[arg(long, conflicts_with = "baseline")]
    assert_proximal_radius: Option<f32>,

    /// Train the full placement with the relation evidence withheld:
    /// no reviewed verdicts or radius needed, every other objective
    /// term trains. The unblocking flag for corpora without
    /// reviewed-Proximal coverage.
    #[arg(
        long,
        conflicts_with = "baseline",
        conflicts_with = "assert_proximal_radius"
    )]
    vacuous_placement: bool,

    /// Where the admission report JSON lands.
    #[arg(long, default_value = "admission-report.json")]
    report: String,
}

/// Root and listener settings of one serve.
#[derive(Debug, Args)]
struct ServeArgs {
    /// The generation root directory.
    #[arg(long, env = "ATLAS_ROOT", default_value_t = default_root())]
    root: String,

    /// The host to listen on.
    #[arg(long, env = "ATLAS_HOST", default_value = "127.0.0.1")]
    host: String,

    /// The port to listen on.
    #[arg(long, env = "ATLAS_PORT", default_value_t = 4003)]
    port: u16,

    #[command(flatten)]
    store: StoreArgs,

    #[command(flatten)]
    caps: CapsArgs,

    /// The locate index cache directory; absent builds the index on
    /// every open.
    #[arg(long, env = "ATLAS_CACHE_DIR")]
    cache_dir: Option<String>,
}

/// The per-request serving caps: absent flags read the documented
/// defaults off [`ServeCaps`], so the default values live in exactly
/// one place. The manifest publishes whatever this resolves to - the
/// handlers enforce the same value by construction.
#[derive(Debug, Args)]
struct CapsArgs {
    /// Most `coloredTypeIds` one tile request may carry.
    #[arg(long, env = "ATLAS_CAP_COLORED_TYPE_IDS")]
    colored_type_ids: Option<u32>,

    /// Most tiles one edges request may list.
    #[arg(long, env = "ATLAS_CAP_EDGES_TILES")]
    edges_tiles: Option<u32>,

    /// Most edges one response delivers before rank truncation.
    #[arg(long, env = "ATLAS_CAP_EDGES")]
    edges: Option<u32>,

    /// Most entity ids one translate request may carry.
    #[arg(long, env = "ATLAS_CAP_TRANSLATE_ENTITY_IDS")]
    translate_entity_ids: Option<u32>,
}

impl CapsArgs {
    /// Resolves the configured caps over the documented defaults.
    fn resolve(&self) -> ServeCaps {
        let mut caps = ServeCaps::default();
        if let Some(value) = self.colored_type_ids {
            caps.tile.colored_type_ids = value;
        }
        if let Some(value) = self.edges_tiles {
            caps.edges.tiles = value;
        }
        if let Some(value) = self.edges {
            caps.edges.edges = value;
        }
        if let Some(value) = self.translate_entity_ids {
            caps.translate.entity_ids = value;
        }

        caps
    }
}

/// The store connection settings, mirroring the graph binary's
/// `DatabaseConnectionInfo` - same environment variables, same
/// defaults - so one deployment configuration drives both until this
/// binary folds into `hash-graph`. The flags carry a `pg-` prefix
/// only because `--host`/`--port` name the listener here.
#[derive(Debug, Args)]
struct StoreArgs {
    /// Database username.
    #[arg(
        long = "pg-user",
        env = "HASH_GRAPH_PG_USER",
        default_value = "postgres"
    )]
    user: String,

    /// Database password for authentication.
    #[arg(
        long = "pg-password",
        env = "HASH_GRAPH_PG_PASSWORD",
        default_value = "postgres"
    )]
    password: String,

    /// The host to connect to.
    //
    // The explicit ids keep the flattened fields distinct from the
    // listener's `host`/`port` (clap ids default to the field name
    // and collide across flattened structs).
    #[arg(
        id = "pg-host",
        long = "pg-host",
        env = "HASH_GRAPH_PG_HOST",
        default_value = "localhost"
    )]
    host: String,

    /// The port to connect to.
    #[arg(
        id = "pg-port",
        long = "pg-port",
        env = "HASH_GRAPH_PG_PORT",
        default_value_t = 5432
    )]
    port: u16,

    /// The database name to use.
    #[arg(
        long = "pg-database",
        env = "HASH_GRAPH_PG_DATABASE",
        default_value = "graph"
    )]
    database: String,
}

impl StoreArgs {
    /// Renders the keyword connection string the store dialer
    /// parses, quoting each value against spaces and quotes.
    fn dsn(&self) -> String {
        let quote = |value: &str| format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"));
        format!(
            "host={} port={} user={} password={} dbname={}",
            quote(&self.host),
            self.port,
            quote(&self.user),
            quote(&self.password),
            quote(&self.database),
        )
    }
}

fn default_root() -> String {
    std::env::temp_dir()
        .join("atlas-generations")
        .to_str()
        .expect("the temp directory is UTF-8")
        .to_owned()
}

/// A failed step of the tool and the error beneath it.
type ToolError = Box<dyn Error + Send + Sync>;

/// One failed step, heading the printed error chain.
#[derive(Debug)]
struct Failure {
    step: &'static str,
    source: ToolError,
}

impl fmt::Display for Failure {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.step)
    }
}

impl Error for Failure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(self.source.as_ref())
    }
}

/// Wraps a step's error with the step's name.
fn failure(step: &'static str, source: impl Error + Send + Sync + 'static) -> ToolError {
    Box::new(Failure {
        step,
        source: Box::new(source),
    })
}

/// Prints the error and its chain of causes on stderr.
fn explain(error: &dyn Error) {
    eprintln!("error: {error}");
    let mut source = error.source();
    while let Some(cause) = source {
        eprintln!("  caused by: {cause}");
        source = cause.source();
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_span_events(FmtSpan::CLOSE)
        .init();

    let outcome = match Cli::parse().command {
        Command::Fit(args) => fit(args).await,
        Command::Serve(args) => serve(args).await,
    };
    match outcome {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            explain(error.as_ref());
            ExitCode::FAILURE
        }
    }
}

/// Runs one production generation run and prints its summary.
async fn fit(args: FitArgs) -> Result<(), ToolError> {
    let options = run::Options {
        seed: args.seed,
        landmarks: args.landmarks,
        fresh: args.fresh,
        asserted_proximal_radius: args.assert_proximal_radius,
        vacuous_placement: args.vacuous_placement,
        anchors: args.anchors,
        comparisons: args.comparisons,
        verdicts: args.verdicts,
        projector_steps: args.projector_steps,
        baseline: args.baseline,
    };
    tracing::info!(
        root = args.root,
        seed = options.seed,
        landmarks = options.landmarks.get(),
        fresh = options.fresh,
        anchors = options.anchors.get(),
        comparisons = options.comparisons.get(),
        verdicts = options.verdicts.as_deref().unwrap_or("<none>"),
        projector_steps = options.projector_steps.map_or(0, NonZero::get),
        baseline = options.baseline,
        asserted_proximal_radius = ?options.asserted_proximal_radius,
        vacuous_placement = options.vacuous_placement,
        "starting the production run"
    );

    let mut client = run::connect(&args.dsn).await?;
    let started = Instant::now();
    let summary = run::live(&mut client, &args.root, options).await?;
    let elapsed = started.elapsed();

    std::fs::write(&args.report, &summary.report)
        .map_err(|error| failure("the admission report could not be written", error))?;

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

/// Hosts the atlas read API until interrupted.
async fn serve(args: ServeArgs) -> Result<(), ToolError> {
    let root = GenerationRoot::new(args.root.as_str())
        .map_err(|error| failure("the generation root could not open", error))?;
    let generation = root
        .current()
        .map_err(|error| failure("the current-generation pointer could not be read", error))?
        .ok_or_else(|| {
            ToolError::from("the root holds no activated generation; run `atlas fit` first")
        })?;

    let options = OpenOptions {
        locate_cache: args.cache_dir.map(Into::into),
    };
    let atlas = Arc::new(
        Atlas::open_with(&root, generation, &options)
            .map_err(|error| failure("the active generation's artifacts could not open", error))?,
    );
    tracing::info!(
        root = args.root,
        generation = %atlas.generation(),
        "serving the active generation"
    );

    // The store rides every serve, exactly as it does in the graph
    // binary this one folds into: detail trailers hydrate live.
    let client = run::connect(&args.store.dsn()).await?;
    tracing::info!(
        host = args.store.host,
        database = args.store.database,
        "detail trailers hydrate from the store"
    );
    let details = Arc::new(PostgresDetails::new(client));

    let router = routes::router(atlas, args.caps.resolve(), details).route(
        "/status",
        axum::routing::get(async || axum::http::StatusCode::OK),
    );

    let listener = tokio::net::TcpListener::bind((args.host.as_str(), args.port))
        .await
        .map_err(|error| failure("the listener could not bind", error))?;
    tracing::info!(
        address = %listener.local_addr().expect("a bound listener has an address"),
        "listening; ctrl-c stops the server"
    );

    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _: std::io::Result<()> = tokio::signal::ctrl_c().await;
        })
        .await
        .map_err(|error| failure("the server failed", error))?;

    Ok(())
}
