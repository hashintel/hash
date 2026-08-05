//! Membership sets over the crate's row domains.
//!
//! [`CompressedBitSet`] marks membership over one dense zero-based domain at a cost proportional to
//! what it admits, and carries that domain in its type. [`DenseBitSlice`] marks membership at one
//! bit per domain row inside a self-describing byte frame, so a set persists or travels as the same
//! bytes it computes over. [`DenseBitSliceArray`] lays same-domain frames back to back in one
//! allocation - the dense region of a file, indexable as its frames. Dense sets and matrices that
//! stay in memory come from [`hashql_core::id::bit_vec`]: [`DenseBitSet`] where one bit per domain
//! element is the right price, [`BitMatrix`] where one value marks a whole relation at once.
//!
//! The module is crate-internal. Its examples carry `ignore` and spell each call as an in-crate
//! caller writes it, and the module's tests assert every property the examples show.
//!
//! [`DenseBitSet`]: hashql_core::id::bit_vec::DenseBitSet
//! [`BitMatrix`]: hashql_core::id::bit_vec::BitMatrix

pub(crate) use self::{
    compress::CompressedBitSet,
    dense::{
        DenseBitSlice, DenseBitSliceArray, ParseDenseBitSliceArrayError, ParseDenseBitSliceError,
        RowsIn,
    },
};

mod compress;
mod dense;
#[cfg(test)]
mod tests;
