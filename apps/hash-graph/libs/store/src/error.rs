use core::fmt;

use error_stack::Context;

#[derive(Debug)]
#[must_use]
pub struct InsertionError;

impl fmt::Display for InsertionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not insert into store")
    }
}

impl Context for InsertionError {}

#[derive(Debug, Clone)]
#[must_use]
pub struct QueryError;

impl fmt::Display for QueryError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not query from store")
    }
}

impl Context for QueryError {}

#[derive(Debug)]
#[must_use]
pub struct UpdateError;

impl fmt::Display for UpdateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not update store")
    }
}

impl Context for UpdateError {}

#[derive(Debug)]
#[must_use]
pub struct DeletionError;

impl fmt::Display for DeletionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not delete from the store")
    }
}
