mod remote;

use alloc::{boxed::Box, collections::BTreeSet, string::String};
use core::{array, mem};

pub use self::remote::{Pagination, PostgresSource, RestAuth, RestSource, SecretReference};
use crate::name::{CheckpointName, ColumnName};

/// Reports that an SQL query contains only whitespace.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("SQL query is empty")]
pub struct EmptySqlQuery;

/// The text of an SQL query that is not empty.
///
/// The text is checked only for emptiness here. The engine parses it when the pipeline runs. SQL
/// reads the definition's variables as `$NAME` parameters.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::AsRef)]
#[as_ref(forward)]
pub struct SqlQuery(Box<str>);

impl TryFrom<String> for SqlQuery {
    type Error = EmptySqlQuery;

    fn try_from(query: String) -> Result<Self, Self::Error> {
        if query.trim().is_empty() {
            return Err(EmptySqlQuery);
        }
        Ok(Self(query.into_boxed_str()))
    }
}

/// Reports why a list of columns is not a valid primary key.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidPrimaryKey {
    #[display("primary key has no columns")]
    Empty,
    #[display("primary key lists `{column}` more than once")]
    DuplicateColumn { column: ColumnName },
}

/// The columns that identify a row of a source, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrimaryKey(Box<[ColumnName]>);

impl PrimaryKey {
    /// Builds a primary key from one or more distinct `columns`.
    ///
    /// # Errors
    ///
    /// - [`Empty`] if there are no columns
    /// - [`DuplicateColumn`] if a column appears more than once
    ///
    /// [`Empty`]: InvalidPrimaryKey::Empty
    /// [`DuplicateColumn`]: InvalidPrimaryKey::DuplicateColumn
    pub fn new(columns: impl IntoIterator<Item = ColumnName>) -> Result<Self, InvalidPrimaryKey> {
        let columns: Box<[ColumnName]> = columns.into_iter().collect();
        if columns.is_empty() {
            return Err(InvalidPrimaryKey::Empty);
        }

        let mut seen = BTreeSet::new();
        if let Some(column) = columns.iter().find(|&column| !seen.insert(column)) {
            return Err(InvalidPrimaryKey::DuplicateColumn {
                column: column.clone(),
            });
        }

        Ok(Self(columns))
    }

    #[must_use]
    pub const fn columns(&self) -> &[ColumnName] {
        &self.0
    }
}

/// States whether a source returns every entity it manages.
///
/// A run archives the entities that a complete source returned in an earlier run but not in this
/// one. Entities that a partial source omits are kept.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
pub enum Coverage {
    /// The source returns only some of its entities.
    Partial,
    /// The source returns all of its entities.
    ///
    /// When it returns no rows at all while entities exist from earlier runs, the run treats it
    /// as partial, because an empty result is more likely a fault than a deletion.
    Complete,
    /// The source returns all of its entities, and no rows means that every entity was removed.
    CompleteOrEmpty,
}

impl Coverage {
    /// Every coverage, in declaration order.
    pub const ALL: [Self; mem::variant_count::<Self>()] = array::from_fn(const |index| {
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
}

/// Where a source reads its rows from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceKind {
    /// Rows from an SQL query.
    Sql {
        query: SqlQuery,
        primary_key: PrimaryKey,
    },
    /// Rows from a Parquet file under the configured local storage root.
    Local {
        key: Box<str>,
        primary_key: PrimaryKey,
    },
    /// Rows from a PostgreSQL or Redshift table.
    Postgres {
        source: PostgresSource,
        primary_key: PrimaryKey,
    },
    /// Rows from a paginated REST endpoint.
    Rest {
        endpoint: RestSource,
        primary_key: PrimaryKey,
    },
    /// Rows of a checkpoint that another pipeline in the same definition produces.
    Checkpoint { checkpoint: CheckpointName },
}

/// A source of rows for an entity pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Source {
    pub kind: SourceKind,
    pub coverage: Coverage,
}

impl Source {
    #[must_use]
    pub const fn primary_key(&self) -> Option<&PrimaryKey> {
        match &self.kind {
            SourceKind::Sql { primary_key, .. }
            | SourceKind::Local { primary_key, .. }
            | SourceKind::Postgres { primary_key, .. }
            | SourceKind::Rest { primary_key, .. } => Some(primary_key),
            SourceKind::Checkpoint { .. } => None,
        }
    }

    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        match &self.kind {
            SourceKind::Postgres { source, .. } => source.validate(),
            SourceKind::Rest { endpoint, .. } => endpoint.validate(),
            SourceKind::Local { key, .. } if key.is_empty() => {
                Err("local source key must be nonempty")
            }
            SourceKind::Sql { .. } | SourceKind::Local { .. } | SourceKind::Checkpoint { .. } => {
                Ok(())
            }
        }
    }

    /// Returns the checkpoint this source reads, if it reads one.
    #[must_use]
    pub const fn checkpoint(&self) -> Option<&CheckpointName> {
        match &self.kind {
            SourceKind::Checkpoint { checkpoint } => Some(checkpoint),
            SourceKind::Sql { .. }
            | SourceKind::Local { .. }
            | SourceKind::Postgres { .. }
            | SourceKind::Rest { .. } => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::{borrow::ToOwned as _, vec};
    use core::str::FromStr as _;

    use super::{EmptySqlQuery, InvalidPrimaryKey, PrimaryKey, SqlQuery};
    use crate::name::ColumnName;

    fn column(name: &str) -> ColumnName {
        ColumnName::from_str(name).expect("should be a valid column name")
    }

    #[test]
    fn primary_key_duplicate() {
        assert_eq!(
            PrimaryKey::new(vec![column("TAIL"), column("MODEL"), column("TAIL")]),
            Err(InvalidPrimaryKey::DuplicateColumn {
                column: column("TAIL")
            }),
            "a repeated column should be reported by name"
        );
    }

    #[test]
    fn sql_query_whitespace() {
        assert_eq!(
            SqlQuery::try_from(" \n\t".to_owned()),
            Err(EmptySqlQuery),
            "a query of only whitespace should be empty"
        );
    }
}
