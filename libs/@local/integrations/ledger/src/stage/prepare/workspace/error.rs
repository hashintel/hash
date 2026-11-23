use core::fmt;
use std::path::PathBuf;

/// A DuckDB setting the workspace applies when it opens the database.
///
/// It displays as DuckDB's name for the setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Setting {
    AllowCommunityExtensions,
    AutoinstallKnownExtensions,
    AutoloadKnownExtensions,
    EnableExternalAccess,
    LockConfiguration,
    MemoryLimit,
    MaxTempDirectorySize,
    Threads,
}

impl fmt::Display for Setting {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::AllowCommunityExtensions => "allow_community_extensions",
            Self::AutoinstallKnownExtensions => "autoinstall_known_extensions",
            Self::AutoloadKnownExtensions => "autoload_known_extensions",
            Self::EnableExternalAccess => "enable_external_access",
            Self::LockConfiguration => "lock_configuration",
            Self::MemoryLimit => "memory_limit",
            Self::MaxTempDirectorySize => "max_temp_directory_size",
            Self::Threads => "threads",
        })
    }
}

/// Reports why [`Workspace::open`](super::Workspace::open) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum OpenError {
    #[display("could not set `{setting}` to `{value}`")]
    Configure { setting: Setting, value: Box<str> },
    #[display("could not open the database at `{}`", path.display())]
    Open { path: PathBuf },
}

/// Reports why a statement of the [`Workspace`](super::Workspace) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum StatementError {
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
    /// DuckDB could not run the statement, or a value could not be read. The report holds the
    /// error, with DuckDB's message.
    #[display("the statement failed")]
    Failed,
}
