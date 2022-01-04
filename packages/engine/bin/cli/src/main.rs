#![allow(clippy::module_inception)]

#[macro_use]
extern crate lazy_static;
#[macro_use]
extern crate log;
extern crate pretty_env_logger;

pub mod experiment;
pub mod exsrv;
pub mod manifest;
pub mod process;

use std::path::PathBuf;

use anyhow::Result;
use clap::{AppSettings, Parser};
use experiment::run_experiment;

use crate::exsrv::create_server;

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

    /// Experiment type to be run.
    #[clap(subcommand)]
    r#type: ExperimentType,

    /// Max number of parallel workers (must be power of 2).
    #[clap(short = 'w', long, default_value = "4", env = "HASH_WORKERS")]
    num_workers: u16,
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
    // Generate shell completitions
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
    experiment_name: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    pretty_env_logger::init();
    let args = Args::parse();

    let nng_listen_url = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        format!("ipc://hash-orchestrator-{}", now)
    };

    let (mut experiment_server, handler) = create_server(&nng_listen_url)?;
    tokio::spawn(async move { experiment_server.run().await });
    run_experiment(args, handler).await?;
    Ok(())
}
