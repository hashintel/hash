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

use anyhow::Result;
use experiment::run_experiment;
use structopt::StructOpt;

use crate::exsrv::create_server;

/// The hEngine Command line interface.
///
/// Can run single or simple experiments.
#[derive(Debug, StructOpt)]
pub struct Args {
    /// Path to the project to be run.
    #[structopt(short, long, env = "HASH_PROJECT")]
    project: String,

    /// (Unimplemented) Project output path folder.
    ///
    /// The folder will be created if it's missing.
    #[structopt(short, long, default_value = "./output", env = "HASH_OUTPUT")]
    _output: String, // TODO - unused

    /// Experiment type to be run.
    #[structopt(subcommand)]
    r#type: ExperimentType,

    /// Max number of parallel workers (must be power of 2).
    #[structopt(short = "w", long, default_value = "4", env = "HASH_WORKERS")]
    num_workers: u16,
}

/// Type of experiment to be run.
#[derive(Debug, StructOpt)]
pub enum ExperimentType {
    /// Run a single run experiment.
    #[structopt(name = "single-run")]
    SingleRunExperiment(SingleExperimentArgs),
    /// Run a simple experiment.
    #[structopt(name = "simple")]
    SimpleExperiment(SimpleExperimentArgs),
}

/// Single Run Experiment.
#[derive(PartialEq, Debug, StructOpt)]
pub struct SingleExperimentArgs {
    #[structopt(short, long, env = "HASH_NUM_STEPS")]
    /// Number of steps to run.
    num_steps: usize,
}

/// Simple Experiment.
#[derive(PartialEq, Debug, StructOpt)]
pub struct SimpleExperimentArgs {
    /// Name of the experiment to be run.
    #[structopt(short = "n", long, env = "HASH_EXPERIMENT")]
    experiment_name: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    // TODO: project conversion into manifest...
    // TODO: persist output
    //   1) send absolute path to engine process
    //   2) within engine process, save to folder
    pretty_env_logger::init();
    let args = Args::from_args();

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
