//! TODO: DOC
use std::fmt;

use crate::{
    package::simulation::SimulationId,
    runner::comms::{NewSimulationRun, RunnerTaskMessage, StateInterimSync},
    task::TaskId,
    worker::{ContextBatchSync, StateSync, SyncPayload, WaitableStateSync},
};

/// TODO: DOC
pub enum InboundToRunnerMsgPayload {
    TaskMsg(RunnerTaskMessage),
    CancelTask(TaskId),
    StateSync(WaitableStateSync),
    StateSnapshotSync(StateSync),
    ContextBatchSync(ContextBatchSync),
    StateInterimSync(StateInterimSync),
    TerminateSimulationRun,
    TerminateRunner,
    NewSimulationRun(NewSimulationRun),
}

impl From<SyncPayload> for InboundToRunnerMsgPayload {
    fn from(payload: SyncPayload) -> Self {
        match payload {
            SyncPayload::State(s) => Self::StateSync(s),
            SyncPayload::StateSnapshot(s) => Self::StateSnapshotSync(s),
            SyncPayload::ContextBatch(c) => Self::ContextBatchSync(c),
        }
    }
}

impl InboundToRunnerMsgPayload {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TaskMsg(_) => "TaskMsg",
            Self::CancelTask(_) => "CancelTask",
            Self::StateSync(_) => "StateSync",
            Self::StateSnapshotSync(_) => "StateSnapshotSync",
            Self::ContextBatchSync(_) => "ContextBatchSync",
            Self::StateInterimSync(_) => "StateInterimSync",
            Self::TerminateSimulationRun => "TerminateSimulationRun",
            Self::TerminateRunner => "TerminateRunner",
            Self::NewSimulationRun(_) => "NewSimulationRun",
        }
    }
}

impl fmt::Debug for InboundToRunnerMsgPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// TODO: DOC
// TODO: UNUSED: Needs triage
pub struct InboundToRunnerMsg {
    pub sim_id: SimulationId,
    pub payload: InboundToRunnerMsgPayload,
}
