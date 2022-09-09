use std::sync::Arc;

use arrow2::datatypes::Schema;
use tokio::sync::mpsc::UnboundedSender;
use tracing::Span;

use super::{
    comms::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, UserError, UserWarning},
    Language,
};
use crate::package::simulation::SimulationId;

/// Due to flushing, need batches and schemas in both Rust and [JS | PY].
///
/// This is because when we flush (write changes to shared memory segment) the
/// schema might change.
pub struct SimState {
    pub agent_schema: Arc<Schema>,
    pub msg_schema: Arc<Schema>,
}

/// This struct contains the [`UserWarning`]s and [`UserError`]s which occured
/// during the execution of a user's code.
///
/// If you are using this from within the Python runner, this struct implements
/// [`pyo3::FromPyObject`], so it is possible to just call `extract` on it
/// (provided the trait is imported).
pub struct UserProgramExecutionStatus {
    pub user_warnings: Vec<UserWarning>,
    pub user_errors: Vec<UserError>,
}

impl UserProgramExecutionStatus {
    /// Sends the errors and warnings (if any exist) from the current runner to
    /// to the simulation controller.
    pub(crate) fn send(
        self,
        sim_id: SimulationId,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
        source: Language,
    ) -> crate::Result<()> {
        if !self.user_errors.is_empty() {
            outbound_sender.send(OutboundFromRunnerMsg {
                span: Span::current(),
                source,
                sim_id,
                payload: OutboundFromRunnerMsgPayload::UserErrors(self.user_errors),
            })?;
        }
        if !self.user_warnings.is_empty() {
            outbound_sender.send(OutboundFromRunnerMsg {
                span: Span::current(),
                source,
                sim_id,
                payload: OutboundFromRunnerMsgPayload::UserWarnings(self.user_warnings),
            })?;
        }
        Ok(())
    }
}

impl<'source> pyo3::FromPyObject<'source> for UserProgramExecutionStatus {
    fn extract(ob: &'source pyo3::PyAny) -> pyo3::PyResult<Self> {
        let cast = ob.cast_as::<pyo3::types::PyDict>()?;
        let user_warnings = cast
            .get_item("user_warnings")
            .map(|user_warnings| {
                user_warnings.extract::<Vec<String>>().map(|warnings| {
                    warnings
                        .into_iter()
                        .map(|error| UserWarning {
                            message: error,
                            details: None,
                        })
                        .collect()
                })
            })
            .unwrap_or(Ok(Vec::new()))?;

        let user_errors = cast
            .get_item("user_errors")
            .map(|user_errors| {
                user_errors
                    .extract::<Vec<String>>()
                    .map(|errors| errors.into_iter().map(UserError).collect())
            })
            .unwrap_or(Ok(Vec::new()))?;

        Ok(Self {
            user_warnings,
            user_errors,
        })
    }
}
