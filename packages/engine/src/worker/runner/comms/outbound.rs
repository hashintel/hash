use crate::{proto::SimulationShortID, types::TaskID, Language};
use nng::Message;

use super::TargetedRunnerTaskMsg;

#[derive(Debug, Default, Clone)]
pub struct RunnerError {
    pub message: Option<String>,
    pub details: Option<String>,
    pub file_name: Option<String>,
    pub line_number: Option<i32>,
}

pub enum OutboundFromRunnerMsgPayload {
    TaskMsg(TargetedRunnerTaskMsg),
    TaskCancelled(TaskID),
    RunnerError(RunnerError),
    RunnerErrors(Vec<RunnerError>),
    RunnerWarning(RunnerError),
    RunnerWarnings(Vec<RunnerError>),
}

pub struct OutboundFromRunnerMsg {
    pub source: Language,
    pub sim_id: SimulationShortID,
    pub payload: OutboundFromRunnerMsgPayload,
    // shared state
}

impl From<nng::Message> for OutboundFromRunnerMsg {
    fn from(_: Message) -> Self {
        todo!()
    }
}
