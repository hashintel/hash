use serde::{Deserialize, Serialize};
use tracing::Span;

use crate::{
    package::simulation::SimulationId,
    runner::{self, comms::TargetedRunnerTaskMsg, Language},
    task::TaskId,
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

#[derive(Debug)]
pub struct OutboundFromRunnerMsg {
    // TODO: UNUSED: Needs triage
    pub span: Span,
    pub source: Language,
    pub sim_id: SimulationId,
    pub payload: OutboundFromRunnerMsgPayload,
    // shared state
}
