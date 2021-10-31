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
    KillRunner,
    NewSimulationRun(NewSimulationRun),
}

impl fmt::Debug for InboundToRunnerMsgPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let variant = match self {
            InboundToRunnerMsgPayload::TaskMsg(_) => "TaskMsg",
            InboundToRunnerMsgPayload::CancelTask(_) => "CancelTask",
            InboundToRunnerMsgPayload::StateSync(_) => "StateSync",
            InboundToRunnerMsgPayload::StateSnapshotSync(_) => "StateSnapshotSync",
            InboundToRunnerMsgPayload::ContextBatchSync(_) => "ContextBatchSync",
            InboundToRunnerMsgPayload::StateInterimSync(_) => "StateInterimSync",
            InboundToRunnerMsgPayload::TerminateSimulationRun => "TerminateSimulationRun",
            InboundToRunnerMsgPayload::KillRunner => "KillRunner",
            InboundToRunnerMsgPayload::NewSimulationRun(_) => "NewSimulationRun",
        };
        f.write_str(variant)
    }
}

pub struct InboundToRunnerMsg {
    pub sim_id: SimulationShortID,
    pub payload: InboundToRunnerMsgPayload,
}
