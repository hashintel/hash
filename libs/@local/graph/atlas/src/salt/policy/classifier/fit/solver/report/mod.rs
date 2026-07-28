//! The solver's reports: diagnosis instruments over published generations.
//!
//! Nothing here is pipeline machinery: a report observes a solve, it never participates in one.

mod probe;

pub(crate) use self::probe::probe_fold;
