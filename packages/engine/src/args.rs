use clap::{AppSettings, Parser};

use crate::utils::OutputFormat;

/// Arguments passed to hEngine
#[derive(Debug, Parser)]
#[clap(about, version, author)]
#[clap(global_setting(AppSettings::PropagateVersion))]
#[clap(setting(AppSettings::UseLongFormatForHelpSubcommand))]
/// Run the engine.
pub struct Args {
    /// experiment ID
    #[clap(short, long, default_value = "")]
    pub experiment_id: String,

    /// nng URL that the orchestrator is listening on
    #[clap(short, long, default_value = "")]
    pub orchestrator_url: String,

    /// nng URL to listen on
    #[clap(short, long, default_value = "")]
    pub listen_url: String,

    /// max number of workers per simulation run (optional).
    #[clap(short, long)]
    pub max_workers: Option<usize>,

    /// Output format emitted to the terminal.
    #[clap(long, default_value = "full", arg_enum, env = "HASH_EMIT")]
    pub emit: OutputFormat,
}

pub fn args() -> Args {
    Args::parse()
}
