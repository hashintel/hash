//! The operator commands that fit a generation and serve the atlas.
//!
//! The `hash-graph atlas` subcommand is one entry point. [`FitArgs`] and [`FitCommand`] run one
//! production generation over the live store. [`ServeArgs`] and [`ServeCommand`] open the root's
//! active generation and build the read-API router ([`crate::api`]) the graph binary hosts.
//!
//! The standalone `hash-graph-atlas` binary is the other entry point, and the `cli` feature gates
//! its shell. Its command line carries the fit command over its own store flags ([`PostgresArgs`])
//! plus the report instruments over a generation root's published artifacts. [`DumpArgs`] and
//! [`DumpCommand`] write the store's snapshot into an offline-dataset directory, so a fit can run
//! on a machine that reaches neither the store nor the embedding provider; the shell's fit
//! command reads such a directory back through its `--offline` flag, refusing an invocation that
//! also types a store flag or the provider key. [`ReportCommand`] holds one subcommand per report
//! (the certified classifier bundle, the fold probe, the clump-threshold calibration, the
//! neighbour-construction audits, and one live quality assessment). Serving stays exclusive to
//! the graph binary.
//!
//! The store flags mirror the graph's `HASH_GRAPH_PG_*` environment, so one deployment
//! configuration drives every entry point. The instruments belong to the standalone binary alone.
//! Nothing outside this crate names them.
//!
//! A command produces its verdict rather than printing one ([`FitVerdict`]). Its host renders it:
//! the standalone shell's `--tui` dashboard owns the terminal until the run ends, so the shell
//! writes the verdict after the dashboard gives it back.
//!
//! The hosts dial: a command runs over the store connection its host supplies -
//! [`PostgresArgs::connect`] dials the shell's own flags field by field, [`connect`] dials a
//! rendered connection string.
//!
//! The run entry points the fit command drives live with the runner; this module re-exports their
//! vocabulary ([`Options`], [`Placement`], [`ClassifierSource`], [`Summary`], [`RunError`]) as the
//! crate's operator API.
//!
//! The commands carry no listener, lifecycle, or connection of their own beyond what their
//! arguments name.

use std::io;

use clap::ValueHint;

pub(crate) use self::report::ReportCommand;
#[cfg(feature = "cli")]
pub use self::shell::main;
pub use self::{
    dump::{DumpArgs, DumpCommand, DumpError, DumpVerdict},
    embedder::{EmbedderArgs, EmbedderError},
    fit::{FitArgs, FitCommand, FitError, FitVerdict},
    postgres::{ConnectError, PostgresArgs, connect},
    serve::{ServeArgs, ServeCommand, ServeError, ServeOptions},
};
use crate::{device::PinnedDevice, file::generation::GenerationRoot};
pub use crate::{
    integrity::{EmptyPasswordError, PasswordString, SecretString},
    salt::runner::operator::{ClassifierSource, Options, Placement, RunError, Summary},
    serve::{EmbeddingWorkflow, LocateLimits, TileLimits, TranslateLimits, VisibilityLimits},
};

mod dump;
mod embedder;
mod fit;
mod postgres;
mod report;
mod serve;
mod shell;
#[cfg(feature = "cli")]
mod tui;

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

    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DEVICE",
        default_value_t = PinnedDevice::host()
    )]
    device: PinnedDevice,
}

/// Parses a generation-root argument: opens the root, creating the directory when absent.
fn parse_root(value: &str) -> io::Result<GenerationRoot> {
    GenerationRoot::new(value)
}
