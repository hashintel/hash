// From `engine/src/workspace/error.rs:1-35`
use core::{array, fmt, mem};
use std::path::PathBuf;

use error_stack::Report;

use crate::{ByteSize, variant_name::VariantName};

/// A DuckDB setting the workspace applies when it opens the database.
///
/// It displays as DuckDB's name for the setting, its variant name in snake case.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Setting {
    AllowCommunityExtensions,
    AutoinstallKnownExtensions,
    AutoloadKnownExtensions,
    EnableExternalAccess,
    LockConfiguration,
    MemoryLimit,
    MaxTempDirectorySize,
    Threads,
}

impl Setting {
    const NAMES: [VariantName; mem::variant_count::<Self>()] = VariantName::all::<Self, _>();

    const fn name(self) -> VariantName {
        Self::NAMES[self as usize]
    }
}

impl fmt::Display for Setting {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.name().words('_'), fmt)
    }
}

// From `engine/src/workspace/error.rs:47-66`
/// Reports why [`Workspace::open`](crate::Workspace::open) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum OpenError {
    #[display("could not lock `{}`", path.display())]
    Lock { path: PathBuf },
    #[display("another workspace holds the lock `{}`", path.display())]
    Locked { path: PathBuf },
    #[display("could not set `{setting}` to `{value}`")]
    Configure { setting: Setting, value: Box<str> },
    #[display("could not open the database at `{}`", path.display())]
    Open { path: PathBuf },
    #[display("the workspace files use {used}, over the disk limit of {limit}")]
    DiskLimit { used: ByteSize, limit: ByteSize },
    #[display("could not check the workspace files against the disk limit")]
    DiskUsage,
    #[display("could not start the workspace thread")]
    Spawn,
    #[display("the workspace thread stopped before the database opened")]
    Stopped,
}

// From `engine/src/workspace/error.rs:172-210`
/// Reports why [`Workspace::query`](crate::Workspace::query) or
/// [`Workspace::create_table`](crate::Workspace::create_table) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum StatementError {
    #[display("the SQL is not a `SELECT` query: {reason}")]
    NotSelect { reason: Box<str> },
    #[display("the SQL holds {count} statements instead of one")]
    StatementCount { count: usize },
    #[display("the query calls table function `{name}`, which is not allowed")]
    TableFunction { name: Box<str> },
    #[display("the query reads parameter `${name}`, which is not set")]
    UnknownParameter { name: Box<str> },
    /// `data_type` is the column's type as the `duckdb` crate receives it, in Arrow's notation.
    #[display("column `{column}` has type `{data_type}`, which the workspace cannot read")]
    UnsupportedType {
        column: Box<str>,
        data_type: Box<str>,
    },
    /// The query cannot run as written, for example because it reads a missing table.
    #[display("DuckDB cannot run the query: {error_type} error")]
    InvalidQuery { error_type: QueryErrorType },
    /// A value in the rows caused an error, such as text that a cast cannot convert.
    ///
    /// The DuckDB error this carries can quote the value.
    #[display("a value in the rows caused a DuckDB {error_type} error")]
    InvalidData { error_type: DataErrorType },
    /// DuckDB failed for another reason, such as an IO error or running out of memory, or a value
    /// could not be read.
    #[display("the statement failed")]
    Failed,
    #[display(
        "after the statement, the workspace files use {used}, over the disk limit of {limit}"
    )]
    DiskLimit { used: ByteSize, limit: ByteSize },
    #[display("could not check the workspace files against the disk limit after the statement")]
    DiskUsage,
    #[display("the workspace thread stopped before the statement finished")]
    Stopped,
}
