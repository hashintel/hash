use async_trait::async_trait;
use error::{Report, Result, ResultExt};
use hash_engine::{nano, proto::EngineMsg, utils::OutputFormat};

use super::process;

#[cfg(debug_assertions)]
const PROCESS_PATH_DEFAULT: &str = "./target/debug/hash_engine";

#[cfg(not(debug_assertions))]
const PROCESS_PATH_DEFAULT: &str = "./target/release/hash_engine";

pub struct LocalProcess {
    experiment_id: String,
    child: std::process::Child,
    client: Option<nano::Client>,
    engine_url: String,
}

#[async_trait]
impl process::Process for LocalProcess {
    #[cfg(target_os = "linux")]
    async fn exit_and_cleanup(mut self: Box<Self>) -> Result<()> {
        use nix::{
            sys::signal::{self, Signal},
            unistd::Pid,
        };

        let mut successful = false;
        match signal::kill(Pid::from_raw(self.child.id() as i32), Signal::SIGINT) {
            Ok(_) => {
                // Allow Engine to exit gracefully.
                debug!("Giving engine a chance to clean-up");
                for attempt in 0..1000 {
                    match self.child.try_wait() {
                        Ok(Some(_)) => {
                            successful = true;
                            break;
                        }
                        Ok(None) => {
                            std::thread::sleep(std::time::Duration::from_millis(1000 * attempt));
                        }
                        Err(e) => {
                            error!("error attempting to wait for engine process to exit: {}", e)
                        }
                    }
                }
                // TODO: remove - here for flamegraph
                if !successful {
                    signal::kill(Pid::from_raw(self.child.id() as i32), Signal::SIGINT)?;
                }
                for attempt in 0..1000 {
                    match self.child.try_wait() {
                        Ok(Some(_)) => {
                            successful = true;
                            break;
                        }
                        Ok(None) => {
                            std::thread::sleep(std::time::Duration::from_millis(1000 * attempt));
                        }
                        Err(e) => {
                            error!("error attempting to wait for engine process to exit: {}", e)
                        }
                    }
                }
            }
            Err(e) => {
                error!("{}", Report::new(e));
            }
        };

        if !successful {
            self.child
                .kill()
                .or_else(|e| match e.kind() {
                    std::io::ErrorKind::InvalidInput => Ok(()),
                    _ => Err(Report::new(e)),
                })
                .wrap_err("Could not kill the process")?;
        }

        debug!(
            "Cleaned up local engine process for experiment {}",
            &self.experiment_id
        );
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    async fn exit_and_cleanup(mut self: Box<Self>) -> Result<()> {
        let mut successful = false;
        for attempt in 0..5 {
            match self.child.try_wait() {
                Ok(Some(_)) => {
                    successful = true;
                    break;
                }
                Ok(None) => {
                    std::thread::sleep(std::time::Duration::from_millis(100 * attempt));
                }
                Err(e) => error!("error attempting to wait for engine process to exit: {}", e),
            }
        }

        if !successful {
            self.child
                .kill()
                .or_else(|e| match e.kind() {
                    std::io::ErrorKind::InvalidInput => Ok(()),
                    _ => Err(Report::new(e)),
                })
                .wrap_err("Could not kill the process")?;
        }

        debug!(
            "Cleaned up local engine process for experiment {}",
            &self.experiment_id
        );
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
    engine_url: String,
    experiment_id: String,
    controller_url: String,
    max_num_workers: usize,
    output_format: OutputFormat,
}

impl LocalCommand {
    pub fn new(
        experiment_id: &str,
        max_num_workers: usize,
        controller_url: &str,
        output_format: OutputFormat,
    ) -> Result<Self> {
        // The NNG URL that the engine process will listen on
        let engine_url = format!("ipc://run-{experiment_id}");

        Ok(LocalCommand {
            engine_url,
            experiment_id: experiment_id.to_string(),
            controller_url: controller_url.to_string(),
            max_num_workers,
            output_format,
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
            .arg("--emit")
            .arg(self.output_format.to_string())
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit());
        debug!("Running `{cmd:?}`");

        let child = cmd
            .spawn()
            .wrap_err_lazy(|| format!("Could not run command: {process_path:?}"))?;
        debug!(
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
