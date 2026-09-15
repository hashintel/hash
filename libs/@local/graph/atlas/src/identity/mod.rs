//! Positional identity: typed references into the dense row and order domains.
//!
//! Every artifact column, bitmap, and wire structure in the crate indexes one of a few dense
//! zero-based domains - node rows, edge rows, ontology-type rows, annotation card rows, base
//! positions, and key ordinals - and a bare integer names none of them. This module carries the id
//! types that keep those domains distinct in signatures and [`Column`], the element-typed view over
//! one array artifact. The ids share the [`hashql_core::id::Id`] contract. Every id is a dense
//! zero-based index. Conversions out of an id are casts, and a target integer narrower than the
//! domain keeps the low bits, which [`NodeRowId`]'s own conversion states. The stepping helpers
//! compute in `usize` and rebuild the id from the result. A value outside the domain panics, and
//! a `usize` overflow panics only where overflow checks are on. Content identity - which entity or
//! type a row is - lives with the dataset and the
//! identity tables. An id here names an index in one generation's streams, valid only against the
//! generation that assigned it.
//!
//! Rows and orders are different domains over the same points. A row names a stream entry, while a
//! base position and a key ordinal name slots in two permutations of it. The generation's own
//! columns convert between them.
//!
//! Row ids persist: the in-memory form is the little-endian byte form. A column of these ids writes
//! to and reads back from artifact files without conversion.

pub(crate) use self::{
    card::CardRow, column::Column, edge::EdgeRowId, node::NodeRowId, ontology::OntologyRowId,
    position::BasePosition, rank::ImportanceRank,
};

/// The key-ordinal domain, re-exported under the `bench` feature.
///
/// Benchmark code outside this module then indexes by the id type rather than a bare integer.
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
