//! TODO: DOC
use std::fmt;

use execution::{
    runner::comms::RunnerTaskMessage,
    task::TaskId,
    worker::{ContextBatchSync, StateSync, SyncPayload, WaitableStateSync},
};
use simulation_structure::SimulationShortId;

use crate::worker::runner::comms::{NewSimulationRun, StateInterimSync};

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

/// TODO: DOC
// TODO: UNUSED: Needs triage
pub struct InboundToRunnerMsg {
    pub sim_id: SimulationShortId,
    pub payload: InboundToRunnerMsgPayload,
}
