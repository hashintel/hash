//! Module for creating an [`Experiment`] and running it on a [`Process`].
//!
//! [`Process`]: crate::process::Process

use std::{path::PathBuf, time::Duration};

use error_stack::{bail, ensure, IntoReport, ResultExt};
use execution::package::{
    experiment::ExperimentId, simulation::output::persistence::local::LocalPersistenceConfig,
};
use experiment_control::{
    comms::{EngineMsg, InitMessage},
    controller::config::{OutputPersistenceConfig, OUTPUT_PERSISTENCE_KEY},
    environment::{ExecutionEnvironment, LogFormat, LogLevel, OutputLocation},
};
use experiment_structure::ExperimentRun;
use serde_json::json;
use simulation_control::{command::StopStatus, EngineStatus};
use tokio::time::{sleep, timeout};

use crate::{experiment_server::Handler, process, OrchestratorError, Result};

/// Configuration values used when starting a `hash_engine` subprocess.
///
/// See the [`process`] module for more information.
#[derive(Debug, Clone, Default)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct ExperimentConfig {
    /// Project output path folder.
    ///
    /// The folder will be created if it's missing.
    #[cfg_attr(
        feature = "clap",
        clap(
            global = true,
            short,
            long = "output",
            default_value = "./output",
            env = "HASH_OUTPUT"
        )
    )]
    pub output_folder: PathBuf,

    /// Logging output format to be emitted
    #[cfg_attr(
        feature = "clap",
        clap(
            global = true,
            long,
            default_value = "pretty",
            arg_enum,
            env = "HASH_LOG_FORMAT"
        )
    )]
    pub log_format: LogFormat,

    /// Logging verbosity to use. If not set `RUST_LOG` will be used
    #[cfg_attr(feature = "clap", clap(global = true, long, arg_enum))]
    pub log_level: Option<LogLevel>,

    /// Output location where logs are emitted to.
    ///
    /// Can be `stdout`, `stderr` or any file name. Relative to `--log-folder` if a file is
    /// specified.
    #[cfg_attr(feature = "clap", clap(global = true, long, default_value = "stderr"))]
    pub output_location: OutputLocation,

    /// Logging output folder.
    #[cfg_attr(feature = "clap", clap(global = true, long, default_value = "./log"))]
    pub log_folder: PathBuf,

    /// Timeout, in seconds, for how long to wait for a response when the Engine starts
    #[cfg_attr(
        feature = "clap",
        clap(global = true, long, default_value = "2", env = "ENGINE_START_TIMEOUT")
    )]
    pub start_timeout: f64,

    /// Timeout, in seconds, for how long to wait for updates when the Engine is executing
    #[cfg_attr(
        feature = "clap",
        clap(global = true, long, default_value = "60", env = "ENGINE_WAIT_TIMEOUT")
    )]
    pub wait_timeout: f64,

    /// Number of workers to run in parallel.
    ///
    /// Defaults to the number of logical CPUs available in order to maximize performance.
    #[cfg_attr(
    feature = "clap",
    clap(global = true, short = 'w', long, default_value_t = num_cpus::get(), validator = at_least_one, env = "HASH_WORKERS")
    )]
    pub num_workers: usize,

    /// Heap size in megabytes of the V8 runtime in each JavaScript runner under which garbage
    /// collection doesn't occur. See "--num-workers" to set the number of JavaScript runners
    /// executing in parallel.
    ///
    /// Unless you have specific need, this setting should be left at its default value.
    /// It could be beneficial if you are going to store a large amount of "eternal" (=lives as
    /// long as the simulation is running) data on the heap.
    /// Example: you know that at any given time you have 500MB of reachable data on the
    /// heap. You could set this argument to 600MB (500MB plus some) and save some runs of the
    /// garbage collector.
    ///
    /// Defaults to V8's `initial_heap_size` default.
    // https://stackoverflow.com/questions/58035992/how-to-increase-memory-at-startup/58041256#58041256
    #[cfg_attr(feature = "clap", clap(global = true, long))]
    pub js_runner_initial_heap_constraint: Option<usize>,

    /// Maximum size in megabytes of the V8 heap in each JavaScript runner. See "--num-workers" to
    /// set the number of JavaScript runners executing in parallel.
    ///
    /// The JavaScript runner will run a series of garbage collection when the heap size gets close
    /// to this limit. If garbage collection can't get the heap smaller than this limit then it
    /// crashes.
    ///
    /// Defaults to V8's `max_heap_size` default.
    #[cfg_attr(feature = "clap", clap(global = true, long))]
    pub js_runner_max_heap_size: Option<usize>,
}

#[cfg(feature = "clap")]
fn at_least_one(v: &str) -> core::result::Result<(), String> {
    let num = v.parse::<usize>().map_err(|e| e.to_string())?;
    if num == 0 {
        Err("must be at least 1".to_string())
    } else {
        Ok(())
    }
}

