pub mod javascript;
pub mod python;
pub mod rust;

pub mod comms;

use execution::runner::comms::{InboundToRunnerMsgPayload, OutboundFromRunnerMsg};
use simulation_structure::SimulationShortId;

use self::comms::ExperimentInitRunnerMsg;
use crate::worker::error::Result;

/// TODO: DOC
#[async_trait::async_trait]
pub trait LanguageWorker {
    async fn new(spawn: bool, exp_init: ExperimentInitRunnerMsg) -> Self;
    async fn send<K: TryInto<InboundToRunnerMsgPayload>>(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: K,
    ) -> Result<()>;
    async fn send_if_spawned<K: TryInto<InboundToRunnerMsgPayload>>(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: K,
    ) -> Result<()>;
    async fn recv(&mut self) -> Result<OutboundFromRunnerMsg>;
    async fn recv_now(&mut self) -> Result<Option<OutboundFromRunnerMsg>>;
    async fn run(&mut self) -> Result<()>;
    fn spawned(&self) -> bool;
}
