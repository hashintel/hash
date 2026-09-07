//! Diagnosis instruments for the solver over frozen classifier corpora.
//!
//! Nothing here is pipeline machinery: a report observes a solve, it never participates in one.

mod probe;

#[cfg(test)]
mod tests;

pub(crate) use self::probe::{ProbeCorpus, ProbeSettings, probe_fold};
