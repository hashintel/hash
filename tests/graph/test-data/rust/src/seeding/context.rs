//! Deterministic seeding context and keyed RNG utilities.
//!
//! This module provides deterministic, shard-aware random number generation for seeding large
//! datasets in a reproducible way. Streams are derived from a global `master_seed` and three
//! dimensions:
//!
//! - [`ShardId`]: coarse partitioning across parallel workers
//! - [`LocalId`]: per-producer monotonically increasing counter
//! - [`Scope`]: 4-byte domain key, e.g., `b"TITL"`, `b"DESC"`
//!
//! Combining these values yields a stable per-sample RNG via [`ProduceContext::rng`]. Use
//! [`ProduceContext::global_id`] to construct a [`GlobalId`] from the current shard and a
//! [`LocalId`].
//!
//! Local IDs
//! - Create a new local counter with [`LocalId::default`].
//! - Advance it per produced item with [`LocalId::take_and_advance`], which returns the previous
//!   value and increments the counter.
//!
//! ```rust
//! use hash_graph_test_data::seeding::context::LocalId;
//! let mut local = LocalId::default();
//! let id0 = local.take_and_advance();
//! let id1 = local.take_and_advance();
//! assert_ne!(id0, id1);
//! ```
//!
//! # Notes
//!
//! - The RNG used here is not cryptographically secure. It is designed for speed and determinism in
//!   test/data-generation scenarios.
//! - Formatting a [`GlobalId`] with hex (`{:x}`/`{:X}`) prints `shard_id-local_id` as two
//!   eight-digit hex numbers separated by a dash.
//!
//! # Examples
//!
//! ```rust
//! use hash_graph_test_data::seeding::context::{LocalId, ProduceContext, Scope, ShardId};
//! use rand::Rng as _;
//!
//! let context = ProduceContext {
//!     master_seed: 0xDEAD_BEEF,
//!     shard_id: ShardId::new(0),
//! };
//! let id = context.global_id(LocalId::default());
//! let mut rng = context.rng(id, Scope::new(b"TITL"));
//! let value: u32 = rng.random();
//! # let _ = value;
//! ```

use core::fmt;

use rand::{Rng, RngCore, rand_core::impls::fill_bytes_via_next};
use xxhash_rust::xxh3::xxh3_64;

/// Identifies a shard (coarse partition) used to derive independent RNG streams.
///
/// Each shard produces a disjoint random stream for the same [`LocalId`] and [`Scope`], enabling
/// parallel, reproducible generation across workers.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ShardId(u32);

impl ShardId {
    /// Create a new shard identifier.
    #[must_use]
    pub const fn new(shard_id: u32) -> Self {
        Self(shard_id)
    }
}

impl From<ShardId> for u32 {
    fn from(shard_id: ShardId) -> Self {
        shard_id.0
    }
}

/// Monotonic per-producer counter used to construct unique [`GlobalId`] values.
///
/// Construction and update:
/// - Start from [`LocalId::default()`], which is zero.
/// - Call [`LocalId::take_and_advance`] for each produced item; it returns the current value and
///   increments the counter.
///
/// # Examples
///
/// ```rust
/// use hash_graph_test_data::seeding::context::LocalId;
/// let mut local = LocalId::default();
/// let first = local.take_and_advance(); // 0
/// let second = local.take_and_advance(); // 1
/// assert_ne!(first, second);
/// ```
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct LocalId(u32);

impl LocalId {
    /// Increment the local ID and return the original value.
    ///
    /// # Panics
    ///
    /// Panics if the local ID overflows.
    #[must_use]
    pub const fn take_and_advance(&mut self) -> Self {
        let current = *self;
        self.0 = current.0.checked_add(1).expect("local id overflow");
        current
    }
}

/// Global sample identifier consisting of a [`ShardId`] and a [`LocalId`].
///
/// When formatted with `{:x}`/`{:X}` it renders as `shard-local` in hexadecimal with eight digits
/// per component, separated by a dash, for example: `abcd1234-deadbeef`.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GlobalId {
    shard_id: ShardId,
    local_id: LocalId,
}

impl fmt::LowerHex for GlobalId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:08x}-{:08x}", self.shard_id.0, self.local_id.0)
    }
}

impl fmt::UpperHex for GlobalId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:08X}-{:08X}", self.shard_id.0, self.local_id.0)
    }
}

