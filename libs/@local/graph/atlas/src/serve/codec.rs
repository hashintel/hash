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
//! network to a row id, and exactly the rows in `[0, 2^32)` have one: [`WIRE_ROW_BOUND`] is the
//! exclusive bound. Decoding applies the inverse network, checks that the result fits the ID
//! type and bounds-checks it against the accepted [`RowDomain`]. For a zero-based ID type and
//! accepted row count N ≤ [`WIRE_ROW_BOUND`], exactly the N wire values in the image of `[0, N)`
//! decode, and every other value answers [`None`].
//!
//! Taking the universe per call lets one codec, derived when the generation opens, serve an
//! accepted row set that delta slot allocation grows past the fitted rows.
//!
//! # Keys
//!
//! Round keys derive from `HKDF-SHA256` over the server secret, salted by the generation identity
//! and expanded under a per-domain label, when a generation opens for serving. Equal `(secret,
//! generation, label)` give equal mappings. This is intentional: encoded row ids remain stable
//! across restarts. Wire ids can coincide across two generations by chance. These coincidences are
//! acceptable because wire ids identify rows only within their generation.
//!
//! The label returned by [`EncodableId::label`] identifies the row type. Node rows, the only type
//! exposed to external callers, use `atlas.wire.node.v1`.

use core::{fmt, hash::Hasher as _, marker::PhantomData};

use hashql_core::id::Id;
use hkdf::Hkdf;
use sha2::Sha256;
use siphasher::sip::SipHasher24;
use zeroize::Zeroizing;

use crate::{file::generation::GenerationId, identity::NodeRowId};

/// The Feistel round count one codec applies.
//
// the classical Luby-Rackoff strong-PRP threshold is four rounds, an asymptotic result, and this
// codec claims no concrete indistinguishability bound at this domain size and round function.
const ROUNDS: usize = 8;

/// The Feistel half width.
const HALF_BITS: u32 = 16;

/// The low-half mask.
const HALF_MASK: u32 = 0xFFFF;

/// The exclusive bound of the rows that have a wire id.
///
/// The permutation is over `u32`, and a row is encodable exactly when it lies in
/// `[0, WIRE_ROW_BOUND)`. Row `u32::MAX` is encodable, and a [`RowDomain`] of exactly this size is
/// the widest a codec serves.
pub(crate) const WIRE_ROW_BOUND: u64 = 1 << u32::BITS;

/// The exclusive bound on accepted row ids.
///
/// The universe contains the rows representable by `N` below the bound. The bound belongs to
/// one snapshot of a generation: the fitted rows set the base bound, and delta slot allocation
/// widens it.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RowDomain<N>(N);

impl<N> RowDomain<N>
where
    N: Id,
{
    /// Bounds the universe at `rows`.
    #[must_use]
    pub(crate) const fn new(rows: N) -> Self {
        Self(rows)
    }

    /// Returns a universe with `length` as the exclusive row bound.
    ///
    /// # Panics
    ///
    /// Panics if `length` is outside `N`'s representable range. For fallible construction, convert
    /// with [`TryFrom::try_from`] and use [`Self::new`].
    #[must_use]
    pub(crate) const fn from_length(length: usize) -> Self
    where
        N: [const] Id,
    {
        Self(N::from_usize(length))
    }

    /// Returns the exclusive row bound as a count.
    #[must_use]
    pub(crate) const fn size(self) -> usize
    where
        N: [const] Id,
    {
        self.0.as_usize()
    }

    /// Returns the exclusive row bound, the row [`grow`](Self::grow) allocates next.
    #[must_use]
    pub(crate) const fn bound(self) -> N {
        self.0
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

/// A row domain that crosses the wire under its own keyed mapping.
///
/// The label is the HKDF expansion `info` of the domain's codec. Equal labels under one secret
/// and generation derive equal codecs.
pub(crate) trait EncodableId: Id {
    /// Returns the HKDF expansion label of this row domain.
    ///
    /// By default, the label uses [`core::any::type_name`], whose output may change with the
    /// compiler or the type's path. A stable wire domain must override this method with fixed
    /// bytes. Changing the label can change wire ids, and individual rows may retain the same
    /// value.
    fn label() -> &'static [u8] {
        core::any::type_name::<Self>().as_bytes()
    }
}

impl EncodableId for NodeRowId {
    fn label() -> &'static [u8] {
        b"atlas.wire.node.v1"
    }
}

