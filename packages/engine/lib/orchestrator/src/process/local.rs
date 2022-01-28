use std::path::PathBuf;

use async_trait::async_trait;
use error::{Report, Result, ResultExt};
use hash_engine::{
    nano,
    proto::{EngineMsg, ExperimentId},
    utils::{OutputFormat, OutputLocation},
};

use crate::process;

#[cfg(debug_assertions)]
const PROCESS_PATH_DEFAULT: &str = "./target/debug/hash_engine";

#[cfg(not(debug_assertions))]
const PROCESS_PATH_DEFAULT: &str = "./target/release/hash_engine";

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

pub struct LocalCommand {
    experiment_id: ExperimentId,
    engine_url: String,
    controller_url: String,
    max_num_workers: usize,
    output_format: OutputFormat,
    output_location: OutputLocation,
    log_folder: PathBuf,
}

impl LocalCommand {
    pub fn new(
        experiment_id: ExperimentId,
        max_num_workers: usize,
        controller_url: &str,
        output_format: OutputFormat,
        output_location: OutputLocation,
        log_folder: PathBuf,
    ) -> Result<Self> {
        // The NNG URL that the engine process will listen on
        let engine_url = format!("ipc://run-{experiment_id}");

        Ok(LocalCommand {
            experiment_id,
            engine_url,
            controller_url: controller_url.to_string(),
            max_num_workers,
            output_format,
            output_location,
            log_folder,
        })
    }
}

#[async_trait]
impl process::Command for LocalCommand {
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
            .arg("--max-workers")
            .arg(self.max_num_workers.to_string())
            .arg("--emit")
            .arg(self.output_format.to_string())
            .arg("--output")
            .arg(self.output_location.to_string())
            .arg("--log-folder")
            .arg(self.log_folder)
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit());
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
