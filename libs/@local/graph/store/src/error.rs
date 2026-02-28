use core::{error::Error, fmt};

#[derive(Debug)]
#[must_use]
pub struct InsertionError;

impl fmt::Display for InsertionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not insert into store")
    }
}

impl Error for InsertionError {}

#[derive(Debug, Clone)]
#[must_use]
pub struct QueryError;

impl fmt::Display for QueryError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not query from store")
    }
}

impl Error for QueryError {}

#[derive(Debug)]
#[must_use]
pub struct UpdateError;

impl fmt::Display for UpdateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not update store")
    }
}

impl Error for UpdateError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not delete from the store: {_variant}")]
#[must_use]
pub enum DeletionError {
    #[display("decision time must not exceed transaction time")]
    InvalidDecisionTime,
    #[display("{count} incoming links point to the target entities")]
    IncomingLinksExist { count: u64 },
    #[display("expected {expected} entity_ids rows affected, got {actual}")]
    InconsistentEntityIds { expected: u64, actual: u64 },
    #[display("store operation failed")]
    Store,
}

impl Error for DeletionError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not check permissions: {_variant}")]
pub enum CheckPermissionError {
    #[display("Could not resolve policies")]
    BuildPolicyContext,
    #[display("Could not build policy set")]
    BuildPolicySet,
    #[display("Could not evaluate policy set")]
    EvaluatePolicySet,
    #[display("Could not compile filter")]
    CompileFilter,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for CheckPermissionError {}
