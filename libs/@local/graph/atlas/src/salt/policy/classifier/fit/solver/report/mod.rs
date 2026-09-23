//! Diagnostic probes for the solver over frozen classifier corpora.
//!
//! A report observes a solve and never participates in one.

mod probe;

#[cfg(test)]
mod tests;

pub(crate) use self::probe::{ProbeCorpus, ProbeSettings, probe_fold};
