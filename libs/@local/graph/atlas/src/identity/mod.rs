//! Positional identity: typed references into the dense row and order domains.
//!
//! Every artifact column, bitmap, and wire structure in the crate indexes one of a few dense
//! zero-based domains - node rows, edge rows, ontology-type rows, annotation card rows, base
//! positions, and key ordinals - and a bare integer names none of them. This module carries the id
//! types that keep those domains distinct in signatures and [`Column`], the element-typed view over
//! one array artifact. The ids share the [`hashql_core::id::Id`] contract; every id is a dense
//! zero-based index, so conversions are total within the id encoding and the arithmetic never
//! wraps. Content identity - which entity or type a row is - lives with the dataset and the
//! identity tables; an id here names an index in one generation's streams, valid only against the
//! generation that assigned it.
//!
//! Rows and orders are different domains over the same points. A row names a stream entry, while a
//! base position and a key ordinal name slots in two permutations of it. The generation's own
//! columns convert between them.
//!
//! Row ids persist: the in-memory form is the little-endian byte form, so a column of these ids
//! writes to and reads back from artifact files without conversion.

pub(crate) use self::{
    card::CardRow,
    column::{Column, Element},
    edge::EdgeRowId,
    node::NodeRowId,
    ontology::OntologyRowId,
    position::BasePosition,
    rank::ImportanceRank,
};

/// Bench-only exports: the key-ordinal domain crosses typed into lod's bench module.
#[cfg(feature = "bench")]
pub(crate) mod bench {
    pub(crate) use super::key::KeyOrdinal;
}
mod card;
mod column;
mod edge;
mod key;
mod node;
mod ontology;
mod position;
mod rank;
