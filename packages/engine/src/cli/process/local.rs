use super::error::{Error, Result};
use super::process;
use async_trait::async_trait;
use hash_prime::nano;
use hash_prime::proto::{EngineMsg, ExperimentRun};

#[cfg(debug_assertions)]
const PROCESS_PATH_DEFAULT: &str = "./target/debug/prime_engine";

#[cfg(not(debug_assertions))]
const PROCESS_PATH_DEFAULT: &str = "./target/release/prime_engine";

pub struct LocalProcess {
    experiment_id: String,
    child: std::process::Child,
    client: Option<nano::Client>,
    engine_url: String,
}

#[async_trait]
impl process::Process for LocalProcess {
    async fn exit_and_cleanup(mut self: Box<Self>) -> Result<()> {
        self.child.kill().or_else(|e| match e.kind() {
            std::io::ErrorKind::InvalidInput => Ok(()),
            _ => Err(Error::from(e.to_string())),
        })?;

        log::debug!(
            "Cleaned up local engine process for experiment {}",
            &self.experiment_id
        );
        Ok(())
    }

    async fn send(&mut self, msg: &EngineMsg<ExperimentRun>) -> Result<()> {
        // We create the client on the first call here, rather than when the LocalCommand
        // is run, because the engine process needs some time before it's ready to accept
        // NNG connections.
        if self.client.is_none() {
            self.client = Some(nano::Client::new(&self.engine_url, 1)?);
        }
        self.client
            .as_mut()
            .unwrap()
            .send(msg)
            .await
            .map_err(Error::from)
    }
}

pub struct LocalCommand {
    engine_url: String,
    experiment_id: String,
    controller_url: String,
    max_num_workers: usize,
    persist_data: bool,
}

impl LocalCommand {
    pub fn new(
        experiment_id: &str,
        max_num_workers: usize,
        persist_data: bool,
        controller_url: &str,
    ) -> Result<Self> {
        // The NNG URL that the engine process will listen on
        let engine_url = format!("ipc://run-{}", experiment_id);

        Ok(LocalCommand {
            engine_url,
            experiment_id: experiment_id.to_string(),
            controller_url: controller_url.to_string(),
            max_num_workers,
            persist_data,
        })
    }
}

#[async_trait]
impl process::Command for LocalCommand {
    async fn run(self: Box<Self>) -> Result<Box<dyn process::Process + Send>> {
        let env_process_path = std::env::var("ENGINE_PATH");
        let process_path = if env_process_path.is_err() {
            PROCESS_PATH_DEFAULT
        } else {
            env_process_path.as_ref().unwrap()
        };

        let mut cmd = std::process::Command::new(process_path);
        cmd.arg("--experiment-id")
            .arg(&self.experiment_id)
            .arg("--orchestrator-url")
            .arg(&self.controller_url)
            .arg("--listen-url")
            .arg(&self.engine_url)
            .arg("--max-workers")
            .arg(self.max_num_workers.to_string())
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit());
        if self.persist_data {
            cmd.arg("--persist");
        }

        let child = cmd.spawn().map_err(|e| Error::ExperimentSpawn(e))?;
        log::debug!(
            "Spawned local engine process for experiment {}",
            &self.experiment_id
        );

        Ok(Box::new(LocalProcess {
            experiment_id: self.experiment_id,
            child,
            client: None,
            engine_url: self.engine_url.clone(),
        }))
    }
}
