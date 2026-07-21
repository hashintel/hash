//! The wire row-id boundary.
//!
//! A keyed permutation of each dense row universe, applied where ids cross the wire.
//!
//! Internal row ids are dense and assignment-ordered, so shipping them verbatim lets a principal
//! bound hidden row counts between two visible ids (gap analysis). Ids therefore cross the wire
//! through [`RowCodec`], a keyed bijection of the universe `[0, N)`: the wire ids one scope
//! receives are distributed as a uniform subset of `[0, N)`, so every statistic of the received ids
//! reduces to an estimate of `N` and order, adjacency, and creation time stay hidden.
//!
//! # Model
//!
//! For a universe of `N > 1` rows let `b = ceil(log2 N)`. An eight-round Feistel network permutes
//! `[0, 2^b)`: round `i` splits the `b`-bit state into a left half of `ceil(b/2)` bits and a right
//! half of `floor(b/2)` bits - widths alternating per round, so odd `b` needs no rounding
//! correction - and maps `(L, R)` to `(R, L xor F_i(R))` under the keyed round function `F_i`
//! (SipHash-2-4 truncated to the half width). Cycle walking restricts the permutation to `[0, N)`:
//! encoding reapplies the network until the value lands below `N`, and decoding walks the inverse
//! network the same way. Because `2^b < 2N`, the expected walk length is below two applications. A
//! universe of zero or one rows takes the identity codec.
//!
//! # Keys
//!
//! Round keys derive from `HKDF-SHA256` over the server secret, salted by the generation identity
//! and expanded under a per-universe label, when a generation opens for serving. Equal `(secret,
//! generation, label, N)` give equal mappings, so responses stay byte-deterministic across
//! restarts; a different generation changes every wire id, and the label separates the node and
//! edge universes cryptographically. The fit pipeline is untouched: no artifact stores a wire id.

use core::hash::Hasher as _;

use hkdf::Hkdf;
use sha2::Sha256;
use siphasher::sip::SipHasher24;

use crate::file::generation::GenerationId;

/// The Feistel round count one codec applies.
//
// Four rounds is the classical strong-PRP threshold (Luby-Rackoff)
// and the spec's floor; eight buys a second full pass of margin at
// sub-microsecond cost per id.
const ROUNDS: usize = 8;

/// The HKDF expansion label of the node-row universe.
pub(crate) const NODE_LABEL: &[u8] = b"atlas.wire.node.v0";

/// The HKDF expansion label of the edge-row universe.
pub(crate) const EDGE_LABEL: &[u8] = b"atlas.wire.edge.v0";

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

/// The keyed bijection between one dense row universe and its wire ids.
///
/// One codec serves one universe of one generation; [`Self::derive`] is the constructor. Encoding
/// and decoding are exact inverses over `[0, N)` (bijectivity holds for every key), and both are
/// pure: the mapping never changes while the generation serves.
#[derive(Debug)]
pub(crate) struct RowCodec {
    /// The universe size `N`; rows and wire values live in `[0, N)`.
    universe: u32,
    /// The Feistel width `b = ceil(log2 N)`; zero takes the identity.
    bits: u32,
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

        let bits = match universe {
            0 | 1 => 0,
            _ => 32 - (universe - 1).leading_zeros(),
        };

        Self {
            universe,
            bits,
            keys,
        }
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
        if self.bits == 0 {
            return WireRow(row);
        }

        let mut value = self.permute(row);
        while value >= self.universe {
            value = self.permute(value);
        }

        WireRow(value)
    }

    /// Decodes a wire value back to its internal row id, [`None`] outside the universe.
    ///
    /// [`None`] is the single out-of-universe answer; ingress resolution collapses it with every
    /// other lookup failure before a response can observe the cause.
    pub(crate) fn decode(&self, wire: u32) -> Option<u32> {
        if wire >= self.universe {
            return None;
        }
        if self.bits == 0 {
            return Some(wire);
        }

        let mut value = self.unpermute(wire);
        while value >= self.universe {
            value = self.unpermute(value);
        }

        Some(value)
    }

    /// Applies the Feistel network once over `[0, 2^b)`.
    fn permute(&self, mut state: u32) -> u32 {
        for (index, key) in self.keys.iter().enumerate() {
            let left_bits = self.left_bits(index);
            let right_bits = self.bits - left_bits;
            let left = state >> right_bits;
            let right = state & mask(right_bits);
            state = (right << left_bits) | (left ^ (round(key, right) & mask(left_bits)));
        }

        state
    }

    /// Applies the inverse network once over `[0, 2^b)`.
    fn unpermute(&self, mut state: u32) -> u32 {
        for index in (0..ROUNDS).rev() {
            let left_bits = self.left_bits(index);
            let right_bits = self.bits - left_bits;
            let right = state >> left_bits;
            let left =
                (state & mask(left_bits)) ^ (round(&self.keys[index], right) & mask(left_bits));
            state = (left << right_bits) | right;
        }

        state
    }

    /// Returns round `index`'s left-half width.
    //
    // Even rounds take the ceiling half, odd rounds the floor half:
    // a round emits its right half as the next state's high part, so
    // alternation keeps each round's split aligned with the widths
    // the previous round produced.
    const fn left_bits(&self, index: usize) -> u32 {
        if index.is_multiple_of(2) {
            self.bits.div_ceil(2)
        } else {
            self.bits >> 1_u32
        }
    }
}

/// Returns the low-`bits` mask.
const fn mask(bits: u32) -> u32 {
    if bits == 0 {
        0
    } else {
        u32::MAX >> (32 - bits)
    }
}

/// Evaluates one round function.
///
/// Keyed SipHash-2-4 of the right half, truncated by the caller to the left-half width.
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
