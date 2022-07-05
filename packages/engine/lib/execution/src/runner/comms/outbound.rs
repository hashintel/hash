use std::collections::HashMap;

use flatbuffers_gen::runner_outbound_msg_generated::root_as_runner_outbound_msg;
use serde::{Deserialize, Serialize};
use tracing::Span;

use crate::{
    package::simulation::SimulationId,
    runner::{
        self,
        comms::{SentTask, TargetedRunnerTaskMsg},
        Language,
    },
    task::TaskId,
    Error, Result,
};

#[derive(Debug, Default, Clone)]
pub struct RunnerError {
    pub message: Option<String>,
    pub details: Option<String>,
    pub file_name: Option<String>,
    pub line_number: Option<i32>,
}

impl RunnerError {
    pub fn into_sendable(self, is_warning: bool) -> runner::RunnerError {
        runner::RunnerError {
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

impl From<flatbuffers_gen::runner_error_generated::RunnerError<'_>> for RunnerError {
    fn from(runner_error: flatbuffers_gen::runner_error_generated::RunnerError<'_>) -> Self {
        Self {
            message: runner_error.msg().map(|msg| msg.to_string()),
            // TODO: these are currently not encapsulated within the Flatbuffers
            details: None,
            file_name: None,
            line_number: None,
        }
    }
}

impl From<flatbuffers_gen::runner_warning_generated::RunnerWarning<'_>> for RunnerError {
    fn from(runner_warning: flatbuffers_gen::runner_warning_generated::RunnerWarning<'_>) -> Self {
        Self {
            message: Some(runner_warning.msg().to_string()),
            details: runner_warning.details().map(|details| details.to_string()),
            // TODO: these are currently not encapsulated within the Flatbuffers
            file_name: None,
            line_number: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserError(pub String);

impl From<flatbuffers_gen::user_error_generated::UserError<'_>> for UserError {
    fn from(user_error: flatbuffers_gen::user_error_generated::UserError<'_>) -> Self {
        Self(user_error.msg().to_string())
    }
}

impl std::fmt::Display for UserError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserWarning {
    pub message: String,
    pub details: Option<String>,
}

impl From<flatbuffers_gen::user_warning_generated::UserWarning<'_>> for UserWarning {
    fn from(user_warning: flatbuffers_gen::user_warning_generated::UserWarning<'_>) -> Self {
        Self {
            message: user_warning.msg().to_string(),
            details: user_warning.details().map(|warning| warning.to_string()),
        }
    }
}

impl std::fmt::Display for UserWarning {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(details) = &self.details {
            write!(f, "Message: {}\nDetails: {}", self.message, details)
        } else {
            write!(f, "Message: {}", self.message)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PackageError(pub String);

impl From<flatbuffers_gen::package_error_generated::PackageError<'_>> for PackageError {
    fn from(package_error: flatbuffers_gen::package_error_generated::PackageError<'_>) -> Self {
        Self(package_error.msg().to_string())
    }
}

impl std::fmt::Display for PackageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug)]
pub enum OutboundFromRunnerMsgPayload {
    TaskMsg(TargetedRunnerTaskMsg),
    // TODO: UNUSED: Needs triage
    TaskCancelled(TaskId),
    // TODO: UNUSED: Needs triage
    RunnerError(RunnerError),
    // TODO: UNUSED: Needs triage
    RunnerErrors(Vec<RunnerError>),
    // TODO: UNUSED: Needs triage
    RunnerWarning(RunnerError),
    // TODO: UNUSED: Needs triage
    RunnerWarnings(Vec<RunnerError>),
    // TODO: UNUSED: Needs triage
    RunnerLog(String),
    RunnerLogs(Vec<String>),
    PackageError(PackageError),
    UserErrors(Vec<UserError>),
    UserWarnings(Vec<UserWarning>),
    SyncCompletion,
}

impl OutboundFromRunnerMsgPayload {
    pub(crate) fn try_from_fbs(
        parsed_msg: flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsg<'_>,
        sent_tasks: &mut HashMap<TaskId, SentTask>,
    ) -> Result<Self> {
        Ok(match parsed_msg.payload_type() {
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::NONE => {
                return Err(Error::from("Message from runner had no payload"));
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::TaskMsg => {
                let payload = parsed_msg.payload_as_task_msg().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a TaskMsg payload but it was missing",
                    )
                })?;
                Self::TaskMsg(TargetedRunnerTaskMsg::try_from_fbs(payload, sent_tasks)?)
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::TaskCancelled => {
                let payload = parsed_msg.payload_as_task_cancelled().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a TaskCancelled payload but it was \
                         missing",
                    )
                })?;

