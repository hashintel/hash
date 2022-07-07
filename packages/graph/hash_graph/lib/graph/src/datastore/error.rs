use std::fmt;

use error_stack::Context;

use crate::types::BaseId;

#[derive(Debug)]
#[must_use]
pub struct InsertionError;

impl fmt::Display for InsertionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not insert into datastore")
    }
}

impl Context for InsertionError {}

#[derive(Debug)]
#[must_use]
pub struct QueryError;

impl fmt::Display for QueryError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not query from datastore")
    }
}

impl Context for QueryError {}

#[derive(Debug)]
#[must_use]
pub struct UpdateError;

impl fmt::Display for UpdateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not update datastore")
    }
}

impl Context for UpdateError {}

#[derive(Debug)]
#[must_use]
pub struct BaseIdAlreadyExists {
    pub base_id: BaseId,
}

impl BaseIdAlreadyExists {
    pub const fn new(base_id: BaseId) -> Self {
        Self { base_id }
    }
}

impl fmt::Display for BaseIdAlreadyExists {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Base id does not exist")
    }
}

impl Context for BaseIdAlreadyExists {}

#[derive(Debug)]
#[must_use]
pub struct BaseIdDoesNotExist;

impl fmt::Display for BaseIdDoesNotExist {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Base id already exists")
    }
}

impl Context for BaseIdDoesNotExist {}
