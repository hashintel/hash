//! The keyed permutation that carries row ids across the wire.
//!
//! Internal row ids are dense and assignment-ordered. Sent verbatim, they let a principal bound
//! hidden row counts between two visible ids (gap analysis) and estimate the universe size from
//! any received sample. Ids cross the wire through [`RowCodec`], a keyed bijection of the full
//! `u32` range. Wire ids are opaque and sparse: a valid id is any `u32` value, and the mapping is
//! independent of the universe size. To the extent the keyed permutation is indistinguishable from
//! a random permutation of `[0, 2^32)` at the volume of ids an observer collects, the wire ids that
//! observer receives follow the distribution of a uniform subset of the range, and order,
//! adjacency, creation time, and the universe size stay hidden. That indistinguishability is the
//! construction's design target rather than a proved bound. The codec decodes exactly and claims
//! no security property beyond obfuscation.
//!
//! # Model
//!
//! An eight-round balanced Feistel network permutes the `u32` range. Round `i` splits the state
//! into two 16-bit halves and maps `(L, R)` to `(R, L xor F_i(R))` under the keyed round function
//! `F_i` (SipHash-2-4 truncated to 16 bits). The permutation does not depend on the universe, and
//! appending rows to a generation leaves every existing wire id unchanged. Encoding applies the
//! network to a row id. Decoding applies the inverse network and bounds-checks the result against
//! the accepted [`Universe`]: exactly the `N` wire values in the image of `[0, N)` decode, and
//! every other value answers [`None`].
//!
//! Taking the universe per call lets one codec, derived when the generation opens, serve an
//! accepted row set that delta slot allocation grows past the fitted rows.
//!
//! # Keys
//!
//! Round keys derive from `HKDF-SHA256` over the server secret, salted by the generation identity
//! and expanded under a per-domain label, when a generation opens for serving. Equal `(secret,
//! generation, label)` give equal mappings, and responses stay byte-deterministic across restarts.
//! A different generation changes every wire id, and the label names the mapping's row domain
//! ([`NODE_LABEL`] for the node rows). Wire ids never reach the [fit pipeline](crate::salt::fit),
//! and no artifact stores one.

use core::{fmt, hash::Hasher as _, marker::PhantomData};

use hashql_core::id::Id;
use hkdf::Hkdf;
use sha2::Sha256;
use siphasher::sip::SipHasher24;
use zeroize::Zeroizing;

use crate::{file::generation::GenerationId, identity::NodeRowId};

/// The Feistel round count one codec applies.
//
// The per-id cost of eight rounds stays under a microsecond. The classical Luby-Rackoff strong-PRP
// threshold is four rounds, an asymptotic result, and this codec claims no concrete
// indistinguishability bound at this domain size and round function.
const ROUNDS: usize = 8;

/// The Feistel half width.
const HALF_BITS: u32 = 16;

/// The low-half mask.
const HALF_MASK: u32 = 0xFFFF;

/// The HKDF expansion label of the node-row domain.
//
// Edges carry their link entity's identity and take no wire id of their own.
pub(crate) const NODE_LABEL: &[u8] = b"atlas.wire.node.v1";

/// The accepted row universe, the exclusive bound on the rows a codec maps.
///
/// Rows live in `[0, N)` and the value is `N`. The bound belongs to one snapshot of a generation:
/// the fitted rows set the base bound, and delta slot allocation widens it. An answer reads one
/// value at every encode and decode, and the accepted set cannot shift inside it.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Universe<N>(N);

impl<N> Universe<N>
where
    N: Id,
{
    /// Bounds the universe at `rows`.
    #[must_use]
    pub(crate) const fn new(rows: N) -> Self {
        Self(rows)
    }

    /// Returns a universe with the given `length` as the exclusive row bound.
    #[must_use]
    pub(crate) const fn from_length(length: usize) -> Self
    where
        N: [const] Id,
    {
        Self(N::from_usize(length))
    }

    /// Returns the exclusive row bound.
    #[must_use]
    pub(crate) const fn size(self) -> usize
    where
        N: [const] Id,
    {
        self.0.as_usize()
    }

    /// Allocates the row at the bound, widening the universe past it.
    ///
    /// Returns the widened universe with the allocated row, or [`None`] once the id space runs
    /// out.
    pub(crate) const fn grow(self) -> Option<(Self, N)>
    where
        N: [const] Id,
    {
        let next = self.0.next()?;
        Some((Self(next), self.0))
    }

    /// Returns whether `row` lies inside the universe.
    pub(crate) const fn contains(self, row: N) -> bool
    where
        N: [const] PartialOrd,
    {
        row < self.0
    }
}

