use super::TargetedRunnerTaskMsg;
use crate::hash_types::worker;
use crate::{proto::SimulationShortID, types::TaskID, Language};

#[derive(Debug, Default, Clone)]
pub struct RunnerError {
    pub message: Option<String>,
    pub details: Option<String>,
    pub file_name: Option<String>,
    pub line_number: Option<i32>,
}

impl RunnerError {
    pub fn into_sendable(self, is_warning: bool) -> worker::RunnerError {
        worker::RunnerError {
            message: self.message,
            code: None,
            line_number: self.line_number,
            file_name: self.file_name,
            details: self.details,
            is_warning,
            is_internal: false,
        }
    }
}

#[derive(Debug)]
pub enum OutboundFromRunnerMsgPayload {
    TaskMsg(TargetedRunnerTaskMsg),
    TaskCancelled(TaskID),
    RunnerError(RunnerError),
    RunnerErrors(Vec<RunnerError>),
    RunnerWarning(RunnerError),
    RunnerWarnings(Vec<RunnerError>),
}

#[derive(Debug)]
pub struct OutboundFromRunnerMsg {
    pub source: Language,
    pub sim_id: SimulationShortID,
    pub payload: OutboundFromRunnerMsgPayload,
    // shared state
}

impl From<nng::Message> for OutboundFromRunnerMsg {
    fn from(msg: nng::Message) -> Self {
        let _bytes = msg.as_slice();
        todo!()
    }
}
