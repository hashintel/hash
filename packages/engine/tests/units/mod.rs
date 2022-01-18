//! Tests different simulations designed to verify a discrete functionality.
//!
//! Each simulation only tries to test a single functionality like setting the state or retreiving
//! neighbors, so in some ways it follows a unit-testing philosophy, but just on user-exposed
//! functionalities.

/// Helper for parsing an experiment and run it.
mod experiment;

mod context;
mod globals;
mod message;
mod state;
