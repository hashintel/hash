//! Tests different simulations designed to verify a discrete functionality.
//!
//! Each simulation only tries to test a single functionality like setting the state or retrieving
//! neighbors, so in some ways it follows a unit-testing philosophy, but just on user-exposed
//! functionalities.

mod behavior;
mod context;
mod data;
mod globals;
mod message;
mod neighbors;
mod state;
mod topology;