/// A row id as it crosses the wire.
///
/// The value relates to an internal row id only through the owning generation's [`RowCodec`]:
/// [`RowCodec::encode`] produces egress values, and deserialization admits client-echoed values
/// whose meaning only [`RowCodec::decode`] assigns. An arbitrary `u32` is a well-formed value that
/// decodes to [`None`] outside the encoded image. Ordering compares wire values, and a tie broken
/// on it is client-observable without exposing internal order.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Hash, schemars::JsonSchema)]
#[repr(transparent)]
#[schemars(transparent)]
pub(crate) struct EncodedRowId<I>(u32, #[schemars(skip)] PhantomData<I>);

impl<I> EncodedRowId<I> {
    /// Admits a value already in wire form, without an encoding pass.
    pub(crate) const fn new_unchecked(value: u32) -> Self {
        Self(value, PhantomData)
    }

    /// Returns the wire value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u32 {
        self.0
    }
}

impl<I> Copy for EncodedRowId<I> {}

impl<I> Clone for EncodedRowId<I> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<I> serde::Serialize for EncodedRowId<I> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl<'de, I> serde::Deserialize<'de> for EncodedRowId<I> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        u32::deserialize(deserializer).map(|value| Self(value, PhantomData))
    }
}

pub(crate) trait EncodableId: Id {
    fn label() -> &'static [u8] {
        core::any::type_name::<Self>().as_bytes()
    }
}

impl EncodableId for NodeRowId {}

/// The keyed mapping between one dense row domain and its wire ids.
///
/// One codec serves one row domain of one generation. The underlying permutation bijects the `u32`
/// range for every key. Encoding restricts it to the caller's [`Universe`] and decoding inverts
/// exactly the image of that universe, answering [`None`] elsewhere. Both are pure: the mapping
/// never changes while the generation serves, and only the accepted bound moves as slots allocate.
pub(crate) struct RowCodec<I> {
    /// The per-round SipHash-2-4 keys.
    keys: Zeroizing<[[u8; 16]; ROUNDS]>,
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
    pub(crate) fn derive(secret: &[u8], generation: GenerationId) -> Self
    where
        I: EncodableId,
    {
        let salt = generation.digest().to_bytes();
        let label = I::label();

        let mut keys = Zeroizing::new([[0_u8; 16]; ROUNDS]);
        Hkdf::<Sha256>::new(Some(&salt), secret)
            .expand(label, (*keys).as_flattened_mut())
            .expect("128 octets stay within HKDF-SHA256's expansion bound");

        Self {
            keys,
            _marker: PhantomData,
        }
    }

    /// Encodes an internal row id of `universe` as its wire id.
    pub(crate) fn encode(&self, row: I) -> EncodedRowId<I> {
        EncodedRowId::new_unchecked(self.permute(row.as_u32()))
    }

    /// Decodes a wire value back to its internal row id, [`None`] outside the image of `universe`.
    pub(crate) fn decode(&self, wire: EncodedRowId<I>, universe: Universe<I>) -> Option<I> {
        let row = I::from_u32(self.unpermute(wire.get()));
        universe.contains(row).then_some(row)
    }

    /// Applies the Feistel network once over the `u32` range.
    fn permute(&self, mut state: u32) -> u32 {
        for key in &*self.keys {
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

impl<I: fmt::Debug> fmt::Debug for RowCodec<I> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RowCodec")
            .field("rounds", &ROUNDS)
            .finish_non_exhaustive()
    }
}

/// Evaluates one round function: the low 32 bits of the keyed SipHash-2-4 of `half`.
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
