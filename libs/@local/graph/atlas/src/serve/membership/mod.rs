//! Type membership over the rows a request delivers.
//!
//! A request names the entity types it wants marked, and the response reports, for each delivered
//! row, which of those types it belongs to. Answering that needs one membership set per requested
//! type, held for the length of the response assembly. [`OntologySelection`] is the request's list
//! and [`SelectionSlot`] is a position within it.

mod ontology;

pub(crate) use self::ontology::{OntologySelection, SelectionSlot};
