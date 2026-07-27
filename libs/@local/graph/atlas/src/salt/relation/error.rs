//! Relation-index construction errors.

use core::{error::Error, fmt};

use hashql_core::id::Id as _;

use crate::identity::OntologyRowId;

/// A policy table or instance set violated a relation-index contract.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RelationIndexError {
    /// The policies are not strictly ascending by relation row.
    PolicyOrder {
        position: usize,
        relation: OntologyRowId,
    },
    /// A policy stores a probability, applicability, or strength outside its domain.
    PolicyDomain { relation: OntologyRowId },
    /// An instance references a relation the policy table does not cover.
    MissingPolicy { relation: OntologyRowId },
    /// The row domain exceeds the protection matrix's `u32` column encoding.
    TooManyRows { rows: usize },
}

impl fmt::Display for RelationIndexError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::PolicyOrder { position, relation } => write!(
                fmt,
                "policy position {position} stores relation row {relation}, breaking the strictly \
                 ascending order",
                relation = relation.as_u64(),
            ),
            Self::PolicyDomain { relation } => write!(
                fmt,
                "the policy of relation row {relation} stores a value outside its domain",
                relation = relation.as_u64(),
            ),
            Self::MissingPolicy { relation } => write!(
                fmt,
                "instances reference relation row {relation}, which has no policy",
                relation = relation.as_u64(),
            ),
            Self::TooManyRows { rows } => {
                write!(fmt, "{rows} rows exceed the index's u32 column encoding")
            }
        }
    }
}

impl Error for RelationIndexError {}
