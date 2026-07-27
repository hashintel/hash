//! Positional identity: typed references into the dense row domains.
//!
//! Every artifact column, bitmap, and wire structure in the crate indexes one of a few dense
//! zero-based row domains - nodes, edges, ontology types - and a bare integer names none of them.
//! This module carries the row-id types that keep those domains distinct in signatures and
//! [`Column`], the element-typed view over one array artifact. The ids share the
//! [`hashql_core::id::Id`] contract; every id is a dense zero-based position, so conversions are
//! total within the id encoding and the arithmetic never wraps. Content identity - which entity
//! or type a row is - lives with the dataset and the identity tables; a row id here names a
//! position in one generation's streams, valid only against the generation that assigned it.
//!
//! Row ids persist: the in-memory form is the little-endian byte form, so a column of these ids
//! is written to and read from artifact files without conversion.

pub(crate) use self::column::{Column, Element};
pub use self::{edge::EdgeRowId, node::NodeRowId, ontology::OntologyRowId};

mod column;
mod edge;
mod node;
mod ontology;
