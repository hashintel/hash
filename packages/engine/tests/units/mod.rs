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

mod comments {
    use crate::run_test;

    run_test!(comments);
}

// TODO: figure out where it makes the most sense to put this, in the same folder? How do we
//  better convey the ideas of the group above, compared to other unit-like integration tests we may
//  wish to make
mod multiple_groups;
