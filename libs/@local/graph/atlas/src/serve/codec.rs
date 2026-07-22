//! The wire row-id boundary.
//!
//! A keyed permutation of the full `u32` range, applied where ids cross the wire.
//!
//! Internal row ids are dense and assignment-ordered, so shipping them verbatim lets a principal
//! bound hidden row counts between two visible ids (gap analysis) and estimate the universe size
//! from any received sample. Ids therefore cross the wire through [`RowCodec`], a keyed bijection
//! of the full `u32` range: the wire ids one scope receives are distributed as a uniform subset of
//! `[0, 2^32)` independent of the universe size, so order, adjacency, creation time, and the
//! universe size itself stay hidden. Wire ids are opaque and sparse - a valid id is any `u32`
//! value, and no relationship between wire values reflects a relationship between rows.
//!
//! # Model
//!
//! An eight-round balanced Feistel network permutes the `u32` range: round `i` splits the state
//! into two 16-bit halves and maps `(L, R)` to `(R, L xor F_i(R))` under the keyed round function
//! `F_i` (SipHash-2-4 truncated to 16 bits). The permutation does not depend on the universe
//! size: appending rows to a universe leaves every existing mapping fixed, so wire ids are stable
//! within a generation under row addition. Encoding applies the network to a row id; decoding
//! applies the inverse network and bounds-checks the result against the universe, so exactly the
//! `N` wire values in the image of `[0, N)` decode and every other value answers [`None`].
//!
//! # Keys
//!
//! Round keys derive from `HKDF-SHA256` over the server secret, salted by the generation identity
//! and expanded under a per-universe label, when a generation opens for serving. Equal `(secret,
//! generation, label)` give equal mappings, so responses stay byte-deterministic across restarts;
//! a different generation changes every wire id, and the label names the mapping's universe -
//! one universe crosses the wire today, the node rows. Edges carry their link entity's identity
//! instead of a wire id of their own. The fit pipeline is untouched: no artifact stores a wire
//! id.

use core::hash::Hasher as _;

use hkdf::Hkdf;
use sha2::Sha256;
use siphasher::sip::SipHasher24;

use crate::file::generation::GenerationId;

/// The Feistel round count one codec applies.
//
// Four rounds is the classical strong-PRP threshold (Luby-Rackoff);
// eight buys a second full pass of margin at sub-microsecond cost
// per id.
const ROUNDS: usize = 8;

/// The Feistel half width; the network splits the `u32` state into two 16-bit halves.
const HALF_BITS: u32 = 16;

/// The low-half mask.
const HALF_MASK: u32 = 0xFFFF;

/// The HKDF expansion label of the node-row universe.
pub(crate) const NODE_LABEL: &[u8] = b"atlas.wire.node.v1";

/// A row id as it crosses the wire.
///
/// The value relates to an internal row id only through the owning generation's [`RowCodec`];
/// [`RowCodec::encode`] is the sole constructor. Comparisons order wire values, so a tie broken on
/// [`WireRow`] is client-observable without exposing internal order.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct WireRow(u32);

impl WireRow {
    /// Returns the wire value.
    #[inline]
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0
    }
}

/// The keyed mapping between one dense row universe and its wire ids.
///
/// One codec serves one universe of one generation; [`Self::derive`] is the constructor. The
/// underlying permutation bijects the `u32` range for every key; encoding restricts it to the
/// universe `[0, N)` and decoding inverts exactly the encoded image, answering [`None`]
/// elsewhere. Both are pure: the mapping never changes while the generation serves.
#[derive(Debug)]
pub(crate) struct RowCodec {
    /// The universe size `N`; rows live in `[0, N)`, wire values in the full `u32` range.
    universe: u32,
    /// The per-round SipHash-2-4 keys.
    keys: [[u8; 16]; ROUNDS],
}

impl RowCodec {
    /// Derives the codec of one universe from the server secret.
    ///
    /// The generation identity salts the extraction and `label` separates universes under one
    /// generation; equal arguments derive equal codecs.
    pub(crate) fn derive(
        secret: &[u8],
        generation: GenerationId,
        label: &[u8],
        universe: u32,
    ) -> Self {
        let salt = generation.digest().to_bytes();
        let mut material = [0_u8; 16 * ROUNDS];
        Hkdf::<Sha256>::new(Some(&salt), secret)
            .expand(label, &mut material)
            .expect("128 octets stay within HKDF-SHA256's expansion bound");

        let mut keys = [[0_u8; 16]; ROUNDS];
        for (key, chunk) in keys.iter_mut().zip(material.as_chunks::<16>().0) {
            *key = *chunk;
        }

        Self { universe, keys }
    }

    /// Encodes an internal row id as its wire id.
    ///
    /// # Panics
    ///
    /// Panics when `row` lies outside the universe: encoding is a producer contract, and an
    /// out-of-universe row upstream is a defect, never data.
    pub(crate) fn encode(&self, row: u32) -> WireRow {
        assert!(
            row < self.universe,
            "the codec encodes rows of its own universe",
        );
        WireRow(self.permute(row))
    }

    /// Decodes a wire value back to its internal row id, [`None`] outside the encoded image.
    ///
    /// [`None`] is the single out-of-image answer; ingress resolution collapses it with every
    /// other lookup failure before a response can observe the cause.
    pub(crate) fn decode(&self, wire: u32) -> Option<u32> {
        let row = self.unpermute(wire);
        (row < self.universe).then_some(row)
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
