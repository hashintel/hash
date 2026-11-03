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

/// Reports why the disk space of the workspace files could not be checked against
/// [`WorkspaceConfig::disk_limit`](crate::WorkspaceConfig::disk_limit).
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum DiskUsageError {
    #[display("could not read the disk usage of `{}`", path.display())]
    Measure { path: PathBuf },
    #[display("could not checkpoint the database")]
    Checkpoint,
}

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

/// A DuckDB error type that means a query cannot run as written.
///
/// It displays as its variant name in lowercase words, such as `mismatch type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum QueryErrorType {
    Binder,
    Catalog,
    Dependency,
    ExtensionAutoloading,
    MismatchType,
    MissingExtension,
    NotImplemented,
    ParameterNotAllowed,
    ParameterNotResolved,
    Parser,
    Permission,
    Syntax,
}

impl QueryErrorType {
    /// Every query error type, in declaration order.
    const ALL: [Self; mem::variant_count::<Self>()] = array::from_fn(const |index| {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "`repr(u8)` keeps the variant count within `u8`"
        )]
        let discriminant = index as u8;
        // SAFETY: `repr(u8)` gives the variants the discriminants 0 up to the variant count in
        // declaration order, and `index` is below the variant count.
        #[expect(unsafe_code, reason = "builds each variant from its discriminant")]
        unsafe {
            mem::transmute::<u8, Self>(discriminant)
        }
    });
    const NAMES: [VariantName; mem::variant_count::<Self>()] = VariantName::all::<Self, _>();

    const fn name(self) -> VariantName {
        Self::NAMES[self as usize]
    }

    /// Returns the error type that DuckDB calls `name`, or `None` for another name.
    fn from_name(name: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|error_type| error_type.name().matches_words(name))
    }
}

impl fmt::Display for QueryErrorType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.name().words(' '), fmt)
    }
}

/// A DuckDB error type that means a value in the rows caused the error.
///
/// It displays as its variant name in lowercase words, such as `out of range`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum DataErrorType {
    Constraint,
    Conversion,
    Decimal,
    DivideByZero,
    InvalidInput,
    OutOfRange,
}

impl DataErrorType {
    /// Every data error type, in declaration order.
    const ALL: [Self; mem::variant_count::<Self>()] = array::from_fn(const |index| {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "`repr(u8)` keeps the variant count within `u8`"
        )]
        let discriminant = index as u8;
        // SAFETY: `repr(u8)` gives the variants the discriminants 0 up to the variant count in
        // declaration order, and `index` is below the variant count.
        #[expect(unsafe_code, reason = "builds each variant from its discriminant")]
        unsafe {
            mem::transmute::<u8, Self>(discriminant)
        }
    });
    const NAMES: [VariantName; mem::variant_count::<Self>()] = VariantName::all::<Self, _>();

    const fn name(self) -> VariantName {
        Self::NAMES[self as usize]
    }

    /// Returns the error type that DuckDB calls `name`, or `None` for another name.
    fn from_name(name: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|error_type| error_type.name().matches_words(name))
    }
}

impl fmt::Display for DataErrorType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.name().words(' '), fmt)
    }
}

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

impl StatementError {
    /// Returns a report of `error` as [`InvalidQuery`], [`InvalidData`] or [`Failed`], by its
    /// DuckDB error type.
    ///
    /// DuckDB starts an error message with the error type, as in `Binder Error: …`. Other error
    /// types, and errors without a message, are [`Failed`].
    ///
    /// [`InvalidQuery`]: Self::InvalidQuery
    /// [`InvalidData`]: Self::InvalidData
    /// [`Failed`]: Self::Failed
    pub(super) fn from_duckdb(error: duckdb::Error) -> Report<Self> {
        let name = if let duckdb::Error::DuckDBFailure(_, Some(message)) = &error {
            message.split_once(" Error: ").map(|(name, _)| name)
        } else {
            None
        };
        let context = name
            .and_then(|name| {
                QueryErrorType::from_name(name)
                    .map(|error_type| Self::InvalidQuery { error_type })
                    .or_else(|| {
                        DataErrorType::from_name(name)
                            .map(|error_type| Self::InvalidData { error_type })
                    })
            })
            .unwrap_or(Self::Failed);
        Report::new(error).change_context(context)
    }
}

/// Reports why [`Workspace::snapshot`](crate::Workspace::snapshot) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum SnapshotError {
    #[display("`{}` is relative or contains `..`", target.display())]
    InvalidTarget { target: PathBuf },
    #[display("`{}` is one of the workspace's own files", target.display())]
    WorkspaceFile { target: PathBuf },
    #[display("could not checkpoint the database")]
    Checkpoint,
    #[display("could not write the snapshot to `{}`", target.display())]
    Write { target: PathBuf },
    #[display("the workspace thread stopped before the snapshot finished")]
    Stopped,
}

/// Reports why [`Workspace::close`](crate::Workspace::close) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum CloseError {
    #[display("could not checkpoint the database before closing it")]
    Checkpoint,
    #[display("the workspace thread stopped before the database closed")]
    Stopped,
}

#[cfg(test)]
mod tests {
    use duckdb::ffi;
    use error_stack::Report;

    use super::{DataErrorType, QueryErrorType, StatementError};

    fn from_message(message: &str) -> Report<StatementError> {
        StatementError::from_duckdb(duckdb::Error::DuckDBFailure(
            ffi::Error::new(ffi::DuckDBError),
            Some(message.to_owned()),
        ))
    }

    #[test]
    fn from_duckdb_reads_error_type() {
        assert!(
            matches!(
                from_message("Mismatch Type Error: Cannot compare values").current_context(),
                StatementError::InvalidQuery {
                    error_type: QueryErrorType::MismatchType
                }
            ),
            "a query error type should be read from the message"
        );
        assert!(
            matches!(
                from_message("Out of Range Error: Overflow in addition").current_context(),
                StatementError::InvalidData {
                    error_type: DataErrorType::OutOfRange
                }
            ),
            "a data error type should be read from the message"
        );
        for message in ["IO Error: No space left on device", "Error: no error type"] {
            assert!(
                matches!(
                    from_message(message).current_context(),
                    StatementError::Failed
                ),
                "`{message}` should be reported as failed"
            );
        }
    }
}
