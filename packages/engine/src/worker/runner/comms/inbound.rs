use std::fmt;

use super::{NewSimulationRun, RunnerTaskMsg, StateInterimSync};
use crate::{
    datastore::table::sync::{ContextBatchSync, StateSync},
    proto::SimulationShortId,
    types::TaskId,
};
use crate::datastore::table::sync::WaitableStateSync;

pub enum InboundToRunnerMsgPayload {
    TaskMsg(RunnerTaskMsg),
    CancelTask(TaskId),
    StateSync(WaitableStateSync),
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
    pub sim_id: SimulationShortId,
    pub payload: InboundToRunnerMsgPayload,
}
