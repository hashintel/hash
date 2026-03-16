use core::{error::Error, fmt};

/// Errors during test infrastructure setup: starting the container,
/// connecting to the database, running migrations, or seeding data.
#[derive(Debug)]
pub(crate) enum SetupError {
    Container,
    Connection,
    Migration,
    Seed,
}

impl fmt::Display for SetupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Container => f.write_str("failed to start test container"),
            Self::Connection => f.write_str("failed to connect to database"),
            Self::Migration => f.write_str("failed to run database migrations"),
            Self::Seed => f.write_str("failed to seed test data"),
        }
    }
}

impl Error for SetupError {}

/// Errors during individual test execution.
#[derive(Debug)]
pub(crate) enum TestError {
    Connection,
    ReadSource,
    Execution,
    Serialization,
    OutputMismatch,
}

impl fmt::Display for TestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connection => f.write_str("failed to connect to database"),
            Self::ReadSource => f.write_str("failed to read test source file"),
            Self::Execution => f.write_str("query execution failed"),
            Self::Serialization => f.write_str("failed to serialize result value"),
            Self::OutputMismatch => f.write_str("output comparison failed"),
        }
    }
}

impl Error for TestError {}
