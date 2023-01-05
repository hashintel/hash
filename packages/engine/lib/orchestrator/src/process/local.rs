use std::{
    fs::remove_file,
    path::{Path, PathBuf},
    process::ExitStatus,
};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, ResultExt};
use execution::package::experiment::ExperimentId;
use experiment_control::{
    comms::EngineMsg,
    controller::run::cleanup_experiment,
    environment::{LogFormat, LogLevel, OutputLocation},
};

use crate::{process, OrchestratorError, Result};

const ENGINE_BIN_PATH_DEFAULT: &str = env!("CARGO_BIN_FILE_HASH_ENGINE");

#[cfg(debug_assertions)]
const ENGINE_BIN_PATH_FALLBACK: &str = "./target/debug/hash_engine";

#[cfg(not(debug_assertions))]
const ENGINE_BIN_PATH_FALLBACK: &str = "./target/release/hash_engine";

/// A local `hash_engine` subprocess using the [`std::process`] library.
pub struct LocalProcess {
    child: tokio::process::Child,
    client: Option<nano::Client>,
    engine_url: String,
}

#[async_trait]
impl process::Process for LocalProcess {
    async fn exit_and_cleanup(mut self: Box<Self>, experiment_id: ExperimentId) -> Result<()> {
        // Kill the child process as it didn't stop on its own
        let kill_result = self
            .child
            .kill()
            .await
            .or_else(|e| match e.kind() {
                // From `Child::kill` docs: Forces the child process to exit. If the child has
                // already exited, an InvalidInput error is returned
                std::io::ErrorKind::InvalidInput => Ok(()),
                _ => Err(Report::new(e)),
            })
            .change_context(OrchestratorError::from("Could not kill the process"));

        let engine_socket_path = format!("run-{experiment_id}");
        match remove_file(&engine_socket_path) {
            Ok(_) => {
                tracing::warn!(
                    experiment = %experiment_id,
                    "Removed file {engine_socket_path:?} that should've been cleaned up."
                );
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
            Err(err) => {
                tracing::warn!(
                    experiment = %experiment_id,
                    "Could not clean up {engine_socket_path:?}: {err}"
                );
            }
        }

        cleanup_experiment(experiment_id);

        debug!("Cleaned up local engine process for experiment");
        Ok(kill_result?)
    }

    /// Creates or reuses a [`nano::Client`] to send a message to the `hash_engine` subprocess.
    ///
    /// # Errors
    ///
    /// - if the [`nano::Client`] could not be created
    /// - if the message could not be sent
    async fn send(&mut self, msg: &EngineMsg) -> Result<()> {
        // We create the client on the first call here, rather than when the LocalCommand is run,
        // because the engine process needs some time before it's ready to accept NNG connections.
        if self.client.is_none() {
            self.client = Some(nano::Client::new(&self.engine_url, 1).change_context_lazy(
                || {
                    OrchestratorError::from(format!(
                        "Could not create nano client for engine at {:?}",
                        self.engine_url
                    ))
                },
            )?);
        }
        Ok(self
            .client
            .as_mut()
            .unwrap()
            .send(msg)
            .await
            .change_context(OrchestratorError::from("Could not send engine message"))?)
    }

    async fn wait(&mut self) -> Result<ExitStatus> {
        Ok(self
            .child
            .wait()
            .await
            .into_report()
            .change_context(OrchestratorError::from(
                "Could not wait for the process to exit",
            ))?)
    }
}

/// Stores information to create a [`LocalProcess`] for creating an engine-subprocess.
pub struct LocalCommand {
    experiment_id: ExperimentId,
    engine_url: String,
    controller_url: String,
    num_workers: usize,
    log_format: LogFormat,
    log_level: Option<LogLevel>,
    output_location: OutputLocation,
    log_folder: PathBuf,
    target_max_group_size: Option<usize>,
    js_runner_initial_heap_constraint: Option<usize>,
    js_runner_max_heap_size: Option<usize>,
}

impl LocalCommand {
    #[allow(clippy::too_many_arguments)]
    /// Creates a new [`LocalProcess`] with the provided parameters.
    pub fn new(
        experiment_id: ExperimentId,
        num_workers: usize,
        controller_url: &str,
        log_format: LogFormat,
        log_level: Option<LogLevel>,
        output_location: OutputLocation,
        log_folder: PathBuf,
        target_max_group_size: Option<usize>,
        js_runner_initial_heap_constraint: Option<usize>,
        js_runner_max_heap_size: Option<usize>,
    ) -> Self {
        // The NNG URL that the engine process will listen on
        let engine_url = format!("ipc://run-{experiment_id}");

        Self {
            experiment_id,
            engine_url,
            controller_url: controller_url.to_string(),
            num_workers,
            log_format,
            log_level,
            output_location,
            log_folder,
            target_max_group_size,
            js_runner_initial_heap_constraint,
            js_runner_max_heap_size,
        }
    }
}

#[async_trait]
impl process::Command for LocalCommand {
    /// Spawns an engine process and returns its handle as a [`LocalProcess`].
    ///
    /// # Errors
    ///
    /// - if the process could not be spawned
    async fn run(self: Box<Self>) -> Result<Box<dyn process::Process + Send>> {
        let engine_path = std::env::var("ENGINE_PATH");
        let process_path = if let Ok(process_path) = &engine_path {
            process_path.as_str()
        } else if Path::new(ENGINE_BIN_PATH_DEFAULT).exists() {
            ENGINE_BIN_PATH_DEFAULT
        } else {
            ENGINE_BIN_PATH_FALLBACK
        };

        let mut cmd = tokio::process::Command::new(process_path);
        cmd.arg("--experiment-id")
            .arg(self.experiment_id.to_string())
            .arg("--orchestrator-url")
            .arg(&self.controller_url)
            .arg("--listen-url")
            .arg(&self.engine_url)
            .arg("--num-workers")
            .arg(self.num_workers.to_string())
            .arg("--log-format")
            .arg(self.log_format.to_string())
            .arg("--output")
            .arg(self.output_location.to_string())
            .arg("--log-folder")
            .arg(self.log_folder)
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit());
        if let Some(log_level) = self.log_level {
            cmd.arg("--log-level").arg(log_level.to_string());
        }
        if let Some(target_max_group_size) = self.target_max_group_size {
            cmd.arg("--target-max-group-size")
                .arg(target_max_group_size.to_string());
        }
        if let Some(js_runner_initial_heap_constraint) = self.js_runner_initial_heap_constraint {
            cmd.arg("--js-runner-initial-heap-constraint")
                .arg(js_runner_initial_heap_constraint.to_string());
        }
        if let Some(js_runner_max_heap_size) = self.js_runner_max_heap_size {
            cmd.arg("--js-runner-max-heap-size")
                .arg(js_runner_max_heap_size.to_string());
        }
        debug!("Running `{cmd:?}`");

        let child = cmd.spawn().into_report().change_context_lazy(|| {
            OrchestratorError::from(format!("Could not run command: {process_path:?}"))
        })?;
        debug!("Spawned local engine process for experiment");

        Ok(Box::new(LocalProcess {
            child,
            client: None,
            engine_url: self.engine_url.clone(),
        }))
    }
}
