use std::{
    path::{Path, PathBuf},
    process::ExitStatus,
};

use async_trait::async_trait;
use error::{Report, Result, ResultExt};
use hash_engine_lib::{
    proto::{EngineMsg, ExperimentId},
    utils::{LogFormat, LogLevel, OutputLocation},
};

use crate::process;

const ENGINE_BIN_PATH_DEFAULT: &str = env!("CARGO_BIN_FILE_HASH_ENGINE");

#[cfg(debug_assertions)]
const ENGINE_BIN_PATH_FALLBACK: &str = "./target/debug/hash_engine";

#[cfg(not(debug_assertions))]
const ENGINE_BIN_PATH_FALLBACK: &str = "./target/release/hash_engine";

/// A local [`hash_engine`] subprocess using the [`std::process`] library.  
pub struct LocalProcess {
    child: tokio::process::Child,
    client: Option<nano::Client>,
    engine_url: String,
}

#[async_trait]
impl process::Process for LocalProcess {
    async fn exit_and_cleanup(mut self: Box<Self>) -> Result<()> {
        // Let the engine cleanup some resources
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        self.child
            .kill()
            .await
            .or_else(|e| match e.kind() {
                // From `Child::kill` docs: Forces the child process to exit. If the child has
                // already exited, an InvalidInput error is returned
                std::io::ErrorKind::InvalidInput => Ok(()),
                _ => Err(Report::new(e)),
            })
            .wrap_err("Could not kill the process")?;

        debug!("Cleaned up local engine process for experiment");
        Ok(())
    }

    /// Creates or reuses a [`nano::Client`] to send a message to the [`hash_engine`] subprocess.
    ///
    /// # Errors
    ///
    /// - if the [`nano::Client`] could not be created
    /// - if the message could not be sent
    async fn send(&mut self, msg: &EngineMsg) -> Result<()> {
        // We create the client on the first call here, rather than when the LocalCommand is run,
        // because the engine process needs some time before it's ready to accept NNG connections.
        if self.client.is_none() {
            self.client = Some(nano::Client::new(&self.engine_url, 1)?);
        }
        self.client
            .as_mut()
            .unwrap()
            .send(msg)
            .await
            .map_err(Report::from)
    }

    async fn wait(&mut self) -> Result<ExitStatus> {
        self.child
            .wait()
            .await
            .wrap_err("Could not wait for the process to exit")
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

        let child = cmd
            .spawn()
            .wrap_err_lazy(|| format!("Could not run command: {process_path:?}"))?;
        debug!("Spawned local engine process for experiment");

        Ok(Box::new(LocalProcess {
            child,
            client: None,
            engine_url: self.engine_url.clone(),
        }))
    }
}