/// Deterministic seeding context holding the master seed and shard identifier.
///
/// Use [`ProduceContext::global_id`] to build a [`GlobalId`] from the current shard and a
/// [`LocalId`], then feed it into [`ProduceContext::rng`] with a domain-specific [`Scope`] to
/// obtain a stable RNG stream for that sample.
#[derive(Debug)]
pub struct ProduceContext {
    /// Global master seed for the whole run.
    pub master_seed: u64,
    /// Shard this context belongs to.
    pub shard_id: ShardId,
}

/// Four-byte domain key selecting a substream within a given [`GlobalId`]/[`ShardId`]/`master_seed`
/// triple.
///
/// Use distinct scopes like `b"TITL"`, `b"DESC"`, `b"CNST"` to avoid accidental correlation across
/// fields.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Scope(u32);

impl Scope {
    /// Construct a scope from a four-byte ASCII tag.
    #[must_use]
    #[expect(clippy::little_endian_bytes, reason = "We want to be deterministic")]
    #[expect(
        clippy::trivially_copy_pass_by_ref,
        reason = "Easier construction through binary string literal"
    )]
    pub const fn new(scope: &[u8; 4]) -> Self {
        Self(u32::from_le_bytes(*scope))
    }
}

impl ProduceContext {
    /// Combine the current [`ShardId`] with a [`LocalId`] to form a [`GlobalId`].
    #[must_use]
    pub const fn global_id(&self, local_id: LocalId) -> GlobalId {
        GlobalId {
            shard_id: self.shard_id,
            local_id,
        }
    }

    /// Create a deterministic RNG for the given [`GlobalId`] and [`Scope`].
    ///
    /// The stream is fully determined by `master_seed`, `shard_id`, `local_id`, and `scope`.
    /// Identical inputs produce identical random sequences. This RNG is not cryptographically
    /// secure.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hash_graph_test_data::seeding::context::{ProduceContext, ShardId, LocalId, Scope};
    /// # use rand::Rng as _;
    /// let ctx = ProduceContext {
    ///     master_seed: 0xA11CE,
    ///     shard_id: ShardId::new(1),
    /// };
    /// let id = ctx.global_id(LocalId::default());
    /// let mut rng = ctx.rng(id, Scope::new(b"DEMO"));
    /// let n: u32 = rng.random();
    /// # let _ = n;
    /// ```
    #[must_use]
    #[expect(clippy::little_endian_bytes, reason = "We want to be deterministic")]
    pub fn rng(&self, seed: GlobalId, scope: Scope) -> impl Rng {
        let mut buf = [0_u8; 20];
        buf[..8].copy_from_slice(&self.master_seed.to_le_bytes());
        buf[8..12].copy_from_slice(&seed.shard_id.0.to_le_bytes());
        buf[12..16].copy_from_slice(&seed.local_id.0.to_le_bytes());
        buf[16..20].copy_from_slice(&scope.0.to_le_bytes());
        KeyedRng {
            seed: xxh3_64(&buf),
            ctr: 0,
        }
    }
}

struct KeyedRng {
    seed: u64,
    ctr: u32,
}

impl RngCore for KeyedRng {
    #[inline]
    #[expect(clippy::little_endian_bytes, reason = "We want to be deterministic")]
    fn next_u64(&mut self) -> u64 {
        let mut buf = [0_u8; 12];
        buf[..8].copy_from_slice(&self.seed.to_le_bytes());
        buf[8..12].copy_from_slice(&self.ctr.to_le_bytes());
        self.ctr = self.ctr.wrapping_add(1);
        xxh3_64(&buf)
    }

    #[inline]
    fn next_u32(&mut self) -> u32 {
        (self.next_u64() >> 32) as u32
    }

    fn fill_bytes(&mut self, dst: &mut [u8]) {
        fill_bytes_via_next(self, dst);
    }
}

#[cfg(test)]
mod tests {
    use core::array;

    use rand::Rng as _;
    use rand_distr::Uniform;
    use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

    use super::*;
    use crate::seeding::producer::{self, ProducerExt as _};

    #[test]
    fn local_id_take_and_advance_increments() {
        let mut local = LocalId::default();
        let first = local.take_and_advance();
        let second = local.take_and_advance();

        assert_eq!(first, LocalId::default());
        assert_ne!(first, second);
    }

