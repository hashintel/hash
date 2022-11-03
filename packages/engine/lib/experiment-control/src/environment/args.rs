use std::path::PathBuf;

#[cfg(feature = "clap")]
use clap::{
    AppSettings::{PropagateVersion, UseLongFormatForHelpSubcommand},
    Parser,
};
use execution::package::experiment::ExperimentId;

use crate::environment::{LogFormat, LogLevel, OutputLocation};

/// Arguments passed to HASH Engine
#[derive(Debug)]
#[cfg_attr(feature = "clap", derive(Parser))]
#[cfg_attr(feature = "clap", clap(about, version, author))]
#[cfg_attr(feature = "clap", clap(global_setting(PropagateVersion)))]
#[cfg_attr(feature = "clap", clap(setting(UseLongFormatForHelpSubcommand)))]
/// Run the engine.
pub struct Args {
    /// The unique identifier of the experiment, as a valid v4 UUID
    #[cfg_attr(feature = "clap", clap(short, long, default_value_t = ExperimentId::generate()))]
    pub experiment_id: ExperimentId,

    /// nng URL that the orchestrator is listening on
    #[cfg_attr(feature = "clap", clap(short, long, default_value = ""))]
    pub orchestrator_url: String,

    /// nng URL to listen on
    #[cfg_attr(feature = "clap", clap(short, long, default_value = ""))]
    pub listen_url: String,

    /// Number of workers to run in parallel.
    ///
    /// Defaults to the number of logical CPUs available in order to maximize performance.
    #[cfg_attr(feature = "clap", clap(short = 'w', long, default_value_t = num_cpus::get(), env = "HASH_WORKERS"))]
    pub num_workers: usize,

    /// Output format emitted to the output location.
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "pretty", arg_enum, env = "HASH_LOG_FORMAT")
    )]
    pub log_format: LogFormat,

    /// Logging verbosity to use. If not set `RUST_LOG` will be used
    #[cfg_attr(feature = "clap", clap(long, arg_enum))]
    pub log_level: Option<LogLevel>,

    /// Output location where to emit logs.
    ///
    /// Can be `stdout`, `stderr` or any file name. Relative to `--log-folder` if a file is
    /// specified.
    #[cfg_attr(feature = "clap", clap(long, default_value = "stderr"))]
    pub output: OutputLocation,

    /// Logging output folder.
    #[cfg_attr(feature = "clap", clap(long, default_value = "./log"))]
    pub log_folder: PathBuf,

    /// The size at which the engine aims to split a group of agents
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "100000", env = "ENGINE_TARGET_MAX_GROUP_SIZE")
    )]
    pub target_max_group_size: usize,

    /// Heap size in megabytes of the V8 runtime in each JavaScript runner under which garbage
    /// collection doesn't occur. See "--num-workers" to set the number of JavaScript runners
    /// executing in parallel.
    ///
    /// This setting is most of the time better off left to its default value.
    /// It could be beneficial if you are going to store a large amount of "eternal" (=lives as
    /// long as the simulation is running) data on the heap.
    /// Example: you know that at any given time you have 500MB of reachable data on the
    /// heap. You could set this argument to 600MB (500MB plus some) and save some runs of the
    /// garbage collector.
    ///
    /// Defaults to V8's `initial_heap_size` default.
    #[cfg_attr(feature = "clap", clap(long))]
    pub js_runner_initial_heap_constraint: Option<usize>,

    /// Maximum size in megabytes of the V8 heap in each JavaScript runner. See "--num-workers" to
    /// set the number of JavaScript runners executing in parallel.
    ///
    /// The JavaScript runner will run a series of garbage collection when the heap size gets close
    /// to this limit. If garbage collection can't get the heap smaller than this limit then it
    /// crashes.
    ///
    /// Defaults to V8's `max_heap_size` default.
    #[cfg_attr(feature = "clap", clap(long))]
    pub js_runner_max_heap_size: Option<usize>,
}

impl Args {
    #[cfg(feature = "clap")]
    pub fn parse() -> Self {
        <Args as Parser>::parse()
    }
}
