//! The stored formats of the DBOS backend.
//!
//! DBOS records a workflow's input and a step's or workflow's error as JSON, and hands them back
//! to a replay or a status read. A crate type that holds a name is stored through a type of the
//! same name with a `Stored` suffix, which holds the name as a string. A test pins each format,
//! since a change to it changes what every recorded run holds.

use alloc::string::String;
use core::num::NonZero;

use serde::{Deserialize, Serialize};

use crate::{
    FailureKind, InvalidName, Payload, RetryPolicy, RunFailure, RunStart, StepFailure, StepIndex,
};

/// A [`RunStart`] as DBOS stores it: the input of the `integration-run` workflow.
///
/// Starting a run again compares the stored start with the new one, so it carries every field of
/// the start, the version included.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct RunStartStored {
    pub version: u32,
    pub admission: String,
    pub policy: RetryPolicy,
    pub input: Payload,
}

impl From<RunStart> for RunStartStored {
    fn from(start: RunStart) -> Self {
        Self {
            version: start.version.get(),
            admission: String::from(start.admission.as_ref()),
            policy: start.policy,
            input: start.input,
        }
    }
}

/// A [`StepFailure`] as DBOS records it for a failed attempt.
///
/// It is the step's application error, so its message names the code and nothing else.
#[derive(
    Debug, Clone, PartialEq, Eq, Serialize, Deserialize, derive_more::Display, derive_more::Error,
)]
#[display("the step failed with `{code}`")]
pub(crate) struct StepFailureStored {
    pub kind: FailureKind,
    pub code: String,
}

impl From<&StepFailure> for StepFailureStored {
    fn from(failure: &StepFailure) -> Self {
        Self {
            kind: failure.kind,
            code: String::from(failure.code.as_ref()),
        }
    }
}

/// A [`RunFailure`] as DBOS records it for a failed workflow.
#[derive(
    Debug, Clone, PartialEq, Eq, Serialize, Deserialize, derive_more::Display, derive_more::Error,
)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub(crate) enum RunFailureStored {
    #[display("step {index} `{name}` failed on attempt {attempts} with `{code}`")]
    Step {
        index: u32,
        name: String,
        attempts: NonZero<u32>,
        code: String,
    },
    #[display(
        "step {index} was recorded as `{recorded}`, but the run function requested `{requested}`"
    )]
    NonDeterministic {
        index: u32,
        recorded: String,
        requested: String,
    },
    #[display("the run function failed with `{code}`")]
    Function { code: String },
}

impl From<RunFailure> for RunFailureStored {
    fn from(failure: RunFailure) -> Self {
        match failure {
            RunFailure::Step {
                index,
                name,
                attempts,
                code,
            } => Self::Step {
                index: index.get(),
                name: String::from(name.as_ref()),
                attempts,
                code: String::from(code.as_ref()),
            },
            RunFailure::NonDeterministic {
                index,
                recorded,
                requested,
            } => Self::NonDeterministic {
                index: index.get(),
                recorded: String::from(recorded.as_ref()),
                requested: String::from(requested.as_ref()),
            },
            RunFailure::Function { code } => Self::Function {
                code: String::from(code.as_ref()),
            },
        }
    }
}

impl TryFrom<RunFailureStored> for RunFailure {
    type Error = InvalidName;

