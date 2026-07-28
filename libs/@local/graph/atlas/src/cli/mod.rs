//! The operator commands: fit a generation, serve the atlas.
//!
//! Two entry points consume this module. The `hash-graph atlas` subcommand: [`FitArgs`] and
//! [`fit()`] run one production generation over the live store, and [`ServeArgs`] and
//! [`open_router`] open the root's active generation and build the read-API router
//! ([`crate::api`]) the graph binary hosts. And the standalone `hash-graph-atlas` binary, whose
//! shell the `cli` feature gates: its command line carries the fit command over its own store
//! flags ([`StoreArgs`]); serving stays exclusive to the graph binary. The store flags mirror the
//! graph's `HASH_GRAPH_PG_*` environment, so one deployment configuration drives every entry
//! point.
//!
//! The run seam the fit command drives lives with the runner; this module re-exports its
//! vocabulary ([`Options`], [`Placement`], [`ClassifierSource`], [`Summary`], [`RunError`]) as
//! the crate's operator surface.
//!
//! The commands carry no listener or lifecycle of their own beyond what their arguments name.

use camino::Utf8PathBuf;

mod fit;
mod serve;
mod shell;
mod store;

#[cfg(feature = "cli")]
pub use self::shell::main;
pub use self::{
    fit::{FitArgs, FitError, fit},
    serve::{ServeArgs, ServeError, open_router},
    store::{ConnectError, StoreArgs, connect},
};
pub use crate::salt::runner::live::{ClassifierSource, Options, Placement, RunError, Summary};

/// Returns the default generation root under the temp directory.
fn default_root() -> Utf8PathBuf {
    // NOTE: no default root in /tmp, this shouldn't have a default
    let root = std::env::temp_dir().join("atlas-generations");
    Utf8PathBuf::from_path_buf(root).expect("the temp directory is UTF-8")
}
