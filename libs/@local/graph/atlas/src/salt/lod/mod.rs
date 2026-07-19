//! The level-of-detail structure of one generation: ranks, Morton
//! keys, buckets, and the base delivery order.
//!
//! One generation's points enter as coordinate rows and leave as the
//! columns serving slices from: a deterministic importance ranking
//! ([`rank`]), Morton keys quantized over the generation's frame
//! ([`key`]), a minimum-zoom bucket per point from the first-occupant
//! cascade ([`cascade`]), and the base delivery order that sorts every
//! served column ([`order`]). [`stage`] assembles the whole derivation
//! (frame fit, wire normalization, keys, ranking, cascade, sort,
//! gather) and measures the publish evidence over the result.
//!
//! Everything here is a pure function of its inputs: equal inputs give
//! byte-equal columns, so a generation's spatial index is reproducible
//! from its coordinates, rank inputs, and seed alone.

pub(crate) mod cascade;
pub(crate) mod key;
pub(crate) mod order;
pub(crate) mod rank;
pub(crate) mod stage;

#[cfg(test)]
mod tests;
