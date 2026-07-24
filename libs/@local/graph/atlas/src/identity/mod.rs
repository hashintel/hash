//! Positional identity: typed references into the dense row domains.
//!
//! Every artifact column, bitmap, and wire structure in the crate indexes one of a few dense
//! zero-based row domains - nodes, edges, ontology types - and a bare integer names none of them.
//! This module carries the row-id types that keep those domains distinct in signatures, the
//! [`Identity`] contract they share, and [`Column`], the element-typed view over one array
//! artifact. Content identity - which entity or type a row is - lives with the dataset and the
//! identity tables; a row id here names a position in one generation's streams, valid only
//! against the generation that assigned it.
//!
//! Row ids persist: the in-memory form is the little-endian byte form, so a column of these ids
//! is written to and read from artifact files without conversion.

use core::{fmt::Debug, hash::Hash};

pub(crate) use self::column::{Column, Element};
pub use self::{edge::EdgeRowId, node::NodeRowId, ontology::OntologyRowId};

mod column;
mod edge;
mod node;
mod ontology;

/// The contract of a dense row identity.
///
/// An implementor names positions of one zero-based row domain; the domain itself is the type.
/// Conversions are total within the id encoding: rows are dense, so every position below a
/// domain's length is a valid id and the arithmetic never wraps.
pub const trait Identity: Copy + Eq + Ord + Hash + Debug + 'static {
    /// Creates an id referencing the row at `row`.
    fn new(row: u64) -> Self;

    /// Returns the referenced stream position.
    fn get(self) -> u64;

    /// Creates an id from a zero-based position in a row-aligned column.
    ///
    /// The widening is lossless: no supported target's address space exceeds the id encoding.
    #[inline]
    #[must_use]
    fn from_index(index: usize) -> Self {
        Self::new(index as u64)
    }

    /// Creates an id from a compact 32-bit row reference; the widening is lossless.
    #[inline]
    #[must_use]
    fn from_u32(row: u32) -> Self {
        Self::new(u64::from(row))
    }

    /// Returns the row as an index into a row-aligned column.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "row ids index in-memory columns, which cannot outgrow the address space"
    )]
    #[inline]
    #[must_use]
    fn usize(self) -> usize {
        self.get() as usize
    }
}
