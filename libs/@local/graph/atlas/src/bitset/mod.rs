//! Compressed membership sets over the crate's row domains.
//!
//! [`CompressedBitSet`] marks membership over one dense zero-based domain at a cost proportional to
//! what it admits, and carries that domain in its type. Dense sets and matrices over the same
//! domains come from [`hashql_core::id::bit_vec`]: [`DenseBitSet`] where one bit per domain element
//! is the right price, [`BitMatrix`] where one value marks a whole relation at once.
//!
//! The module is crate-internal. Its examples carry `ignore` and spell each call as an in-crate
//! caller writes it, and the module's tests assert every property the examples show.
//!
//! [`DenseBitSet`]: hashql_core::id::bit_vec::DenseBitSet
//! [`BitMatrix`]: hashql_core::id::bit_vec::BitMatrix

pub(crate) use self::compress::CompressedBitSet;

mod compress;
#[cfg(test)]
mod tests;
