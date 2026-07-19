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
    clippy::use_debug,
    reason = "the tool reports on stdout; `Duration` formats through `Debug`"
)]

extern crate alloc;

use alloc::sync::Arc;
use core::num::NonZero;
use std::time::Instant;

use clap::{Args, Parser, Subcommand};
use hash_graph_atlas::{
    bench::{
        fit::connect,
        runner::{LiveOptions, run_live},
    },
    serve::{Atlas, GenerationRoot},
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
}

fn default_root() -> String {
    std::env::temp_dir()
        .join("atlas-generations")
        .to_str()
        .expect("the temp directory is UTF-8")
        .to_owned()
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_span_events(FmtSpan::CLOSE)
        .init();

    match Cli::parse().command {
        Command::Fit(args) => fit(args).await,
        Command::Serve(args) => serve(args).await,
    }
}

/// Runs one production generation run and prints its summary.
async fn fit(args: FitArgs) {
    let options = LiveOptions {
        seed: args.seed,
        landmarks: args.landmarks,
        fresh: args.fresh,
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
        "starting the production run"
    );

    let mut client = connect(&args.dsn).await;
    let started = Instant::now();
    let summary = run_live(&mut client, &args.root, options).await;
    let elapsed = started.elapsed();

    std::fs::write(&args.report, &summary.report).expect("the report should write");

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
}

/// Hosts the atlas read API until interrupted.
async fn serve(args: ServeArgs) {
    let root = GenerationRoot::new(args.root.as_str()).expect("the generation root should open");
    let generation = root
        .current()
        .expect("the current-generation pointer should read")
        .expect("the root holds no activated generation; run `atlas fit` first");

    let atlas = Arc::new(
        Atlas::open(&root, generation).expect("the active generation's artifacts should open"),
    );
    tracing::info!(
        root = args.root,
        generation = %atlas.generation(),
        "serving the active generation"
    );

    let router = routes::router(atlas).route(
        "/status",
        axum::routing::get(async || axum::http::StatusCode::OK),
    );

    let listener = tokio::net::TcpListener::bind((args.host.as_str(), args.port))
        .await
        .expect("the listener should bind");
    tracing::info!(
        address = %listener.local_addr().expect("the listener has an address"),
        "listening; ctrl-c stops the server"
    );

    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _: std::io::Result<()> = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("the server should run until shutdown");
}
