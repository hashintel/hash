//! Deterministic seeding context and keyed RNG utilities.
//!
//! This module provides deterministic, shard-aware random number generation for seeding large
//! datasets in a reproducible way. Streams are derived from a [`GlobalId`], which is composed of
//! the following fields:
//!
//! - [`RunId`]: identifies the end-to-end run, isolating RNG streams across runs
//! - [`StageId`]: identifies the scenario stage within a run
//! - [`ShardId`]: coarse partitioning across parallel workers
//! - [`LocalId`]: per-producer monotonically increasing counter
//! - [`Scope`]: generation domain
//! - [`SubScope`]: optional fine-grained partitioning within a scope
//! - [`Provenance`]: indicates the environment/source of generation
//! - [`ProducerId`]: identifies the producing component
//! - `retry`: small counter included in the id for deterministic retry semantics
//!
//! Together these fields define a unique per-sample id. Obtain a stable RNG via
//! [`GlobalId::rng`]. Use [`ProduceContext::global_id`] to construct a [`GlobalId`] from the
//! current context, a [`LocalId`], a [`Scope`], and a [`SubScope`].
//!
//! Local IDs:
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
//! - To serialize a [`GlobalId`], use [`GlobalId::encode`], which produces a UUID v8. Use
//!   [`GlobalId::decode`] to recover its components.
//!
//! # Examples
//!
//! ```rust
//! use hash_graph_test_data::seeding::context::{
//!     LocalId, ProduceContext, ProducerId, Provenance, RunId, Scope, ShardId, StageId, SubScope,
//! };
//! use rand::Rng as _;
//!
//! let context = ProduceContext {
//!     run_id: RunId::new(0xDEAD),
//!     stage_id: StageId::new(0xBEEF),
//!     shard_id: ShardId::new(0),
//!     provenance: Provenance::Integration,
//!     producer: ProducerId::User,
//! };
//! let gid = context.global_id(LocalId::default(), Scope::Schema, SubScope::Unknown);
//! let mut rng = gid.rng();
//! let value: u32 = rng.random();
//! # let _ = value;
//! ```

use core::{error::Error, fmt};

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use rand::{Rng, RngCore, rand_core::impls::fill_bytes_via_next};
use uuid::Uuid;
use xxhash_rust::xxh3::xxh3_64;

/// Identifies a run used to derive independent RNG streams.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct RunId(u16);

impl RunId {
    /// Create a new shard identifier.
    #[must_use]
    pub const fn new(run_id: u16) -> Self {
        Self(run_id)
    }
}

impl From<RunId> for u16 {
    fn from(run_id: RunId) -> Self {
        run_id.0
    }
}

/// Identifies a shard (coarse partition) used to derive independent RNG streams.
///
/// Each shard produces a disjoint random stream for the same [`LocalId`] and [`Scope`], enabling
/// parallel, reproducible generation across workers.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ShardId(u16);

impl ShardId {
    /// Create a new shard identifier.
    #[must_use]
    pub const fn new(shard_id: u16) -> Self {
        Self(shard_id)
    }
}

impl From<ShardId> for u16 {
    fn from(shard_id: ShardId) -> Self {
        shard_id.0
    }
}

impl fmt::LowerHex for ShardId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:04x}", self.0)
    }
}

impl fmt::UpperHex for ShardId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:04X}", self.0)
    }
}

/// Identifies a stage within a scenario run.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StageId(u16);

impl StageId {
    /// Create a new stage identifier.
    #[must_use]
    pub const fn new(stage_id: u16) -> Self {
        Self(stage_id)
    }

    /// Derive a stable `StageId` from a stage name.
    #[must_use]
    pub fn from_name(name: &str) -> Self {
        Self((xxh3_64(name.as_bytes()) & 0xFFFF) as u16)
    }
}

impl fmt::LowerHex for StageId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:04x}", self.0)
    }
}

impl fmt::UpperHex for StageId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:04X}", self.0)
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

impl fmt::LowerHex for LocalId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:08x}", self.0)
    }
}

impl fmt::UpperHex for LocalId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:08X}", self.0)
    }
}

