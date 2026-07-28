//! The operator commands: fit a generation, serve the atlas.
//!
//! Two entry points consume this module. The `hash-graph atlas` subcommand: [`FitArgs`] and
//! [`FitCommand`] run one production generation over the live store, and [`ServeArgs`] and
//! [`ServeCommand`] open the root's active generation and build the read-API router
//! ([`crate::api`]) the graph binary hosts. And the standalone `hash-graph-atlas` binary, whose
//! shell the `cli` feature gates: its command line carries the fit command over its own store
//! flags ([`PostgresArgs`]) plus the lab instruments - the fold probe ([`ProbeArgs`]) and the
//! report bundles ([`ReportCommand`], one subcommand per report) - over a generation root's
//! staged artifacts;
//! serving stays exclusive to the graph binary. The store flags mirror the graph's
//! `HASH_GRAPH_PG_*` environment, so one deployment configuration drives every entry point.
//!
//! The hosts dial: a command runs over the store connection its host supplies -
//! [`PostgresArgs::connect`] dials the shell's own flags, [`connect`] dials a rendered
//! connection string.
//!
//! The run seam the fit command drives lives with the runner; this module re-exports its
//! vocabulary ([`Options`], [`Placement`], [`ClassifierSource`], [`Summary`], [`RunError`]) as
//! the crate's operator surface.
//!
//! The commands carry no listener, lifecycle, or connection of their own beyond what their
//! arguments name.

use std::io;

use crate::serve::GenerationRoot;

mod fit;
mod postgres;
mod probe;
mod report;
mod serve;
mod shell;

#[cfg(feature = "cli")]
pub use self::shell::main;
pub use self::{
    fit::{FitArgs, FitCommand, FitError},
    postgres::{ConnectError, PostgresArgs, connect},
    probe::ProbeArgs,
    report::{ClassifierArgs, ReportCommand, ReportError},
    serve::{ServeArgs, ServeCommand, ServeError},
};
pub use crate::salt::runner::live::{ClassifierSource, Options, Placement, RunError, Summary};

/// Parses a generation-root argument: opens the root, creating the directory when absent.
fn parse_root(value: &str) -> io::Result<GenerationRoot> {
    GenerationRoot::new(value)
}
