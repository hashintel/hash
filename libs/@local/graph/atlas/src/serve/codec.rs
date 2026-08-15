//! The wire row-id boundary.
//!
//! A keyed permutation of the full `u32` range, applied where ids cross the wire.
//!
//! Internal row ids are dense and assignment-ordered, so sending them verbatim lets a principal
//! bound hidden row counts between two visible ids (gap analysis) and estimate the universe size
//! from any received sample. Ids therefore cross the wire through [`RowCodec`], a keyed bijection
//! of the full `u32` range. Wire ids are opaque and sparse - a valid id is any `u32` value, and the
//! mapping is independent of the universe size. To the extent the keyed permutation is
//! indistinguishable from a random permutation of `[0, 2^32)` at the volume of ids an observer
//! collects, the wire ids one scope receives follow the distribution of a uniform subset of the
//! range, and order, adjacency, creation time, and the universe size stay hidden. That
//! indistinguishability is the construction's design target, not a proved bound: the codec is an
//! obfuscation layer with exact decode guarantees, not a demonstrated security boundary.
//!
//! # Model
//!
//! An eight-round balanced Feistel network permutes the `u32` range. Round `i` splits the state
//! into two 16-bit halves and maps `(L, R)` to `(R, L xor F_i(R))` under the keyed round function
//! `F_i` (SipHash-2-4 truncated to 16 bits). The permutation stays fixed as the universe grows, so
//! appending rows leaves every existing mapping unchanged and wire ids are stable within a
//! generation under row addition. Encoding applies the network to a row id. Decoding applies the
//! inverse network and bounds-checks the result against the accepted [`Universe`], so exactly the
//! `N` wire values in the image of `[0, N)` decode and every other value answers [`None`].
//!
//! The universe arrives per call rather than living in the codec, because the accepted row set
//! grows while a generation serves: delta slot allocation extends it past the fitted rows. A
//! caller takes one [`Universe`] value and reads it at every encode and decode in one answer, so
//! the accepted set cannot shift inside a response.
//!
//! # Keys
//!
//! Round keys derive from `HKDF-SHA256` over the server secret, salted by the generation identity
//! and expanded under a per-universe label, when a generation opens for serving. Equal `(secret,
//! generation, label)` give equal mappings, so responses stay byte-deterministic across restarts; a
//! different generation changes every wire id, and the label names the mapping's universe - Surface
//! v1 exposes one universe, the node rows. Edges carry their link entity's identity instead of a
//! wire id of their own. Wire ids never reach the fit pipeline, and no artifact stores one.

use core::{hash::Hasher as _, marker::PhantomData};

use hashql_core::id::Id;
use hkdf::Hkdf;
use sha2::Sha256;
use siphasher::sip::SipHasher24;

use super::WireSecret;
use crate::file::generation::GenerationId;

/// The Feistel round count one codec applies.
//
// The per-id cost of eight rounds stays under a microsecond. The classical Luby-Rackoff strong-PRP
// threshold is four rounds, an asymptotic result, and this codec claims no concrete
// indistinguishability bound at this domain size and round function.
const ROUNDS: usize = 8;

/// The Feistel half width.
///
/// The network splits the `u32` state into two 16-bit halves.
const HALF_BITS: u32 = 16;

/// The low-half mask.
const HALF_MASK: u32 = 0xFFFF;

/// The HKDF expansion label of the node-row universe.
pub(crate) const NODE_LABEL: &[u8] = b"atlas.wire.node.v1";

/// The accepted row universe, the exclusive bound on the rows a codec maps.
///
/// Rows live in `[0, N)` and the value is `N`. The generation's open derives the base bound from
/// the validated row column, and a delta snapshot carries the wider bound its slot allocation has
/// reached, so the accepted set is a fact about one snapshot rather than about the generation. A
/// caller resolves one value and reads it at every encode and decode in one answer.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Universe(u32);

impl Universe {
    /// Bounds the universe at `rows`.
    #[must_use]
    pub(crate) const fn new(rows: u32) -> Self {
        Self(rows)
    }

    /// Returns the exclusive row bound.
    #[must_use]
    pub(crate) const fn rows(self) -> u32 {
        self.0
    }

    /// Returns whether `row` lies inside the universe.
    pub(crate) const fn admits(self, row: u32) -> bool {
        row < self.0
    }
}

/// A row id as it crosses the wire.
///
/// The value relates to an internal row id only through the owning generation's [`RowCodec`]:
/// [`RowCodec::encode`] mints egress values, and deserialization admits client-echoed values whose
/// meaning only [`RowCodec::decode`] assigns - an arbitrary `u32` is a well-formed [`WireRow`] that
/// decodes to [`None`] outside the encoded image. Comparisons order wire values, so a tie broken on
/// [`WireRow`] is client-observable without exposing internal order.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Hash, schemars::JsonSchema)]
#[repr(transparent)]
#[schemars(transparent)]
pub(crate) struct WireRow<I>(u32, #[schemars(skip)] PhantomData<I>);

impl<I> WireRow<I> {
    /// Returns the wire value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u32 {
        self.0
    }
}

