use std::path::PathBuf;

use clap::{AppSettings, Parser};

use crate::{
    proto::ExperimentId,
    utils::{LogFormat, OutputLocation},
};

/// Arguments passed to hEngine
#[derive(Debug, Parser)]
#[clap(about, version, author)]
#[clap(global_setting(AppSettings::PropagateVersion))]
#[clap(setting(AppSettings::UseLongFormatForHelpSubcommand))]
/// Run the engine.
pub struct Args {
    /// The unique identifier of the experiment, as a valid v4 UUID
    #[clap(short, long, default_value = "")]
    pub experiment_id: ExperimentId,

    /// nng URL that the orchestrator is listening on
    #[clap(short, long, default_value = "")]
    pub orchestrator_url: String,

    /// nng URL to listen on
    #[clap(short, long, default_value = "")]
    pub listen_url: String,

    /// max number of workers per simulation run (optional).
    #[clap(short, long)]
    pub num_workers: usize,

    /// Output format emitted to the output location.
    #[clap(long, default_value = "pretty", arg_enum, env = "HASH_LOG_FORMAT")]
    pub log_format: LogFormat,

    /// Output location where to emit logs.
    ///
    /// Can be `stdout`, `stderr` or any file name. Relative to `--log-folder` if a file is
    /// specified.
    #[clap(long, default_value = "stderr")]
    pub output: OutputLocation,

    /// Logging output folder.
    #[clap(long, default_value = "./log")]
    pub log_folder: PathBuf,
}

pub fn args() -> Args {
    Args::parse()
}
