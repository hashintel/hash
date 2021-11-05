extern crate lazy_static;

pub mod error;
pub mod experiment;
pub mod exsrv;
pub mod manifest;
pub mod process;

use crate::exsrv::create_server;
use crate::ExperimentType::SingleRunExperiment;
use argh::FromArgs;
use derive_more::FromStr;
use error::Result;
use experiment::run_experiment;

/// Arguments for the experiment run
#[derive(FromArgs, Debug)]
pub struct Args {
    /// project path folder
    #[argh(option, short = 'p', default = "default_project_path()")]
    project: String,

    /// project output path folder (will create if missing)
    #[argh(option, short = 'o', default = "default_output_path()")]
    output: String,

    /// experiment type to be run
    #[argh(option, short = 't')]
    r#type: ExperimentType,

    /// max number of parallel workers (must be power of 2)
    #[argh(option, default = "4")]
    num_workers: u16,
}

fn default_project_path() -> String {
    "./".into()
}

fn default_output_path() -> String {
    "./output".into()
}

/// Experiment type
#[derive(FromArgs, Debug)]
#[argh(subcommand)]
pub enum ExperimentType {
    SingleRunExperiment(SingleExperimentArgs),
    SimpleExperiment(SimpleExperimentArgs),
}

// TODO OS - COMPILE BLOCK - What error type, or do we even want to impl this at all
impl std::str::FromStr for ExperimentType {
    type Err = ();

    fn from_str(s: &str) -> core::result::Result<Self, Self::Err> {
        if let Ok(args) = SingleExperimentArgs::from_str(s) {
            Ok(Self::SingleRunExperiment(args))
        } else {
            Ok(SimpleExperimentArgs::from_str(s)?)
        }
    }
}

#[derive(FromStr, FromArgs, PartialEq, Debug)]
/// Single Run Experiment
#[argh(subcommand, name = "single_run")]
pub struct SingleExperimentArgs {
    #[argh(option)]
    /// how many steps
    num_steps: usize,
}

#[derive(FromStr, FromArgs, PartialEq, Debug)]
/// Simple Experiment
#[argh(subcommand, name = "single_run")]
pub struct SimpleExperimentArgs {
    /// experiment name to be run
    #[argh(option, short = 'n')]
    experiment_name: String,
}

impl std::default::Default for Args {
    fn default() -> Self {
        let opts = argh::from_env();
        opts
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // TODO project conversion into manifest...
    // TODO persist output
    //      1) send absolute path to engine process
    //      2) within engine process, save to folder
    let args = Args::default();

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