#[cfg(test)]
impl<I> WireRow<I> {
    /// Mints a wire value from its literal wire-domain representation.
    ///
    /// The value already carries its wire form, and this constructor encodes nothing.
    pub(crate) const fn pinned(value: u32) -> Self {
        Self(value, PhantomData)
    }
}

impl<I> Copy for WireRow<I> {}

impl<I> Clone for WireRow<I> {
    fn clone(&self) -> Self {
        *self
    }
}

// Manual impls: only the wire value crosses the wire, and the phantom
// parameter stays out of the serde bounds.
impl<I> serde::Serialize for WireRow<I> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl<'de, I> serde::Deserialize<'de> for WireRow<I> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        u32::deserialize(deserializer).map(|value| Self(value, PhantomData))
    }
}

/// The keyed mapping between one dense row domain and its wire ids.
///
/// One codec serves one row domain of one generation. [`Self::derive`] is the constructor. The
/// underlying permutation bijects the `u32` range for every key. Encoding restricts it to the
/// caller's [`Universe`] and decoding inverts exactly the image of that universe, answering
/// [`None`] elsewhere. Both are pure: the mapping never changes while the generation serves, and
/// only the accepted bound moves as slots allocate.
#[derive(Debug)]
pub(crate) struct RowCodec<I> {
    /// The per-round SipHash-2-4 keys.
    keys: [[u8; 16]; ROUNDS],
    _marker: PhantomData<I>,
}

impl<I> RowCodec<I>
where
    I: Id,
{
    /// Derives the codec of one row domain from the server secret.
    ///
    /// The generation identity salts the extraction and `label` separates row domains under one
    /// generation. Equal arguments derive equal codecs.
    pub(crate) fn derive(secret: &WireSecret, generation: GenerationId, label: &[u8]) -> Self {
        let salt = generation.digest().to_bytes();

        let mut material = [0_u8; 16 * ROUNDS];
        Hkdf::<Sha256>::new(Some(&salt), secret.as_bytes())
            .expand(label, &mut material)
            .expect("128 octets stay within HKDF-SHA256's expansion bound");

        let mut keys = [[0_u8; 16]; ROUNDS];
        for (key, chunk) in keys.iter_mut().zip(material.as_chunks::<16>().0) {
            *key = *chunk;
        }

        Self {
            keys,
            _marker: PhantomData,
        }
    }

    /// Encodes an internal row id of `universe` as its wire id.
    ///
    /// # Panics
    ///
    /// This panics when `row` lies outside `universe`. Encoding is a producer contract, so an
    /// out-of-universe row upstream is a defect in the caller rather than input to reject.
    pub(crate) fn encode(&self, row: I, universe: Universe) -> WireRow<I> {
        let row = row.as_u32();
        assert!(
            universe.admits(row),
            "the codec encodes rows of the caller's universe",
        );

        WireRow(self.permute(row), PhantomData)
    }

    /// Decodes a wire value back to its internal row id, [`None`] outside the image of `universe`.
    ///
    /// [`None`] is the single out-of-image answer; ingress resolution collapses it with every other
    /// lookup failure before a response can observe the cause.
    pub(crate) fn decode(&self, wire: WireRow<I>, universe: Universe) -> Option<I> {
        let row = self.unpermute(wire.get());
        universe.admits(row).then_some(I::from_u32(row))
    }

    /// Applies the Feistel network once over the `u32` range.
    fn permute(&self, mut state: u32) -> u32 {
        for key in &self.keys {
            let left = state >> HALF_BITS;
            let right = state & HALF_MASK;
            state = (right << HALF_BITS) | (left ^ (round(key, right) & HALF_MASK));
        }

        state
    }

    /// Applies the inverse network once over the `u32` range.
    fn unpermute(&self, mut state: u32) -> u32 {
        for key in self.keys.iter().rev() {
            let right = state >> HALF_BITS;
            let left = (state & HALF_MASK) ^ (round(key, right) & HALF_MASK);
            state = (left << HALF_BITS) | right;
        }

        state
    }
}

/// Evaluates one round function.
///
/// Keyed SipHash-2-4 of the right half, truncated by the caller to the half width.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the caller masks to the half width; the narrowing keeps the used bits"
)]
#[expect(
    clippy::little_endian_bytes,
    reason = "the round function hashes one pinned byte order; the codec never crosses hosts"
)]
fn round(key: &[u8; 16], half: u32) -> u32 {
    let mut hasher = SipHasher24::new_with_key(key);
    hasher.write(&half.to_le_bytes());
    hasher.finish() as u32
}