    #[test]
    fn rng_is_deterministic_for_same_inputs() {
        let ctx = ProduceContext {
            master_seed: 0xA11CE,
            shard_id: ShardId::new(7),
        };
        let gid = ctx.global_id(LocalId::default());
        let scope = Scope::new(b"TEST");

        let mut r1 = ctx.rng(gid, scope);
        let mut r2 = ctx.rng(gid, scope);

        let val_a: [u64; 1_000] = array::from_fn(|_| r1.random());
        let val_b: [u64; 1_000] = array::from_fn(|_| r2.random());
        assert_eq!(val_a, val_b);
    }

    #[test]
    fn rng_differs_when_scope_or_ids_change() {
        let ctx = ProduceContext {
            master_seed: 0xB0B,
            shard_id: ShardId::new(1),
        };
        let gid = ctx.global_id(LocalId::default());

        let mut base = ctx.rng(gid, Scope::new(b"SCOP"));
        let mut diff_scope = ctx.rng(gid, Scope::new(b"OTHR"));
        let mut diff_local = ctx.rng(
            GlobalId {
                shard_id: ShardId::new(1),
                local_id: LocalId(1),
            },
            Scope::new(b"SCOP"),
        );
        let mut diff_shard = ctx.rng(
            GlobalId {
                shard_id: ShardId::new(2),
                local_id: LocalId(0),
            },
            Scope::new(b"SCOP"),
        );

        let seq_base: [u64; 4] = core::array::from_fn(|_| base.random());
        let seq_scope: [u64; 4] = core::array::from_fn(|_| diff_scope.random());
        let seq_local: [u64; 4] = core::array::from_fn(|_| diff_local.random());
        let seq_shard: [u64; 4] = core::array::from_fn(|_| diff_shard.random());

        assert_ne!(seq_base, seq_scope, "scope should affect RNG stream");
        assert_ne!(seq_base, seq_local, "local id should affect RNG stream");
        assert_ne!(seq_base, seq_shard, "shard id should affect RNG stream");
    }

    #[test]
    fn multi_shard_parallel_is_deterministic() {
        let master_seed: u64 = 0xDEAD_BEEF_DEAD_BEEF;
        let num_shards: u32 = 8;
        let per_shard: usize = 25_000;

        // Helper, um pro Shard einen frischen Producer zu bekommen
        let make_producer = || {
            producer::for_distribution(
                Uniform::new(0, 100_000_000).expect("should be able to create producer"),
            )
        };

        // --- Run 1: parallel over shards ---
        let run1: Vec<(u32, Vec<u32>)> = (0..num_shards)
            .into_par_iter()
            .map(|sid| {
                let context = ProduceContext {
                    master_seed,
                    shard_id: ShardId(sid),
                };

                (
                    sid,
                    make_producer()
                        .iter_mut(&context)
                        .take(per_shard)
                        .collect::<Result<_, _>>()
                        .into_ok(),
                )
            })
            .collect();

        // --- Run 2: identical (Repro-Check) ---
        let run2: Vec<(u32, Vec<u32>)> = (0..num_shards)
            .into_par_iter()
            .map(|sid| {
                let context = ProduceContext {
                    master_seed,
                    shard_id: ShardId(sid),
                };

                (
                    sid,
                    make_producer()
                        .iter_mut(&context)
                        .take(per_shard)
                        .collect::<Result<_, _>>()
                        .into_ok(),
                )
            })
            .collect();

        // --- Repro-Check: Same outputs per shard ---
        for ((sid1, values1), (sid2, values2)) in run1.iter().zip(run2.iter()) {
            assert_eq!(sid1, sid2, "shard order mismatch");
            assert_eq!(
                values1.len(),
                values2.len(),
                "len mismatch for shard {sid1}"
            );
            assert_eq!(
                values1, values2,
                "non-deterministic output for shard {sid1}"
            );
        }

        // --- Compare against serial reference run ---
        let serial: Vec<(u32, Vec<u32>)> = (0..num_shards)
            .map(|sid| {
                let cx = ProduceContext {
                    master_seed,
                    shard_id: ShardId(sid),
                };
                let values = make_producer()
                    .iter_mut(&cx)
                    .take(per_shard)
                    .collect::<Result<_, _>>()
                    .into_ok();
                (sid, values)
            })
            .collect();

        assert_eq!(run1, serial, "parallel vs serial mismatch");
    }
}
