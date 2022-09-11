//! The HASH Engine CLI
//!
//! A binary responsible for the orchestration and management of HASH Engine (hEngine) processes
//! that are used to run HASH simulation projects. This CLI is a light-weight implementation of an
//! [`orchestrator`] which enables the running of an experiment through the command-line, accepting
//! a variety of [`Args`].
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
use experiment_control::environment::init_logger;
use experiment_structure::{ExperimentType, Manifest};
use orchestrator::{Experiment, ExperimentConfig, Server};

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
    .into_report()
    .attach_printable("Failed to initialize the logger")
    .change_context(CliError)?;

    let nng_listen_url = format!("ipc://hash-orchestrator-{now}");

    let (mut experiment_server, handler) = Server::create(nng_listen_url);
    tokio::spawn(async move { experiment_server.run().await });

    let absolute_project_path = args
        .project
        .canonicalize()
        .into_report()
        .attach_printable_lazy(|| {
            format!("Could not canonicalize project path: {:?}", args.project)
        })
        .change_context(CliError)?;
    let manifest = Manifest::from_local(&absolute_project_path)
        .attach_printable_lazy(|| format!("Could not read local project {absolute_project_path:?}"))
        .change_context(CliError)?;
    let experiment_run = manifest
        .read(args.r#type)
        .attach_printable("Could not read manifest")
        .change_context(CliError)?;

    let experiment = Experiment::new(args.experiment_config);

    experiment
        .run(experiment_run, handler, None)
        .await
        .change_context(CliError)
}