/// The keyed mapping between one dense row domain and its wire ids.
///
/// One codec serves one row domain of one generation. The underlying permutation bijects the `u32`
/// range for every key. Encoding accepts rows below [`WIRE_ROW_BOUND`]. Decoding inverts the
/// permutation and returns [`None`] for rows outside the ID type or the accepted [`RowDomain`].
/// Both are pure: the mapping never changes while the generation serves, and only the accepted
/// bound moves as slots allocate.
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
    /// The generation identity salts the extraction and [`EncodableId::label`] separates row
    /// domains under one generation. Equal arguments derive equal codecs.
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

    /// Returns whether `row` has a wire id, that is whether it lies below [`WIRE_ROW_BOUND`].
    #[must_use]
    pub(crate) fn encodes(row: I) -> bool {
        row.as_u64() < WIRE_ROW_BOUND
    }

    /// Encodes an internal row id as its wire id.
    ///
    /// # Panics
    ///
    /// Panics if `row` has no wire id under [`encodes`](Self::encodes).
    pub(crate) fn encode(&self, row: I) -> EncodedRowId<I> {
        assert!(
            Self::encodes(row),
            "an encoded row must lie in [0, 2^32): the open bounds the fitted rows and node \
             allocation refuses the bound"
        );

        EncodedRowId::new_unchecked(self.permute(row.as_u32()))
    }

    /// Decodes a wire value to a row accepted by `domain`.
    ///
    /// Returns [`None`] if the unpermuted value is outside the ID type's range or `domain`.
    pub(crate) fn decode(&self, wire: EncodedRowId<I>, domain: RowDomain<I>) -> Option<I> {
        let row = I::try_from(self.unpermute(wire.get())).ok()?;
        domain.contains(row).then_some(row)
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

#[cfg(test)]
mod tests {
    use hashql_core::id::{Id as _, newtype};

    use super::{EncodableId, EncodedRowId, RowCodec, RowDomain, WIRE_ROW_BOUND};
    use crate::{file::generation::GenerationId, identity::NodeRowId, integrity::Sha256Digest};

    newtype!(struct SmallRowId(u32 is 0..=3));

    impl EncodableId for SmallRowId {}

    /// The secret every vector below derives from.
    const SECRET: &[u8] = b"atlas-codec-vector-secret";

    /// The generation seeds of the two pinned tables.
    ///
    /// A generation identity is the SHA-256 digest of its seed.
    const GENERATION_SEEDS: [&[u8]; 2] = [
        b"atlas-codec-vector-generation",
        b"atlas-codec-vector-generation-2",
    ];

    /// `(row, wire)` pairs of [`SECRET`] under the first seed and `b"atlas.wire.node.v1"`.
    ///
    /// The values come from an independent implementation of the module's construction:
    /// HKDF-SHA256 per RFC 5869 with the generation digest as salt, the secret as keying material
    /// and the label as info, eight 16-byte SipHash-2-4 keys in expansion order, and the
    /// eight-round Feistel network of the module doc. That implementation reproduces RFC 5869 A.1
    /// and the SipHash-2-4 reference vector. A pair pins the label in force, the salt and info
    /// roles, the key order, the round function's byte order and the Feistel structure at once.
    /// The rows are the smallest three, both sides of the half-width boundary and the last
    /// encodable row.
    const VECTORS: [(u32, u32); 6] = [
        (0x0000_0000, 0x8BD5_91BE),
        (0x0000_0001, 0x62C0_23C6),
        (0x0000_0002, 0x2FAD_EF18),
        (0x0000_FFFF, 0x4B4D_9B04),
        (0x0001_0000, 0x44A3_0B72),
        (0xFFFF_FFFF, 0x9EEB_C0B7),
    ];

    /// `(row, wire)` pairs of [`SECRET`] under the second seed and `b"atlas.wire.node.v1"`.
    const VECTORS_SECOND_GENERATION: [(u32, u32); 6] = [
        (0x0000_0000, 0xAC60_3915),
        (0x0000_0001, 0x79C4_1919),
        (0x0000_0002, 0xB40B_B5B5),
        (0x0000_FFFF, 0x046D_66FF),
        (0x0001_0000, 0xFDC2_03AA),
        (0xFFFF_FFFF, 0x4450_FDCA),
    ];

    /// Rows on both sides of the half-width boundary and at the ends of the wire range.
    const SAMPLE_ROWS: [u32; 7] = [0, 1, 2, 0xFFFF, 0x1_0000, 0xFFFF_FFFE, 0xFFFF_FFFF];

    fn generation(seed: &[u8]) -> GenerationId {
        GenerationId::from_digest(Sha256Digest::of(seed))
    }

    fn codec(seed: &[u8]) -> RowCodec<NodeRowId> {
        RowCodec::derive(SECRET, generation(seed))
    }

    /// The node domain uses the documented label and matches the first pinned table.
    #[test]
    fn vectors_first_generation() {
        assert_eq!(<NodeRowId as EncodableId>::label(), b"atlas.wire.node.v1");
        let codec = codec(GENERATION_SEEDS[0]);
        for (row, wire) in VECTORS {
            assert_eq!(
                codec.encode(NodeRowId::from_u32(row)).get(),
                wire,
                "row {row:#010X} should encode to the pinned wire value"
            );
        }
    }

    /// The second pinned table holds and differs from the first at every recorded row.
    ///
    /// The difference is a fact about these two generations at these rows. Mappings under
    /// different generations may agree at a row by chance, and the test claims no universal
    /// inequality.
    #[test]
    fn vectors_second_generation() {
        let codec = codec(GENERATION_SEEDS[1]);
        for ((row, wire), (first_row, first_wire)) in
            VECTORS_SECOND_GENERATION.into_iter().zip(VECTORS)
        {
            assert_eq!(row, first_row, "the tables should record the same rows");
            assert_eq!(
                codec.encode(NodeRowId::from_u32(row)).get(),
                wire,
                "row {row:#010X} should encode to the pinned wire value"
            );
            assert_ne!(
                wire, first_wire,
                "row {row:#010X} should encode differently under the two generations"
            );
        }
    }

    /// Derivations from equal inputs encode every sampled row equally.
    #[test]
    fn derive_equal_inputs() {
        let left = codec(GENERATION_SEEDS[0]);
        let right = codec(GENERATION_SEEDS[0]);
        for row in SAMPLE_ROWS.map(NodeRowId::from_u32) {
            assert_eq!(left.encode(row), right.encode(row));
        }
    }

    /// Decoding inverts encoding inside the domain and answers absent at and beyond its bound.
    #[test]
    fn decode_inverts_within_domain() {
        let codec = codec(GENERATION_SEEDS[0]);
        let bound = NodeRowId::new(0x1_0001);
        let domain = RowDomain::new(bound);
        for row in [0, 1, 2, 0xFFFF, 0x1_0000].map(NodeRowId::from_u32) {
            assert_eq!(codec.decode(codec.encode(row), domain), Some(row));
        }
        for row in [
            bound,
            NodeRowId::new(0x1_0002),
            NodeRowId::from_u32(u32::MAX),
        ] {
            assert_eq!(
                codec.decode(codec.encode(row), domain),
                None,
                "row {row} should lie outside the domain"
            );
        }
    }

    /// Decoding checks both the ID type's range and the accepted domain.
    #[test]
    fn decode_narrow_id() {
        let codec = RowCodec::<SmallRowId>::derive(SECRET, generation(GENERATION_SEEDS[0]));
        let domain = RowDomain::new(SmallRowId::MAX);
        for value in 0..3 {
            let row = SmallRowId::new(value);
            assert_eq!(codec.decode(codec.encode(row), domain), Some(row));
        }
        for value in [3, 4, u32::MAX] {
            let wire = EncodedRowId::new_unchecked(codec.permute(value));
            assert_eq!(codec.decode(wire, domain), None);
        }
    }

    /// The domain of exactly `2^32` rows is encodable, and its last row inverts.
    #[test]
    fn decode_full_wire_domain() {
        let codec = codec(GENERATION_SEEDS[0]);
        let domain = RowDomain::new(NodeRowId::new(WIRE_ROW_BOUND));
        let last = NodeRowId::from_u32(u32::MAX);
        assert!(domain.contains(last));
        assert_eq!(codec.decode(codec.encode(last), domain), Some(last));
        assert_eq!(
            codec.decode(codec.encode(NodeRowId::MIN), domain),
            Some(NodeRowId::MIN)
        );
    }

    /// The first row beyond the wire bound has no wire id.
    #[test]
    #[should_panic(expected = "an encoded row must lie in [0, 2^32)")]
    fn encode_beyond_wire_bound() {
        let codec = codec(GENERATION_SEEDS[0]);
        let _wire = codec.encode(NodeRowId::new(WIRE_ROW_BOUND));
    }
}
