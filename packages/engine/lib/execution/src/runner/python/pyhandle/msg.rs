use pyo3::ToPyObject;
use tokio::sync::mpsc::UnboundedSender;
use tracing::Span;

use super::PyHandle;
use crate::{
    package::simulation::SimulationId,
    runner::{
        comms::{
            InboundToRunnerMsgPayload, OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload,
            RunnerTaskMessage,
        },
        python::error::PythonError,
        Language,
    },
};

impl<'py> PyHandle<'py> {
    pub(crate) fn handle_msg(
        &mut self,
        sim_id: Option<SimulationId>,
        msg: InboundToRunnerMsgPayload,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> Result<bool, crate::runner::python::error::PythonError> {
        match msg {
            InboundToRunnerMsgPayload::TaskMsg(msg) => {
                let sim_id =
                    sim_id.ok_or(PythonError::SimulationIdRequired("run task".to_owned()))?;
                self.handle_task_msg(sim_id, msg, outbound_sender)?
            }
            InboundToRunnerMsgPayload::CancelTask(_) => {
                todo!("cancel messages have not yet been implemented")
            }
            InboundToRunnerMsgPayload::StateSync(msg) => {
                let sim_id =
                    sim_id.ok_or(PythonError::SimulationIdRequired("state sync".to_owned()))?;
                self.state_sync(sim_id, msg)?;
            }
            InboundToRunnerMsgPayload::StateSnapshotSync(msg) => {
                let sim_id =
                    sim_id.ok_or(PythonError::SimulationIdRequired("state sync".to_owned()))?;
                self.state_snapshot_sync(sim_id, msg)?;
            }
            InboundToRunnerMsgPayload::ContextBatchSync(msg) => {
                let sim_id = sim_id.ok_or(PythonError::SimulationIdRequired(
                    "context batch sync".to_owned(),
                ))?;
                self.context_batch_sync(sim_id, msg)?;
            }
            InboundToRunnerMsgPayload::StateInterimSync(msg) => {
                let sim_id = sim_id.ok_or(PythonError::SimulationIdRequired(
                    "state interim sync".to_owned(),
                ))?;
                self.state_interim_sync(sim_id, &msg.shared_store)?;
            }
            InboundToRunnerMsgPayload::TerminateSimulationRun => {
                let sim_id = sim_id.ok_or(PythonError::SimulationIdRequired(
                    "terminate sim".to_owned(),
                ))?;
                self.simulation_states
                    .remove(&sim_id)
                    .ok_or(PythonError::TerminateMissingSimulationRun(sim_id))?;
            }
            InboundToRunnerMsgPayload::TerminateRunner => return Ok(true),
            InboundToRunnerMsgPayload::NewSimulationRun(new_sim_run) => {
                self.start_sim(new_sim_run)?;
            }
        }

        Ok(true)
    }

    fn handle_task_msg(
        &mut self,
        sim_id: SimulationId,
        msg: RunnerTaskMessage,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> Result<(), PythonError> {
        self.state_interim_sync(sim_id, &msg.shared_store)?;
        let (payload, wrapper) = msg
            .payload
            .extract_inner_msg_with_wrapper()
            .map_err(|err| {
                PythonError::Unique(format!("Failed to extract the inner task message: {err}"))
            })?;

        let payload_str = {
            let s = serde_json::to_string(&payload)?;
            s.to_object(self.py)
        };
        let group_index = msg.group_index.to_object(self.py);

        let py_sim_id = sim_id.as_u32().to_object(self.py);
        let py_package_id = usize::from(msg.package_id.as_usize()).to_object(self.py);

        // TODO: handle user errors differently to fatal errors
        let next_task_msg = self.run_task(
            &[py_sim_id, group_index, py_package_id, payload_str.into()],
            sim_id,
            msg.group_index,
            msg.package_id,
            msg.task_id,
            &wrapper,
            msg.shared_store,
        )?;

        outbound_sender
            .send(OutboundFromRunnerMsg {
                span: Span::current(),
                source: Language::Python,
                sim_id,
                payload: OutboundFromRunnerMsgPayload::TaskMsg(next_task_msg),
            })
            .unwrap();

        Ok(())
    }
}
