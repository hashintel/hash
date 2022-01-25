#![allow(clippy::module_inception)]

use std::{
    fmt::Debug,
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use clap::{AppSettings, Parser};
use error::{report, Result, ResultExt};
use hash_engine::{proto::ExperimentName, utils::OutputFormat};
use orchestrator::{create_server, Experiment, ExperimentConfig, Manifest};

/// Arguments passed to the CLI
#[derive(Debug, Parser)]
#[clap(about, version, author)]
#[clap(global_setting(AppSettings::PropagateVersion))]
#[clap(setting(AppSettings::UseLongFormatForHelpSubcommand))]
pub struct Args {
    /// Path to the project to be run.
    #[clap(short, long, env = "HASH_PROJECT")]
    project: PathBuf,

    /// The Project Name.
    ///
    /// If not provided, the name of the project directory will be used.
    #[clap(short = 'n', long)]
    project_name: Option<String>,

    /// Project output path folder.
    ///
    /// The folder will be created if it's missing.
    #[clap(short, long, default_value = "./output", env = "HASH_OUTPUT")]
    output: PathBuf,

    /// Output format emitted to the terminal.
    #[clap(long, default_value = "pretty", arg_enum, env = "HASH_EMIT")]
    emit: OutputFormat,

    /// Engine start timeout in seconds
    #[clap(long, default_value = "2", env = "ENGINE_START_TIMEOUT")]
    start_timeout: u64,

    /// Engine wait timeout in seconds
    #[clap(long, default_value = "60", env = "ENGINE_WAIT_TIMEOUT")]
    wait_timeout: u64,

    /// Experiment type to be run.
    #[clap(subcommand)]
    r#type: ExperimentType,

    /// Max number of parallel workers (must be power of 2).
    #[clap(short = 'w', long, env = "HASH_WORKERS")]
    num_workers: Option<usize>,
}

/// Type of experiment to be run.
#[derive(Debug, clap::Subcommand)]
pub enum ExperimentType {
    /// Run a single run experiment.
    #[clap(name = "single-run")]
    SingleRunExperiment(SingleExperimentArgs),
    /// Run a simple experiment.
    #[clap(name = "simple")]
    SimpleExperiment(SimpleExperimentArgs),
    // Generate shell completions
}

impl From<ExperimentType> for orchestrator::ExperimentType {
    fn from(t: ExperimentType) -> Self {
        match t {
            ExperimentType::SimpleExperiment(simple) => orchestrator::ExperimentType::Simple {
                name: simple.experiment_name,
            },
            ExperimentType::SingleRunExperiment(single) => {
                orchestrator::ExperimentType::SingleRun {
                    num_steps: single.num_steps,
                }
            }
        }
    }
}

/// Single Run Experiment.
#[derive(PartialEq, Debug, clap::Args)]
pub struct SingleExperimentArgs {
    /// Number of steps to run.
    #[clap(short, long, env = "HASH_NUM_STEPS")]
    num_steps: usize,
}

/// Simple Experiment.
#[derive(PartialEq, Debug, clap::Args)]
pub struct SimpleExperimentArgs {
    /// Name of the experiment to be run.
    #[clap(short = 'n', long, env = "HASH_EXPERIMENT")]
    experiment_name: ExperimentName,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let _guard = hash_engine::init_logger(args.emit, &format!("cli-{now}"));

    let nng_listen_url = format!("ipc://hash-orchestrator-{now}");

    let (mut experiment_server, handler) = create_server(nng_listen_url)?;
    tokio::spawn(async move { experiment_server.run().await });

    let absolute_project_path = args
        .project
        .canonicalize()
        .wrap_err_lazy(|| format!("Could not canonicalize project path: {:?}", args.project))?;
    let manifest = Manifest::from_local(&absolute_project_path)
        .wrap_err_lazy(|| format!("Could not read local project {absolute_project_path:?}"))?;
    let experiment_run = manifest
        .read(args.r#type.into())
        .wrap_err("Could not read manifest")?;

    let experiment = Experiment::new(ExperimentConfig {
        num_workers: args.num_workers.unwrap_or_else(num_cpus::get),
        emit: args.emit,
        output_folder: args.output,
        engine_start_timeout: Duration::from_secs(args.start_timeout),
        engine_wait_timeout: Duration::from_secs(args.wait_timeout),
    });

    let project_name = args.project_name.clone().unwrap_or(
        absolute_project_path
            .file_name()
            .ok_or_else(|| report!("Project path didn't point to a directory: {absolute_project_path:?}"))? // Shouldn't be able to fail as we canonicalize above
            .to_string_lossy()
            .to_string(),
    );

    experiment.run(experiment_run, project_name, handler).await
}
