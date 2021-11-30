use std::fmt;

use crate::proto::SimulationShortID;

use crate::{
    datastore::table::sync::{ContextBatchSync, StateSync},
    types::TaskID,
};

use super::{NewSimulationRun, RunnerTaskMsg, StateInterimSync};

pub enum InboundToRunnerMsgPayload {
    TaskMsg(RunnerTaskMsg),
    CancelTask(TaskID),
    StateSync(StateSync),
    StateSnapshotSync(StateSync),
    ContextBatchSync(ContextBatchSync),
    StateInterimSync(StateInterimSync),
    TerminateSimulationRun,
    TerminateRunner,
    NewSimulationRun(NewSimulationRun),
}

impl InboundToRunnerMsgPayload {
    pub fn as_str(&self) -> &'static str {
        match self {
            InboundToRunnerMsgPayload::TaskMsg(_) => "TaskMsg",
            InboundToRunnerMsgPayload::CancelTask(_) => "CancelTask",
            InboundToRunnerMsgPayload::StateSync(_) => "StateSync",
            InboundToRunnerMsgPayload::StateSnapshotSync(_) => "StateSnapshotSync",
            InboundToRunnerMsgPayload::ContextBatchSync(_) => "ContextBatchSync",
            InboundToRunnerMsgPayload::StateInterimSync(_) => "StateInterimSync",
            InboundToRunnerMsgPayload::TerminateSimulationRun => "TerminateSimulationRun",
            InboundToRunnerMsgPayload::TerminateRunner => "TerminateRunner",
            InboundToRunnerMsgPayload::NewSimulationRun(_) => "NewSimulationRun",
        }
    }
}

impl fmt::Debug for InboundToRunnerMsgPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

pub struct InboundToRunnerMsg {
    pub sim_id: SimulationShortID,
    pub payload: InboundToRunnerMsgPayload,
}
