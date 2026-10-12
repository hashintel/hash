use alloc::{boxed::Box, collections::BTreeSet, string::String};

use crate::name::{CheckpointName, ColumnName};

/// Reports that an SQL query contains only whitespace.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("SQL query is empty")]
pub struct EmptySqlQuery;

/// The text of an SQL query that is not empty.
///
/// The text is checked only for emptiness here. The engine parses it when the pipeline runs.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::AsRef)]
#[as_ref(forward)]
pub struct SqlQuery(String);

impl TryFrom<String> for SqlQuery {
    type Error = EmptySqlQuery;

    fn try_from(query: String) -> Result<Self, Self::Error> {
        if query.trim().is_empty() {
            return Err(EmptySqlQuery);
        }
        Ok(Self(query))
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

/// Where a source reads its rows from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceKind {
    /// Rows from an SQL query.
    Sql {
        query: SqlQuery,
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
    /// Returns the checkpoint this source reads, if it reads one.
    #[must_use]
    pub const fn checkpoint(&self) -> Option<&CheckpointName> {
        match &self.kind {
            SourceKind::Checkpoint { checkpoint } => Some(checkpoint),
            SourceKind::Sql { .. } => None,
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
