use std::time::Duration;

use error_stack::ResultExt;
use execution::package::experiment::ExperimentId;
use serde::{Deserialize, Serialize};
use simulation_control::EngineStatus;

use crate::{Error, Result};

/// The message type sent from the engine to the orchestrator.
#[derive(Serialize, Deserialize, Debug)]
pub struct OrchestratorMsg {
    pub experiment_id: ExperimentId,
    pub body: EngineStatus,
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
        let m = OrchestratorMsg {
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
