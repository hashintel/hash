#![allow(clippy::module_inception)]

use std::{
    error::Error,
    fmt,
    fmt::Debug,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use clap::{AppSettings, Parser};
use error_stack::{IntoReport, Result, ResultExt};
use execution::package::experiment::ExperimentName;
use hash_engine_lib::utils::init_logger;
use orchestrator::{Experiment, ExperimentConfig, Server};
use simulation_structure::Manifest;

/// Arguments passed to the CLI
#[derive(Debug, Parser)]
#[clap(about, version, author)]
#[clap(global_setting(AppSettings::PropagateVersion))]
#[clap(setting(AppSettings::UseLongFormatForHelpSubcommand))]
pub struct Args {
    /// Path to the project to be run.
    #[clap(short, long, env = "HASH_PROJECT")]
    project: PathBuf,

    #[clap(flatten)]
    experiment_config: ExperimentConfig,

    /// Experiment type to be run.
    #[clap(subcommand)]
    r#type: ExperimentType,
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

impl From<ExperimentType> for simulation_structure::ExperimentType {
    fn from(t: ExperimentType) -> Self {
        match t {
            ExperimentType::SimpleExperiment(simple) => {
                simulation_structure::ExperimentType::Simple {
                    name: simple.experiment_name,
                }
            }
            ExperimentType::SingleRunExperiment(single) => {
                simulation_structure::ExperimentType::SingleRun {
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

#[derive(Debug)]
pub struct CliError;

impl fmt::Display for CliError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("CLI encountered an error during execution")
    }
}

impl Error for CliError {}

#[tokio::main]
async fn main() -> Result<(), CliError> {
    let args = Args::parse();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let _guard = init_logger(
        args.experiment_config.log_format,
        &args.experiment_config.output_location,
        args.experiment_config.log_folder.clone(),
        args.experiment_config.log_level,
        &format!("cli-{now}"),
        &format!("cli-{now}-texray"),
    )
    .report()
    .attach_printable("Failed to initialize the logger")
    .change_context(CliError)?;

    let nng_listen_url = format!("ipc://hash-orchestrator-{now}");

    let (mut experiment_server, handler) = Server::create(nng_listen_url);
    tokio::spawn(async move { experiment_server.run().await });

    let absolute_project_path = args
        .project
        .canonicalize()
        .report()
        .attach_printable_lazy(|| {
            format!("Could not canonicalize project path: {:?}", args.project)
        })
        .change_context(CliError)?;
    let manifest = Manifest::from_local(&absolute_project_path)
        .attach_printable_lazy(|| format!("Could not read local project {absolute_project_path:?}"))
        .change_context(CliError)?;
    let experiment_run = manifest
        .read(args.r#type.into())
        .attach_printable("Could not read manifest")
        .change_context(CliError)?;

    let experiment = Experiment::new(args.experiment_config);

    experiment
        .run(experiment_run, handler, None)
        .await
        .change_context(CliError)
}
