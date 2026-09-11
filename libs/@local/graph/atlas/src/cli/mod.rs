//! The operator commands that fit a generation and serve the atlas.
//!
//! The `hash-graph atlas` subcommand is one entry point. [`FitArgs`] and [`FitCommand`] run one
//! production generation over the live store. [`ServeArgs`] and [`ServeCommand`] construct the
//! read-API router ([`crate::api`]) and generation maintenance that the graph binary retains.
//!
//! The standalone `hash-graph-atlas` binary is the other entry point. The `cli` feature enables its
//! shell. Its command line carries the fit command over its own store flags ([`PostgresArgs`]) and
//! reports over a generation root's published artifacts. [`DumpArgs`] and [`DumpCommand`] write the
//! store's snapshot into an offline-dataset directory. An offline fit can run without reaching the
//! store or the embedding provider. The shell's `--offline` flag reads that directory, refusing an
//! invocation that also supplies a store flag or provider key. [`ReportCommand`] holds one
//! subcommand per report (the certified classifier bundle, the fold probe, the clump-threshold
//! calibration, the neighbour-construction audits, and one live quality assessment). Serving stays
//! exclusive to the graph binary.
//!
//! The store flags mirror the graph's `HASH_GRAPH_PG_*` environment. One deployment configuration
//! drives every entry point. [`S3Args`] attaches the optional S3 backend over the SDK's own `AWS_*`
//! environment plus `HASH_GRAPH_ATLAS_S3_*` overrides. The report commands belong to the standalone
//! binary alone.
//!
//! The fit command returns [`FitVerdict`] for its host to render. The standalone shell's `--tui`
//! dashboard owns the terminal until the run ends. The shell prints the verdict after the dashboard
//! releases the terminal.
//!
//! The hosts dial: a command runs over the store connection its host supplies -
//! [`PostgresArgs::connect`] dials the shell's own flags field by field, [`connect`] dials a
//! rendered connection string.
//!
//! The run entry points the fit command drives live with the runner; this module re-exports their
//! vocabulary ([`Options`], [`Placement`], [`ClassifierSource`], [`RunError`]) as the
//! crate's operator API.
//!
//! The commands carry no listener, lifecycle, or connection of their own beyond what their
//! arguments name.

use std::io;

use clap::ValueHint;

use crate::{device::PinnedDevice, file::generation::GenerationRoot};

mod dump;
mod embedder;
mod fit;
mod postgres;
mod report;
mod s3;
mod serve;
mod shell;
#[cfg(feature = "cli")]
mod tui;

pub(crate) use self::report::ReportCommand;
#[cfg(feature = "cli")]
pub use self::shell::main;
pub use self::{
    dump::{DumpArgs, DumpCommand, DumpError, DumpVerdict},
    embedder::{EmbedderArgs, EmbedderError},
    fit::{FitArgs, FitCommand, FitVerdict, error::FitError},
    postgres::{ConnectError, PostgresArgs, connect},
    s3::{S3Args, S3ArgsError},
    serve::{Serve, ServeArgs, ServeCommand, ServeError, ServeOptions},
};
pub use crate::{
    file::storage::Storage,
    integrity::{EmptyPasswordError, PasswordString, SecretString},
    salt::runner::operator::{ClassifierSource, Options, Placement, RunError},
    serve::{delta::placement::EmbeddingWorkflow, visibility::cache::VisibilityLimits},
};

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