/// Global sample identifier consisting of a [`ShardId`] and a [`LocalId`].
///
/// When formatted with `{:x}`/`{:X}` it renders as `shard-local` in hexadecimal with eight digits
/// per component, separated by a dash, for example: `abcd1234-deadbeef`.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GlobalId {
    pub run_id: RunId,
    pub stage_id: StageId,
    pub shard_id: ShardId,
    pub local_id: LocalId,
    pub provenance: Provenance,
    pub producer: ProducerId,
    pub scope: Scope,
    pub sub_scope: SubScope,
    pub retry: u8,
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} in UUID")]
pub enum ParseGlobalIdError {
    #[display("scope ID")]
    Scope,
    #[display("sub-scope ID")]
    SubScope,
    #[display("producer ID")]
    Producer,
}

impl Error for ParseGlobalIdError {}

impl GlobalId {
    /// Encodes this global id into a UUID v8.
    ///
    /// # Example
    ///
    /// ```rust
    /// # use hash_graph_test_data::seeding::context::{GlobalId, RunId, ShardId, StageId, LocalId, Scope, Provenance, ProducerId, SubScope};
    /// let gid = GlobalId {
    ///     run_id: RunId::new(0xAAAA),
    ///     stage_id: StageId::new(0xBBBB),
    ///     shard_id: ShardId::new(0xCCCC),
    ///     local_id: LocalId::default(),
    ///     provenance: Provenance::Integration,
    ///     producer: ProducerId::EntityType,
    ///     scope: Scope::Schema,
    ///     sub_scope: SubScope::Unknown,
    ///     retry: 0xCC,
    /// };
    /// let uuid = gid.encode();
    ///
    /// assert_eq!(uuid.to_string(), "aaaabbbb-cccc-80cc-8802-000000000000");
    /// assert_eq!(GlobalId::decode(uuid)?, gid);
    ///
    /// Ok::<_, error_stack::Report<[hash_graph_test_data::seeding::context::ParseGlobalIdError]>>(())
    /// ```
    #[must_use]
    #[expect(clippy::big_endian_bytes, reason = "We want to be deterministic")]
    pub fn encode(self) -> Uuid {
        // UUID v8 (128 bits, 16 bytes)
        // Bytes (0-based, BE layout):
        // +-------+-------+-------+-------+-------+-------+-------+-------+
        // |   0   |   1   |   2   |   3   |   4   |   5   |   6   |   7   |
        // |  run ID (u16) | stage (u16)   |    shard ID   | V | L | retry |
        // |               |               |               | e | o |       |
        // |               |               |               | r | 4 |       |
        // +-------+-------+-------+-------+-------+-------+-------+-------+
        // |   8   |   9   |   10  |   11  |   12  |   13  |   14  |   15  |
        // | V | L | scope |   sub_scope   |            local ID           |
        // | a | o |       |               |                               |
        // | r | 4 |       |               |                               |
        // +-------+-------+-------+-------+-------+-------+-------+-------+
        // Legend:
        // - Bytes 0-1:   run_id(u16, BE)
        // - Bytes 2-3:   stage_id(u16, BE)
        // - Bytes 4-5:   shard_id(u16, BE)
        // - Byte  6:     bits 7..4: Version (lib); bits 3..0: producer[31..28]
        // - Byte  7:     retry
        // - Byte  8:     bits 7..6: Variant (lib); bits 5..4: provenance; bits 3..0:
        //   producer[27..24]
        // - Bytes 9:     scope
        // - Bytes 10-11: sub_scope
        // - Bytes 12-15: local_id(u32, BE)

        let mut bytes = [0; 16];

        // Bytes 0–1: run_id (u16)
        bytes[0..2].copy_from_slice(&self.run_id.0.to_be_bytes());

        // Bytes 2–3: stage_id (u16)
        bytes[2..4].copy_from_slice(&self.stage_id.0.to_be_bytes());

        // Bytes 4–5: shard_id (u16)
        bytes[4..6].copy_from_slice(&self.shard_id.0.to_be_bytes());

        // Byte 6: high nibble = Version (uuid crate overrides), low nibble = producer hi4
        bytes[6] |= self.producer as u8 >> 4;

        // Byte 7: retry
        bytes[7] = self.retry;

        // Byte 8:
        // high 2 bits = Variant (uuid crate overrides)
        // bits 5..4 = provenance (2 Bit)
        // low nibble = producer lo4
        bytes[8] = (((self.provenance as u8) & 0b11) << 4) | (self.producer as u8 & 0x0F);

        // Byte 9: scope
        bytes[9] = self.scope as u8;

        // Bytes 10–11: sub_scope (u16)
        bytes[10..12].copy_from_slice(&(self.sub_scope as u16).to_be_bytes());

        // Bytes 12–15: local_id (u32)
        bytes[12..16].copy_from_slice(&self.local_id.0.to_be_bytes());

        Uuid::new_v8(bytes)
    }