                let task_id = payload.task_id().ok_or_else(|| {
                    Error::from("Message from runner should have had a task_id but it was missing")
                })?;

                Self::TaskCancelled(TaskId::from_slice(&task_id.0)?)
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::RunnerError => {
                let payload = parsed_msg.payload_as_runner_error().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a RunnerError payload but it was \
                         missing",
                    )
                })?;

                Self::RunnerError(payload.into())
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::RunnerErrors => {
                let payload = parsed_msg.payload_as_runner_errors().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a RunnerErrors payload but it was \
                         missing",
                    )
                })?;
                let runner_errors = payload
                    .inner()
                    .iter()
                    .map(|runner_error| runner_error.into())
                    .collect();
                Self::RunnerErrors(runner_errors)
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::RunnerWarning => {
                let payload = parsed_msg.payload_as_runner_warning().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a RunnerWarning payload but it was \
                         missing",
                    )
                })?;

                Self::RunnerWarning(payload.into())
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::RunnerWarnings => {
                let payload = parsed_msg.payload_as_runner_warnings().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a RunnerWarnings payload but it was \
                         missing",
                    )
                })?;

                let runner_warnings = payload
                    .inner()
                    .iter()
                    .map(|runner_warning| runner_warning.into())
                    .collect();
                Self::RunnerWarnings(runner_warnings)
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::PackageError => {
                let payload = parsed_msg.payload_as_package_error().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a PackageError payload but it was \
                         missing",
                    )
                })?;

                Self::PackageError(payload.into())
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::UserErrors => {
                let payload = parsed_msg.payload_as_user_errors().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a UserErrors payload but it was \
                         missing",
                    )
                })?;

                let user_errors = payload
                    .inner()
                    .iter()
                    .map(|user_error| user_error.into())
                    .collect();
                Self::UserErrors(user_errors)
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::UserWarnings => {
                let payload = parsed_msg.payload_as_user_warnings().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a UserWarnings payload but it was \
                         missing",
                    )
                })?;

                let user_warnings = payload
                    .inner()
                    .iter()
                    .map(|user_warning| user_warning.into())
                    .collect();
                Self::UserWarnings(user_warnings)
            }
            flatbuffers_gen::runner_outbound_msg_generated::RunnerOutboundMsgPayload::SyncCompletion => {
                let _payload = parsed_msg.payload_as_sync_completion().ok_or_else(|| {
                    Error::from(
                        "Message from runner should have had a SyncCompletion payload but it \
                        was missing",
                    )
                })?;
                Self::SyncCompletion
            }
            _ => return Err(Error::from("Invalid outbound flatbuffers message payload")),
        })
    }
}

#[derive(Debug)]
pub struct OutboundFromRunnerMsg {
    // TODO: UNUSED: Needs triage
    pub span: Span,
    pub source: Language,
    pub sim_id: SimulationId,
    pub payload: OutboundFromRunnerMsgPayload,
    // shared state
}

impl OutboundFromRunnerMsg {
    pub(crate) fn try_from_nng(
        msg: nng::Message,
        source: Language,
        sent_tasks: &mut HashMap<TaskId, SentTask>,
    ) -> Result<Self> {
        let msg = msg.as_slice();
        let msg = root_as_runner_outbound_msg(msg);
        let msg = msg.map_err(|err| {
            Error::from(format!(
                "Flatbuffers failed to parse message bytes as a RunnerOutboundMsg: {err}"
            ))
        })?;
        let payload = OutboundFromRunnerMsgPayload::try_from_fbs(msg, sent_tasks)?;
        Ok(Self {
            span: Span::current(),
            source,
            sim_id: SimulationId::new(msg.sim_sid()),
            payload,
        })
    }
}
