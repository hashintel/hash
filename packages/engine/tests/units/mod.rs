//! Tests different simulations on discrete functionality of a simulation run.
//!
//! Each simulation only tries to test a single functionality like setting the state or retreiving
//! neighbors, so it's a unit-testing philosophy on an experiment run.

/// Helper for parsing an experiment and run it.
mod experiment;

mod message;
mod state;