    /// Decodes a UUID v8 produced by [`encode`] back into its [`GlobalId`] components.
    ///
    /// See [`encode`] for the encoding format.
    ///
    /// [`encode`]: Self::encode
    ///
    /// # Errors
    ///
    /// Returns an error if the UUID contains invalid values.
    #[expect(clippy::big_endian_bytes, reason = "We want to be deterministic")]
    pub fn decode(uuid: Uuid) -> Result<Self, Report<[ParseGlobalIdError]>> {
        let bytes = *uuid.as_bytes();

        // run_id
        let run_id = RunId(u16::from_be_bytes([bytes[0], bytes[1]]));

        // stage_id
        let stage_id = StageId(u16::from_be_bytes([bytes[2], bytes[3]]));

        // shard_id
        let shard_id = ShardId(u16::from_be_bytes([bytes[4], bytes[5]]));

        // producer = hi4 | lo4
        let hi4 = bytes[6] & 0x0F;
        let lo4 = bytes[8] & 0x0F;
        let producer =
            ProducerId::from_u8((hi4 << 4) | lo4).change_context(ParseGlobalIdError::Producer);

        // retry
        let retry = bytes[7];

        // provenance (bits 5..4)
        let provenance = match (bytes[8] >> 4) & 0b11 {
            0b00 => Provenance::Integration,
            0b01 => Provenance::Benchmark,
            0b10 => Provenance::Staging,
            _ => Provenance::Unknown,
        };

        // scope
        let scope = Scope::from_u8(bytes[9]).change_context(ParseGlobalIdError::Scope);

        // sub_scope
        let sub_scope = SubScope::from_u16(u16::from_be_bytes([bytes[10], bytes[11]]))
            .change_context(ParseGlobalIdError::SubScope);

        // local_id
        let local_id = LocalId(u32::from_be_bytes([
            bytes[12], bytes[13], bytes[14], bytes[15],
        ]));

        let (producer, scope, sub_scope) = (producer, scope, sub_scope).try_collect()?;

        Ok(Self {
            run_id,
            stage_id,
            shard_id,
            local_id,
            provenance,
            producer,
            scope,
            sub_scope,
            retry,
        })
    }

