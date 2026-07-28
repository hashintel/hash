//! The operator commands: fit a generation, serve the atlas.
//!
//! Two entry points consume this module. The `hash-graph atlas` subcommand: [`FitArgs`] and
//! [`FitCommand`] run one production generation over the live store, and [`ServeArgs`] and
//! [`ServeCommand`] open the root's active generation and build the read-API router
//! ([`crate::api`]) the graph binary hosts. And the standalone `hash-graph-atlas` binary, whose
//! shell the `cli` feature gates: its command line carries the fit command over its own store
//! flags ([`PostgresArgs`]) plus the report instruments ([`ReportCommand`], one subcommand per
//! report - the certified classifier bundle, the fold probe) over a generation root's staged
//! artifacts;
//! serving stays exclusive to the graph binary. The store flags mirror the graph's
//! `HASH_GRAPH_PG_*` environment, so one deployment configuration drives every entry point.
//!
//! A command produces its verdict rather than printing one ([`FitVerdict`]), and its host renders
//! it: the standalone shell's `--tui` dashboard owns the terminal until the run ends, so the
//! verdict is written after the dashboard gives it back.
//!
//! The hosts dial: a command runs over the store connection its host supplies -
//! [`PostgresArgs::connect`] dials the shell's own flags field by field, [`connect`] dials a
//! rendered connection string.
//!
//! The run seam the fit command drives lives with the runner; this module re-exports its
//! vocabulary ([`Options`], [`Placement`], [`ClassifierSource`], [`Summary`], [`RunError`]) as
//! the crate's operator surface.
//!
//! The commands carry no listener, lifecycle, or connection of their own beyond what their
//! arguments name.

use std::io;

use clap::ValueHint;

use crate::serve::GenerationRoot;

mod fit;
mod postgres;
mod report;
mod serve;
mod shell;
#[cfg(feature = "cli")]
mod tui;

#[cfg(feature = "cli")]
pub use self::shell::main;
pub use self::{
    fit::{FitArgs, FitCommand, FitError, FitVerdict},
    postgres::{ConnectError, PostgresArgs, connect},
    report::{ClassifierArgs, ProbeArgs, ReportCommand, ReportError},
    serve::{ServeArgs, ServeCommand, ServeError},
};
pub use crate::salt::runner::live::{ClassifierSource, Options, Placement, RunError, Summary};

/// The generation-root flag, shared by every command that opens one.
///
/// Hosts flatten it exactly once per invocation: the graph binary at the `atlas` level, the
/// standalone shell inside each subcommand.
#[derive(Debug, clap::Args)]
pub struct RootArgs {
    /// The generation root directory.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_ROOT",
        value_parser = parse_root,
        value_hint = ValueHint::DirPath,
    )]
    root: GenerationRoot,
}

/// Parses a generation-root argument: opens the root, creating the directory when absent.
fn parse_root(value: &str) -> io::Result<GenerationRoot> {
    GenerationRoot::new(value)
}
