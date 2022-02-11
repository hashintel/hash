use std::path::PathBuf;

use async_trait::async_trait;
use error::{Report, Result, ResultExt};
use hash_engine_lib::{
    nano,
    proto::{EngineMsg, ExperimentId},
    utils::{LogFormat, LogLevel, OutputLocation},
};

use crate::process;

#[cfg(debug_assertions)]
const PROCESS_PATH_DEFAULT: &str = "./target/debug/hash_engine";

#[cfg(not(debug_assertions))]
const PROCESS_PATH_DEFAULT: &str = "./target/release/hash_engine";

/// A local [`hash_engine`] subprocess using the [`std::process`] library.  
pub struct LocalProcess {
    child: std::process::Child,
    client: Option<nano::Client>,
    engine_url: String,
}

#[async_trait]
impl process::Process for LocalProcess {
    async fn exit_and_cleanup(mut self: Box<Self>) -> Result<()> {
        self.child
            .kill()
            .or_else(|e| match e.kind() {
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
}

impl LocalCommand {
    /// Creates a new [`LocalProcess`] with the provided parameters.
    pub fn new(
        experiment_id: ExperimentId,
        num_workers: usize,
        controller_url: &str,
        log_format: LogFormat,
        log_level: Option<LogLevel>,
        output_location: OutputLocation,
        log_folder: PathBuf,
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
        let process_path = engine_path
            .as_ref()
            .map(String::as_str)
            .unwrap_or(PROCESS_PATH_DEFAULT);

        let mut cmd = std::process::Command::new(process_path);
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
