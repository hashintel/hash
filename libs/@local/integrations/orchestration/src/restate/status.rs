//! Finding a run by its ID and reading its [`RunStatus`].
//!
//! Restate tells a client whether a call has finished, and knows a call by an ID of its own. The
//! orchestrator asks for a run by the run's ID, and for its phase and recorded steps while it
//! executes. Both come from the tables of Restate's admin API, read with SQL: `sys_invocation`
//! has a row per call of a handler, and `sys_journal` a row per journal entry of a call.

use alloc::{format, string::String, vec::Vec};

use error_stack::{Report, ResultExt as _};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::json;

use super::{
    RestateBackend, RestateError,
    run::{CANCELLED, Failure},
    send,
};
use crate::{RunFailure, RunId, RunPhase, RunStatus};

/// A run's row in the `sys_invocation` table.
#[derive(Deserialize)]
pub(crate) struct Invocation {
    /// The ID Restate gave the call.
    pub id: String,
    /// `success` or `failure`, once the run has finished.
    pub completion_result: Option<String>,
    /// `[<status code>] <message>` of the error a failed run's handler ended with.
    completion_failure: Option<String>,
}

impl RestateBackend {
    /// Reads the row of `run`, or `None` if no run has this ID.
    pub(crate) async fn invocation(
        &self,
        run: &RunId,
    ) -> Result<Option<Invocation>, Report<RestateError>> {
        let invocations = self
            .query(&format!(
                "SELECT id, completion_result, completion_failure FROM sys_invocation WHERE \
                 target_service_name = 'IntegrationRun' AND idempotency_key = '{run}'"
            ))
            .await?;
        Ok(invocations.into_iter().next())
    }

    /// Reads the phase of `run` and the number of its recorded steps, or `None` if no run has
    /// this ID.
    pub(crate) async fn read_status(
        &self,
        run: &RunId,
    ) -> Result<Option<RunStatus>, Report<RestateError>> {
        #[derive(Deserialize)]
        struct Steps {
            steps: u32,
        }

        let Some(invocation) = self.invocation(run).await? else {
            return Ok(None);
        };
        // Restate journals the result of a step, a failure included, as a notification.
        let journaled: Vec<Steps> = self
            .query(&format!(
                "SELECT COUNT(*) AS steps FROM sys_journal WHERE id = '{}' AND entry_type = \
                 'Notification: Run'",
                invocation.id
            ))
            .await?;
        let steps = journaled.first().map_or(0, |count| count.steps);

        let phase = match invocation.completion_result.as_deref() {
            Some("success") => RunPhase::Completed,
            Some(_) => finished_phase(invocation.completion_failure.as_deref().unwrap_or_default()),
            None if steps == 0 => RunPhase::Pending,
            None => RunPhase::Running,
        };
        // A step that failed the run is journaled, but is not a recorded step.
        let failed_steps = u32::from(matches!(phase, RunPhase::Failed(RunFailure::Step { .. })));
        Ok(Some(RunStatus {
            phase,
            steps_recorded: steps - failed_steps,
        }))
    }

    /// Runs `sql` on the tables. A run's ID holds only lowercase letters, digits, `-` and `_`,
    /// so it needs no escaping.
    async fn query<T: DeserializeOwned>(&self, sql: &str) -> Result<Vec<T>, Report<RestateError>> {
        #[derive(Deserialize)]
        struct Rows<T> {
            rows: Vec<T>,
        }

        let request = self
            .http
            .post(format!("{}/query", self.config.admin_url))
            .header(reqwest::header::ACCEPT, "application/json")
            .json(&json!({ "query": sql }));
        let rows: Rows<T> = send(request)
            .await?
            .json()
            .await
            .change_context(RestateError::Request)?;
        Ok(rows.rows)
    }
}

/// The phase of a run whose handler ended with an error, from `[<status code>] <message>`.
///
/// An error this backend did not write, such as the one of a run Restate killed, reads as a
/// backend failure.
fn finished_phase(failure: &str) -> RunPhase {
    if failure.starts_with(&format!("[{CANCELLED}]")) {
        return RunPhase::Cancelled;
    }
    let recorded = failure
        .split_once(' ')
        .and_then(|(_, message)| serde_json::from_str::<Failure>(message).ok())
        .and_then(|failure| RunFailure::try_from(failure).ok());
    RunPhase::Failed(recorded.unwrap_or_else(|| RunFailure::Function {
        code: "backend-error".parse().expect("should be a failure code"),
    }))
}
