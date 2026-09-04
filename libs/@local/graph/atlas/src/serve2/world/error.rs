use core::{error::Error, fmt};

use crate::file::repository::FileName;

/// A failure while opening a [`World`].
///
/// [`World`]: super::World
#[derive(Debug)]
pub enum WorldError {
    /// An artifact failed to open.
    Open {
        /// The artifact's repository file name.
        file: FileName,
    },
    /// The recorded bucket schedule failed validation.
    BucketSchedule,
    /// The ontology identities and the postings disagree on the type count.
    OntologyCountMismatch {
        /// The rows the ontology identity table covers.
        identities: u64,
        /// The types the postings cover.
        postings: u64,
    },
    /// The type closure failed to derive.
    OntologyClosure,
}

impl fmt::Display for WorldError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open { file } => write!(fmt, "the {file} artifact failed to open"),
            Self::BucketSchedule => fmt.write_str("the recorded bucket schedule failed validation"),
            Self::OntologyCountMismatch {
                identities,
                postings,
            } => write!(
                fmt,
                "the ontology identity table covers {identities} types where the postings cover \
                 {postings}",
            ),
            Self::OntologyClosure => fmt.write_str("the type closure failed to derive"),
        }
    }
}

impl Error for WorldError {}
