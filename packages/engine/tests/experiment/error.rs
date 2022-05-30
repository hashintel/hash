use std::{error::Error, fmt, path::PathBuf};

use provider::{Demand, Provider};
use serde_json::Value;

pub type Result<T, C = TestContext> = error::Result<T, C>;

#[derive(Debug)]
pub enum TestContext {
    TestSetup,
    ExperimentSetup,
    ExperimentRun,
    ExperimentOutput,
}

impl fmt::Display for TestContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TestSetup => fmt.write_str("Test setup failed"),
            Self::ExperimentSetup => fmt.write_str("Experiment setup failed"),
            Self::ExperimentRun => fmt.write_str("Could not finish experiment run"),
            Self::ExperimentOutput => {
                fmt.write_str("Experiment output does not match expectations")
            }
        }
    }
}

impl Provider for TestContext {
    fn provide<'a>(&'a self, _: &mut Demand<'a>) {
        // Empty implementation
    }
}

#[derive(Debug)]
pub enum TestError {
    MultipleLanguages,
    ParseError {
        path: PathBuf,
    },
    UnexpectedOutputValue {
        path: String,
        actual: Value,
        expected: Value,
    },
    UnexpectedOutputLength {
        path: String,
        actual_length: usize,
        expected_length: usize,
        actual: Value,
        expected: Value,
    },
    OutputMissing {
        path: String,
        expected: Value,
    },
    InvalidStep {
        step: String,
    },
    MissingStep {
        step: usize,
    },
}

impl TestError {
    pub fn parse_error<P: Into<PathBuf>>(path: P) -> Self {
        Self::ParseError { path: path.into() }
    }

    pub fn unexpected_output_value(path: String, actual: Value, expected: Value) -> Self {
        Self::UnexpectedOutputValue {
            path,
            actual,
            expected,
        }
    }

    pub fn unexpected_output_length(
        path: String,
        actual: Vec<Value>,
        expected: Vec<Value>,
    ) -> Self {
        Self::UnexpectedOutputLength {
            path,
            actual_length: actual.len(),
            expected_length: expected.len(),
            actual: Value::Array(actual),
            expected: Value::Array(expected),
        }
    }

    pub fn output_missing(path: String, expected: Value) -> Self {
        Self::OutputMissing { path, expected }
    }

    pub fn invalid_step(step: String) -> Self {
        Self::InvalidStep { step }
    }

    pub fn missing_step(step: usize) -> Self {
        Self::MissingStep { step }
    }
}

impl fmt::Display for TestError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MultipleLanguages => {
                fmt.write_str("Exactly one initial state has to be provided for the given language")
            }
            Self::ParseError { path } => write!(fmt, "Could not parse file {path:?}"),
            Self::UnexpectedOutputValue {
                path,
                actual,
                expected,
            } => write!(
                fmt,
                "Unexpected output value at {path:?}: expected `{expected}`, got `{actual}`"
            ),
            Self::UnexpectedOutputLength {
                path,
                actual_length,
                expected_length,
                actual,
                expected,
            } => write!(
                fmt,
                "Unexpected output length at {path:?}: expected length {expected_length}, got \
                 {actual_length}, expected list `{expected}`, got `{actual}`",
            ),
            Self::OutputMissing { path, expected } => {
                write!(fmt, "Output missing at {path:?}: expected `{expected}`")
            }
            Self::InvalidStep { step } => {
                write!(fmt, "Could not parse `{step}` as number of a step")
            }
            Self::MissingStep { step } => {
                write!(fmt, "Experiment output does not contain {step} steps")
            }
        }
    }
}

impl Error for TestError {}

impl Provider for TestError {
    fn provide<'a>(&'a self, _: &mut Demand<'a>) {
        // Empty implementation
    }
}
