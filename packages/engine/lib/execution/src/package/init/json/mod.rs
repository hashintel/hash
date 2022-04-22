use async_trait::async_trait;
use stateful::agent::Agent;

use crate::{
    package::{init::InitPackage, MaybeCpuBound, Package},
    Error, Result,
};

pub struct JsonInit {
    pub initial_state_src: String,
}

impl Package for JsonInit {}

impl MaybeCpuBound for JsonInit {
    fn cpu_bound(&self) -> bool {
        false
    }
}

#[async_trait]
impl InitPackage for JsonInit {
    async fn run(&mut self) -> Result<Vec<Agent>> {
        // TODO: Map Error when we design package errors
        serde_json::from_str(&self.initial_state_src).map_err(|e| {
            Error::from(format!(
                "Failed to parse agent state JSON to Vec<Agent>: {e:?}"
            ))
        })
    }
}
