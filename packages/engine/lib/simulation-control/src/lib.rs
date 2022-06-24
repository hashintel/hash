#![cfg_attr(test, feature(test))]

pub mod command;
pub mod comms;
pub mod controller;

mod agent_control;
mod engine;
mod error;
mod status;
mod step_result;

#[cfg(test)]
mod tests;

pub use self::{
    error::{Error, Result},
    status::SimStatus,
};
