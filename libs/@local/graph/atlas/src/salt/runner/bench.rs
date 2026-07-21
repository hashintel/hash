//! Measurement seam over one live production run.
//!
//! The harness target (`examples/generation_live.rs`) dials the development store and drives the
//! production run end to end: prior resolution, fit, admission probe, and the activation decision.
//! The fit and quality seams measure their halves in isolation; this seam measures the composition
//! production takes, wrapping the operator seam ([`crate::run`]) with the measurement contract.
//! Nothing here is API for consumers of the crate.
//!
//! Failures panic with the failing step's error: a measurement run has no recovery path, and the
//! error is the diagnosis.

use camino::Utf8PathBuf;
use tokio_postgres::Client;

use crate::file::generation::GenerationRoot;
pub use crate::run::{Options as LiveOptions, Summary as RunSummary};

/// Returns the root's active generation in directory-name form.
///
/// Or [`None`] before the first activation.
///
/// # Panics
///
/// Panics when the root cannot open or the pointer cannot be read; a measurement target reports its
/// failures by failing.
#[must_use]
pub fn current_generation(root: &str) -> Option<String> {
    let root =
        GenerationRoot::new(Utf8PathBuf::from(root)).expect("the generation root should open");
    root.current()
        .expect("the current pointer should read")
        .map(|id| id.to_string())
}

/// Runs one production generation run over the store's current snapshot into the generation root at
/// `root`.
///
/// # Panics
///
/// Panics when any step fails; a measurement target reports its failures by failing, and the
/// [`crate::run::Error`] chain is the diagnosis.
pub async fn run_live(client: &mut Client, root: &str, options: LiveOptions) -> RunSummary {
    crate::run::live(client, root, options)
        .await
        .expect("the run should reach a verdict")
}
