mod args;
mod execution;
mod logging;

use std::time::Duration;

use experiment_structure::ExperimentRun;
use simulation_control::EngineStatus;

pub use self::{
    args::Args,
    execution::ExecutionEnvironment,
    logging::{init_logger, texray::examine, LogFormat, LogLevel, OutputLocation},
};
use crate::{
    comms::{EngineMsg, InitMessage, OrchClient},
    Error, Result,
};

const INIT_MSG_RECV_TIMEOUT: Duration = Duration::from_secs(60);

pub struct Environment {
    pub orch_client: OrchClient,
    pub orch_listener: nano::Server,
    // TODO: extended experiment run??
    pub experiment: ExperimentRun,
    // TODO: UNUSED: Needs triage
    pub execution_env: ExecutionEnvironment,
    pub dyn_payloads: serde_json::Map<String, serde_json::Value>,
}

impl Environment {
    pub async fn new(args: &Args) -> Result<Environment> {
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
        } = Self::recv_init_msg(&mut orch_listener).await?;
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
}