    #[must_use]
    pub fn rng(self) -> impl Rng {
        KeyedRng {
            seed: xxh3_64(self.encode().as_bytes()),
            ctr: 0,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum ProducerId {
    User,
    Machine,
    Ai,
    Web,
    Team,
    Policy,
    DataType,
    PropertyType,
    EntityType,
    Entity,
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid producer id: {producer_id}")]
pub struct ParseProducerIdError {
    producer_id: u8,
}

impl Error for ParseProducerIdError {}

impl ProducerId {
    const fn from_u8(value: u8) -> Result<Self, ParseProducerIdError> {
        match value {
            0 => Ok(Self::User),
            1 => Ok(Self::Machine),
            2 => Ok(Self::Ai),
            3 => Ok(Self::Web),
            4 => Ok(Self::Team),
            5 => Ok(Self::Policy),
            6 => Ok(Self::DataType),
            7 => Ok(Self::PropertyType),
            8 => Ok(Self::EntityType),
            9 => Ok(Self::Entity),
            _ => Err(ParseProducerIdError { producer_id: value }),
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub struct ProduceContext {
    pub run_id: RunId,
    pub stage_id: StageId,
    pub shard_id: ShardId,
    pub provenance: Provenance,
    pub producer: ProducerId,
}

impl ProduceContext {
    #[must_use]
    pub const fn for_producer(self, producer: ProducerId) -> Self {
        Self { producer, ..self }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Scope {
    Id,
    Registration,
    Schema,
    Ownership,
    Provenance,
    Conversions,
    Config,
    Metadata,
    Boolean,
    Number,
    String,
    Array,
    Object,
    Anonymous = 0xFF,
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid scope: {scope}")]
pub struct ParseScopeError {
    scope: u8,
}

impl Error for ParseScopeError {}

impl Scope {
    const fn from_u8(value: u8) -> Result<Self, ParseScopeError> {
        match value {
            0 => Ok(Self::Id),
            1 => Ok(Self::Registration),
            2 => Ok(Self::Schema),
            3 => Ok(Self::Ownership),
            4 => Ok(Self::Provenance),
            5 => Ok(Self::Conversions),
            6 => Ok(Self::Config),
            7 => Ok(Self::Metadata),
            8 => Ok(Self::Boolean),
            9 => Ok(Self::Number),
            10 => Ok(Self::String),
            11 => Ok(Self::Array),
            12 => Ok(Self::Object),
            0xFF => Ok(Self::Anonymous),
            _ => Err(ParseScopeError { scope: value }),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(u16)]
pub enum SubScope {
    Unknown,
    Domain,
    Web,
    Title,
    Description,
    ValueConstraint,
    PropertyValue,
    Property,
    Link,
    Conflict,
    Ownership,
    WebType,
    Index,
    FetchedAt,
    Provenance,
    Type,
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid sub-scope: {sub_scope}")]
pub struct ParseSubScopeError {
    sub_scope: u16,
}

impl Error for ParseSubScopeError {}

impl SubScope {
    const fn from_u16(value: u16) -> Result<Self, ParseSubScopeError> {
        match value {
            0 => Ok(Self::Unknown),
            1 => Ok(Self::Domain),
            2 => Ok(Self::Web),
            3 => Ok(Self::Title),
            4 => Ok(Self::Description),
            5 => Ok(Self::ValueConstraint),
            6 => Ok(Self::PropertyValue),
            7 => Ok(Self::Property),
            8 => Ok(Self::Link),
            9 => Ok(Self::Conflict),
            10 => Ok(Self::Ownership),
            11 => Ok(Self::WebType),
            12 => Ok(Self::Index),
            13 => Ok(Self::FetchedAt),
            14 => Ok(Self::Provenance),
            15 => Ok(Self::Type),
            _ => Err(ParseSubScopeError { sub_scope: value }),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Provenance {
    Integration = 0b00,
    Benchmark = 0b01,
    Staging = 0b10,
    Unknown = 0b11,
}

impl ProduceContext {
    /// Combine the current context with a [`LocalId`], [`Scope`], and [`SubScope`] to form a
    /// [`GlobalId`].
    #[must_use]
    pub const fn global_id(self, local_id: LocalId, scope: Scope, sub_scope: SubScope) -> GlobalId {
        GlobalId {
            run_id: self.run_id,
            stage_id: self.stage_id,
            shard_id: self.shard_id,
            local_id,
            provenance: self.provenance,
            producer: self.producer,
            scope,
            sub_scope,
            retry: 0,
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

    use super::*;

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
            run_id: RunId::new(0xA11C),
            stage_id: StageId::new(0xE000),
            shard_id: ShardId::new(7),
            provenance: Provenance::Integration,
            producer: ProducerId::User,
        };
        let gid = ctx.global_id(LocalId::default(), Scope::Schema, SubScope::Title);

        let val_a: [u64; 1_000] = array::from_fn(|_| gid.rng().random());
        let val_b: [u64; 1_000] = array::from_fn(|_| gid.rng().random());
        assert_eq!(val_a, val_b);
    }

    #[test]
    fn rng_differs_when_scope_or_ids_change() {
        let ctx = ProduceContext {
            run_id: RunId::new(0xB0B0),
            stage_id: StageId::new(0x0001),
            shard_id: ShardId::new(1),
            provenance: Provenance::Integration,
            producer: ProducerId::User,
        };

        let mut base = ctx
            .global_id(LocalId::default(), Scope::Config, SubScope::Provenance)
            .rng();
        let mut diff_scope = ctx
            .global_id(LocalId::default(), Scope::Ownership, SubScope::Unknown)
            .rng();
        let mut diff_local = ctx
            .global_id(LocalId(1), Scope::Registration, SubScope::Unknown)
            .rng();

        let seq_base: [u64; 4] = core::array::from_fn(|_| base.random());
        let seq_scope: [u64; 4] = core::array::from_fn(|_| diff_scope.random());
        let seq_local: [u64; 4] = core::array::from_fn(|_| diff_local.random());

        assert_ne!(seq_base, seq_scope, "scope should affect RNG stream");
        assert_ne!(seq_base, seq_local, "local id should affect RNG stream");
    }
}