/// A fully specified and configured experiment
pub struct Experiment {
    /// Configuration for the experiment.
    pub config: ExperimentConfig,
}

impl Experiment {
    /// Creates an experiment from the provided `config`.
    pub fn new(mut config: ExperimentConfig) -> Self {
        // TODO: Remove when multiple workers are fixed
        config.num_workers = 1;
        Self { config }
    }

    /// Creates a [`Command`] from the experiment's configuration, the given `experiment_id`, and
    /// `controller_url`.
    ///
    /// [`Command`]: crate::process::Command
    fn create_engine_command(
        &self,
        experiment_id: ExperimentId,
        controller_url: &str,
        target_max_group_size: Option<usize>,
        js_runner_initial_heap_constraint: Option<usize>,
        js_runner_max_heap_size: Option<usize>,
    ) -> Box<dyn process::Command + Send> {
        Box::new(process::LocalCommand::new(
            experiment_id,
            self.config.num_workers,
            controller_url,
            self.config.log_format,
            self.config.log_level,
            self.config.output_location.clone(),
            self.config.log_folder.clone(),
            target_max_group_size,
            js_runner_initial_heap_constraint,
            js_runner_max_heap_size,
        ))
    }

    /// Starts an Engine process and runs the experiment on it.
    ///
    /// The `experiment_run` is registered at the server with the provided `handler`, and started
    /// using [`Process`]. After startup it listens to the messages sent from `hash_engine` and
    /// returns once the experiment has finished.
    ///
    /// [`Process`]: crate::process::Process
    #[instrument(skip_all, fields(experiment_name = %experiment_run.name(), experiment_id = %experiment_run.id()))]
    pub async fn run(
        &self,
        experiment_run: ExperimentRun,
        mut handler: Handler,
        target_max_group_size: Option<usize>,
    ) -> Result<(), OrchestratorError> {
        let experiment_name = experiment_run.name();
        let mut engine_handle = handler
            .register_experiment(experiment_run.id())
            .await
            .attach_printable_lazy(|| {
                format!("Could not register experiment \"{experiment_name}\"")
            })?;

        // Create and start the experiment run
        let cmd = self.create_engine_command(
            experiment_run.id(),
            handler.url(),
            target_max_group_size,
            self.config.js_runner_initial_heap_constraint,
            self.config.js_runner_max_heap_size,
        );
        let mut engine_process = cmd
            .run()
            .await
            .attach_printable("Could not run experiment")?;

        // Wait to receive a message that the experiment has started before sending the init
        // message.
        let msg = timeout(
            Duration::from_secs_f64(self.config.start_timeout),
            engine_handle.recv(),
        )
        .await
        .into_report()
        .change_context(OrchestratorError::from("engine start timeout"));
        match msg {
            Ok(EngineStatus::Started) => {}
            Ok(m) => {
                bail!(OrchestratorError::from(format!(
                    "expected to receive `Started` message but received: `{}`",
                    m.kind()
                )));
            }
            Err(e) => {
                error!("Engine start timeout for experiment \"{experiment_name}\"");
                engine_process
                    .exit_and_cleanup(experiment_run.id())
                    .await
                    .attach_printable("Failed to cleanup after failed start")?;
                bail!(e.change_context(OrchestratorError::from(format!(
                    "Engine start timeout for experiment \"{experiment_name}\""
                ))));
            }
        };
        debug!("Received start message from \"{experiment_name}\"");

        let map_iter = [(
            OUTPUT_PERSISTENCE_KEY.to_string(),
            json!(OutputPersistenceConfig::Local(LocalPersistenceConfig {
                output_folder: self.config.output_folder.clone()
            })),
        )];
        // Now we can send the init message
        let init_message = InitMessage {
            experiment: experiment_run.clone(),
            env: ExecutionEnvironment::None, // We don't connect to the API
            dyn_payloads: serde_json::Map::from_iter(map_iter),
        };
        if let Err(err) = engine_process
            .send(&EngineMsg::Init(init_message))
            .await
            .attach_printable("Could not send `Init` message")
        {
            // TODO: Wait for threads to finish before starting a forced cleanup
            warn!("Engine didn't exit gracefully, waiting for subprocesses to finish.");
            std::thread::sleep(Duration::from_secs(1));

            if let Err(cleanup_err) = engine_process
                .exit_and_cleanup(experiment_run.id())
                .await
                .attach_printable("Failed to cleanup after failed start")
            {
                warn!("{cleanup_err}");
            }
            bail!(err);
        }
        debug!("Sent init message to \"{experiment_name}\"");

        let mut graceful_finish = true;
        loop {
            let msg: Option<EngineStatus>;
            tokio::select! {
                _ = sleep(Duration::from_secs_f64(self.config.wait_timeout)) => {
                    error!(
                        "Did not receive status from experiment \"{experiment_name}\" for over {}s. \
                        Exiting now.",
                        self.config.wait_timeout
                    );
                    graceful_finish = false;
                    break;
                }
                exit_code = engine_process.wait() => {
                    match exit_code {
                        Ok(exit_code) if exit_code.success() => warn!("Engine process ended"),
                        Ok(exit_code) => error!("Engine process errored with exit code {exit_code}"),
                        Err(err) => error!("Engine process errored: {err}"),
                    }
                    graceful_finish = false;
                    break;
                }
                m = engine_handle.recv() => { msg = Some(m) },
            }
            let msg = msg.unwrap();
            debug!("Got message from experiment run with type: {}", msg.kind());

            match msg {
                EngineStatus::Stopping => {
                    debug!("Stopping experiment \"{experiment_name}\"");
                }
                EngineStatus::SimStart { sim_id, globals: _ } => {
                    debug!("Started simulation: {sim_id}");
                }
                EngineStatus::SimStatus(status) => {
                    debug!("Got simulation run status: {status:?}");
                    for stop_command in status.stop_msg {
                        let reason = if let Some(reason) = stop_command.message.reason.as_ref() {
                            format!(": {reason}")
                        } else {
                            String::new()
                        };
                        let agent = &stop_command.agent;
                        match stop_command.message.status {
                            StopStatus::Success => {
                                tracing::info!(
                                    "Simulation stopped by agent `{agent}` successfully{reason}"
                                );
                            }
                            StopStatus::Warning => {
                                tracing::warn!(
                                    "Simulation stopped by agent `{agent}` with a warning{reason}"
                                );
                            }
                            StopStatus::Error => {
                                graceful_finish = false;
                                tracing::error!(
                                    "Simulation stopped by agent `{agent}` with an error{reason}"
                                );
                            }
                        }
                    }
                    // TODO: OS - handle more status fields
                }
                EngineStatus::SimStop(sim_id) => {
                    debug!("Simulation stopped: {sim_id}");
                }
                EngineStatus::RunnerErrors(sim_id, errs) => {
                    error!(
                        "There were errors from the runner when running simulation [{sim_id}]: \
                         {errs:?}"
                    );
                    graceful_finish = false;
                }
                EngineStatus::RunnerWarnings(sim_id, warnings) => {
                    warn!(
                        "There were warnings from the runner when running simulation [{sim_id}]: \
                         {warnings:?}"
                    );
                }
                EngineStatus::Logs(sim_id, logs) => {
                    for log in logs {
                        if !log.is_empty() {
                            info!(target: "behaviors", "[{experiment_name}][{sim_id}]: {log}");
                        }
                    }
                }
                EngineStatus::UserErrors(sim_id, errs) => {
                    error!(
                        "There were user-facing errors when running simulation [{sim_id}]: \
                         {errs:?}"
                    );
                }
                EngineStatus::UserWarnings(sim_id, warnings) => {
                    warn!(
                        "There were user-facing warnings when running simulation [{sim_id}]: \
                         {warnings:?}"
                    );
                }
                EngineStatus::PackageError(sim_id, error) => {
                    warn!(
                        "There was an error from a package running simulation [{sim_id}]: \
                         {error:?}"
                    );
                }
                EngineStatus::Exit => {
                    debug!("Process exited successfully for experiment run \"{experiment_name}\"");
                    break;
                }
                EngineStatus::ProcessError(error) => {
                    error!("Got error: {error:?}");
                    graceful_finish = false;
                    break;
                }
                EngineStatus::Started => {
                    error!(
                        "Received unexpected engine `Started` message after engine had already \
                         started: {}",
                        msg.kind()
                    );
                    break;
                }
            }
        }

        if !graceful_finish {
            // TODO: Wait for threads to finish before starting a forced cleanup
            warn!("Engine didn't exit gracefully, waiting for subprocesses to finish.");
            std::thread::sleep(Duration::from_secs(1));
        }

        debug!("Performing cleanup");
        // we run this in a separate task because it might panic (in debug builds), and we would
        // still like the debug output from tracing in that case
        let join_handle = tokio::task::spawn(async move {
            engine_process
                .exit_and_cleanup(experiment_run.id())
                .await
                .attach_printable("Could not cleanup after finish")
        });
        match join_handle.await {
            Ok(inner) => inner?,
            Err(_) => {
                return Err(error_stack::Report::new(OrchestratorError::from(
                    "error: cleanup task panicked (most likely because there were shared-memory \
                     segments which were not deallocated)",
                )));
            }
        }

        ensure!(
            graceful_finish,
            OrchestratorError::from("Engine didn't exit gracefully.")
        );

        Ok(())
    }
}

// TODO: cleanup section below
