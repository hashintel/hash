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
use argh::FromArgs;
use experiment::run_experiment;

use crate::exsrv::create_server;

/// Arguments for the experiment run
#[derive(FromArgs, Debug)]
pub struct Args {
    /// project path folder
    #[argh(option, short = 'p', default = "default_project_path()")]
    project: String,

    /// project output path folder (will create if missing)
    #[argh(option, short = 'o', default = "default_output_path()")]
    _output: String, // TODO: unused

    /// experiment type to be run
    #[argh(subcommand, short = 't')]
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

#[derive(FromArgs, PartialEq, Debug)]
/// Single Run Experiment
#[argh(subcommand, name = "single_run")]
pub struct SingleExperimentArgs {
    #[argh(option)]
    /// how many steps
    num_steps: usize,
}

#[derive(FromArgs, PartialEq, Debug)]
/// Simple Experiment
#[argh(subcommand, name = "simple")]
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
// TODO: fix ordering of args being so inflexible and unintuitive, and also error messages being
// unhelpful for example try putting `-p` after `single_run`
async fn main() -> Result<()> {
    // TODO: project conversion into manifest...
    // TODO: persist output
    //   1) send absolute path to engine process
    //   2) within engine process, save to folder
    pretty_env_logger::init();
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
