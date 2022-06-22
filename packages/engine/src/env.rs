use error_stack::{Report, ResultExt};
use execution::package::experiment::ExperimentId;
use thiserror::Error as ThisError;
use tokio::time::Duration;

use crate::{
    proto::{EngineMsg, EngineStatus, ExecutionEnvironment, ExperimentRun, InitMessage},
    Args,
};

pub type Result<T, E = Error> = std::result::Result<T, E>;

const INIT_MSG_RECV_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Env error: {0}")]
    Unique(String),

    #[error("Nano error: {0:?}")]
    Nano(Report<nano::ErrorKind>),

    #[error("Unexpected message to the engine, expected an init message")]
    UnexpectedEngineMsgExpectedInit,
}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::Unique(s.to_string())
    }
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Unique(s)
    }
}

impl From<Report<nano::ErrorKind>> for Error {
    fn from(report: Report<nano::ErrorKind>) -> Self {
        Self::Nano(report)
    }
}

pub struct OrchClient {
    url: String,
    experiment_id: ExperimentId,
    client: nano::Client,
}

impl OrchClient {
    pub fn new(url: &str, experiment_id: ExperimentId) -> Result<Self> {
        let client = nano::Client::new(url, 1).attach_printable_lazy(|| {
            format!("Could not create orchestrator client for {url:?}")
        })?;
        Ok(OrchClient {
            url: url.into(),
            experiment_id,
            client,
        })
    }

    pub async fn send(&mut self, msg: EngineStatus) -> Result<()> {
        let m = crate::proto::OrchestratorMsg {
            experiment_id: self.experiment_id,
            body: msg,
        };
        tokio::time::timeout(Duration::from_secs(5), self.client.send(&m))
            .await
            .map_err(|_| Error::from("send engine status timeout"))?
            .map_err(Error::from)
    }

    pub fn try_clone(&self) -> Result<Self> {
        OrchClient::new(&self.url, self.experiment_id)
    }
}

pub struct Environment {
    pub orch_client: OrchClient,
    pub orch_listener: nano::Server,
    // TODO: extended experiment run??
    pub experiment: ExperimentRun,
    // TODO: UNUSED: Needs triage
    pub execution_env: ExecutionEnvironment,
    pub dyn_payloads: serde_json::Map<String, serde_json::Value>,
}

pub async fn env(args: &Args) -> Result<Environment> {
    let mut orch_client = OrchClient::new(&args.orchestrator_url, args.experiment_id)?;
    tracing::debug!("Connected to orchestrator at {}", &args.orchestrator_url);

    let mut orch_listener = nano::Server::new(&args.listen_url)?;
    tracing::debug!("Listening on NNG socket at {}", &args.listen_url);

    // Before it will send the init message, we must tell the orchestrator that the
    // engine has started
    orch_client.send(EngineStatus::Started).await?;
    tracing::debug!("Sent started message");

    // Wait for the init message from the orchestrator
    let InitMessage {
        experiment,
        env: execution_env,
        dyn_payloads,
    } = recv_init_msg(&mut orch_listener).await?;
    tracing::debug!("Received initialization message from the orchestrator");

    Ok(Environment {
        orch_client,
        orch_listener,
        experiment,
        execution_env,
        dyn_payloads,
    })
}

async fn recv_init_msg(orch_listener: &mut nano::Server) -> Result<InitMessage> {
    let msg = tokio::time::timeout(INIT_MSG_RECV_TIMEOUT, orch_listener.recv::<EngineMsg>())
        .await
        .map_err(|_| Error::from("receive init message timeout"))??;

    match msg {
        EngineMsg::Init(init) => Ok(init),
    }
}