    /// Fails if a stored name or code is not one, which only a record written by something else
    /// can cause.
    fn try_from(failure: RunFailureStored) -> Result<Self, InvalidName> {
        Ok(match failure {
            RunFailureStored::Step {
                index,
                name,
                attempts,
                code,
            } => Self::Step {
                index: StepIndex::new(index),
                name: name.parse()?,
                attempts,
                code: code.parse()?,
            },
            RunFailureStored::NonDeterministic {
                index,
                recorded,
                requested,
            } => Self::NonDeterministic {
                index: StepIndex::new(index),
                recorded: recorded.parse()?,
                requested: requested.parse()?,
            },
            RunFailureStored::Function { code } => Self::Function {
                code: code.parse()?,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use alloc::string::String;
    use core::{num::NonZero, time::Duration};

    use rstest::rstest;
    use serde::Serialize;
    use serde_json::{Value, json};

    use crate::{
        FailureKind, FunctionVersion, InvalidName, Payload, RetryPolicy, RunFailure, RunStart,
        StepFailure, StepIndex,
        dbos::stored::{RunFailureStored, RunStartStored, StepFailureStored},
    };

    fn stored<T: Serialize>(value: &T) -> Value {
        serde_json::to_value(value).expect("should encode the stored value")
    }

    fn step_failure() -> RunFailure {
        RunFailure::Step {
            index: StepIndex::new(2),
            name: "deliver/entities".parse().expect("should be a step name"),
            attempts: NonZero::new(5).expect("five should be nonzero"),
            code: "graph-unavailable"
                .parse()
                .expect("should be a failure code"),
        }
    }

    fn non_deterministic() -> RunFailure {
        RunFailure::NonDeterministic {
            index: StepIndex::new(1),
            recorded: "plan".parse().expect("should be a step name"),
            requested: "capture".parse().expect("should be a step name"),
        }
    }

    fn function_failure() -> RunFailure {
        RunFailure::Function {
            code: "invalid-definition"
                .parse()
                .expect("should be a failure code"),
        }
    }

    #[test]
    fn run_start_format() {
        let start = RunStart {
            admission: "web/linear".parse().expect("should be an admission key"),
            version: FunctionVersion::new(3),
            policy: RetryPolicy {
                max_attempts: NonZero::new(5).expect("five should be nonzero"),
                initial_delay: Duration::from_secs(30),
                max_delay: Duration::from_mins(10),
                multiplier: NonZero::new(2).expect("two should be nonzero"),
            },
            input: Payload::encode(&json!({ "page": 2, "source": "linear" }))
                .expect("should encode the input"),
        };

        assert_eq!(
            stored(&RunStartStored::from(start)),
            json!({
                "version": 3,
                "admission": "web/linear",
                "policy": {
                    "max_attempts": 5,
                    "initial_delay": { "secs": 30, "nanos": 0 },
                    "max_delay": { "secs": 600, "nanos": 0 },
                    "multiplier": 2,
                },
                "input": { "page": 2, "source": "linear" },
            }),
            "a run start should be stored in this format"
        );
    }

    #[test]
    fn step_failure_format() {
        let failure = StepFailure {
            kind: FailureKind::Retryable,
            code: "graph-unavailable"
                .parse()
                .expect("should be a failure code"),
        };

        assert_eq!(
            stored(&StepFailureStored::from(&failure)),
            json!({ "kind": "retryable", "code": "graph-unavailable" }),
            "a step failure should be stored in this format"
        );
    }

    #[rstest]
    #[case::step(
        step_failure(),
        json!({
            "kind": "step",
            "index": 2,
            "name": "deliver/entities",
            "attempts": 5,
            "code": "graph-unavailable",
        })
    )]
    #[case::non_deterministic(
        non_deterministic(),
        json!({
            "kind": "non-deterministic",
            "index": 1,
            "recorded": "plan",
            "requested": "capture",
        })
    )]
    #[case::function(
        function_failure(),
        json!({ "kind": "function", "code": "invalid-definition" })
    )]
    fn run_failure_format(#[case] failure: RunFailure, #[case] expected: Value) {
        let stored_failure = RunFailureStored::from(failure.clone());

        assert_eq!(
            stored(&stored_failure),
            expected,
            "a run failure should be stored in this format"
        );
        assert_eq!(
            RunFailure::try_from(stored_failure).expect("should restore a stored failure"),
            failure,
            "the stored failure should restore unchanged"
        );
    }

    #[test]
    fn run_failure_invalid_name() {
        let stored_failure = RunFailureStored::Function {
            code: String::from("Graph Unavailable"),
        };

        assert_eq!(
            RunFailure::try_from(stored_failure),
            Err(InvalidName::InvalidCharacters),
            "a stored code that is not a name should be rejected"
        );
    }
}
