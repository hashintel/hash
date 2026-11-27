//! Compile-time 4-way SWAR static lookup table for predefined [`sym::SYMBOLS`].
//!
//! The hashing algorithm in use is ported from foldhash, and is designed to be
//! architecture- and endianness-independent.

use alloc::vec::Vec;
use core::num::NonZero;

use super::{repr::ConstantRepr, sym};

const SEED_STRIDE: u64 = 0x9E37_79B9_7F4A_7C15;
// Hexadecimal digits of pi from foldhash (`ARBITRARY6`, `ARBITRARY7`, and `ARBITRARY0`).
const STATIC_MIX: u64 = 0xC0AC_29B7_C97C_50DD;
const STATIC_MIX_ALT: u64 = 0x3F84_D5B5_B547_0917;
const SCRAMBLE_MIX: u64 = 0x243F_6A88_85A3_08D3;
const MAX_PACK_ATTEMPTS: u64 = 8192;

// see: https://github.com/orlp/foldhash/blob/77d8e3dae0d43abe65753e888b9e74efbe4ee3f7/src/lib.rs#L143
// for the sake of simplicity we are not creating an architecture independent optimized
// implementation.
#[expect(
    clippy::cast_possible_truncation,
    reason = "folded multiply intentionally separates the low and high 64-bit halves"
)]
#[inline]
const fn folded_multiply(lhs: u64, rhs: u64) -> u64 {
    let product = (lhs as u128).wrapping_mul(rhs as u128);
    (product as u64) ^ ((product >> 64) as u64)
}

#[expect(
    clippy::little_endian_bytes,
    reason = "static hash fixes little-endian word order for cross-target parity"
)]
#[inline]
const fn read_u64_le(bytes: &[u8], offset: usize) -> u64 {
    let Some(&bytes) = bytes[offset..offset + 8].as_array() else {
        unreachable!()
    };

    u64::from_le_bytes(bytes)
}

#[expect(
    clippy::little_endian_bytes,
    reason = "static hash fixes little-endian word order for cross-target parity"
)]
#[inline]
const fn read_u32_le(bytes: &[u8], offset: usize) -> u32 {
    let Some(&bytes) = bytes[offset..offset + 4].as_array() else {
        unreachable!()
    };

    u32::from_le_bytes(bytes)
}

// see: [`foldhash`](https://github.com/orlp/foldhash/blob/77d8e3dae0d43abe65753e888b9e74efbe4ee3f7/src/lib.rs#L279)
#[cold]
#[inline(never)]
const fn hash_bytes_long(bytes: &[u8], mut lane0: u64, second: u64) -> u64 {
    let mut lane1 = lane0.wrapping_add(second);
    let mut remaining = bytes;

    while remaining.len() > 48 {
        lane0 = folded_multiply(
            read_u64_le(remaining, 0) ^ lane0,
            read_u64_le(remaining, 16) ^ STATIC_MIX,
        );
        lane1 = folded_multiply(
            read_u64_le(remaining, 8) ^ lane1,
            read_u64_le(remaining, 24) ^ STATIC_MIX_ALT,
        );
        remaining = remaining.split_at(32).1;
    }

    let rem_len = remaining.len();
    if rem_len < 16 {
        return lane0 ^ lane1;
    }

    lane0 = folded_multiply(
        read_u64_le(remaining, 0) ^ lane0,
        read_u64_le(remaining, rem_len - 16) ^ STATIC_MIX,
    );
    lane1 = folded_multiply(
        read_u64_le(remaining, 8) ^ lane1,
        read_u64_le(remaining, rem_len - 8) ^ STATIC_MIX_ALT,
    );

    if rem_len > 32 {
        lane0 = folded_multiply(
            read_u64_le(remaining, 16) ^ lane0,
            read_u64_le(remaining, rem_len - 32) ^ STATIC_MIX,
        );
        lane1 = folded_multiply(
            read_u64_le(remaining, 24) ^ lane1,
            read_u64_le(remaining, rem_len - 24) ^ STATIC_MIX_ALT,
        );
    }

    lane0 ^ lane1
}

/// Computes an architecture- and endianness-independent hash for predefined symbol lookup.
// see: [`foldhash`](https://github.com/orlp/foldhash/blob/77d8e3dae0d43abe65753e888b9e74efbe4ee3f7/src/lib.rs#L240)
#[expect(
    clippy::cast_possible_truncation,
    reason = "rotate_right reduces the shift count modulo 64"
)]
#[inline]
const fn hash_bytes_with_seed(bytes: &[u8], seed: u64) -> u64 {
    let len = bytes.len();
    let mut first = seed.rotate_right(len as u32);
    let mut second = STATIC_MIX_ALT ^ (len as u64);

    match len {
        0 => folded_multiply(first, second),
        1..=3 => {
            first ^= bytes[0] as u64;
            second ^= ((bytes[len - 1] as u64) << 8) | (bytes[len >> 1] as u64);
            folded_multiply(first, second)
        }
        4..=7 => {
            first ^= read_u32_le(bytes, 0) as u64;
            second ^= read_u32_le(bytes, len - 4) as u64;
            folded_multiply(first, second)
        }
        8..=16 => {
            first ^= read_u64_le(bytes, 0);
            second ^= read_u64_le(bytes, len - 8);
            folded_multiply(first, second)
        }
        _ => hash_bytes_long(bytes, first, second),
    }
}

struct StaticTable {
    seed: u64,
    bucket_mask: usize,
    tags: &'static [u64],
    indices: &'static [[u16; 4]],
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "bucket index, 16-bit tag, and verified u16 symbol index intentionally truncate"
)]
const fn try_pack_table(
    symbols: &[&str],
    seed: u64,
    counts: &mut [u8],
    tags: &mut [u64],
    indices: &mut [[u16; 4]],
) -> bool {
    let num_buckets = tags.len();
    let bucket_mask = num_buckets - 1;

    let mut clear_index = 0;
    while clear_index < num_buckets {
        counts[clear_index] = 0;
        tags[clear_index] = 0;
        indices[clear_index] = [0; 4];
        clear_index += 1;
    }

    let mut symbol_index = 0;
    while symbol_index < symbols.len() {
        let hash = hash_bytes_with_seed(symbols[symbol_index].as_bytes(), seed);
        let bucket = (hash as usize) & bucket_mask;
        let lane = counts[bucket] as usize;
        if lane >= 4 {
            return false;
        }

        let tag16 = ((hash >> 48) as u16) | 1;
        let existing_tags = tags[bucket];

        let mut previous = 0;
        while previous < lane {
            if ((existing_tags >> (previous * 16)) as u16) == tag16 {
                return false;
            }
            previous += 1;
        }

        tags[bucket] = existing_tags | ((tag16 as u64) << (lane * 16));
        indices[bucket][lane] = symbol_index as u16;
        counts[bucket] = (lane + 1) as u8;
        symbol_index += 1;
    }

    true
}

const fn build_static_table(symbols: &[&str]) -> StaticTable {
    assert!(
        symbols.len() <= u16::MAX as usize,
        "define_symbols! supports at most 65535 constant symbols"
    );

    let mut num_buckets = (symbols.len() >> 1).max(16).next_power_of_two();
    let mut counts = Vec::new();
    let mut tags = Vec::new();
    let mut indices = Vec::new();

    loop {
        while counts.len() < num_buckets {
            counts.push(0_u8);
            tags.push(0_u64);
            indices.push([0_u16; 4]);
        }

        let mut attempt = 0_u64;
        while attempt < MAX_PACK_ATTEMPTS {
            let seed = attempt.wrapping_add(1).wrapping_mul(SEED_STRIDE);
            if try_pack_table(symbols, seed, &mut counts, &mut tags, &mut indices) {
                drop(counts);

                return StaticTable {
                    seed,
                    bucket_mask: num_buckets - 1,
                    tags: tags.const_make_global(),
                    indices: indices.const_make_global(),
                };
            }

            attempt += 1;
        }

        num_buckets = num_buckets
            .checked_mul(2)
            .expect("static symbol table bucket count overflow");
    }
}

const STATIC_TABLE: StaticTable = build_static_table(&sym::SYMBOLS);

/// Computes the static table hash for `bytes` using the compile-time packed seed.
#[inline]
pub(super) const fn hash_bytes(bytes: &[u8]) -> u64 {
    hash_bytes_with_seed(bytes, STATIC_TABLE.seed)
}

/// Mixes `static_hash` with a per-table `runtime_seed` for runtime table probing.
///
/// Reuses the single pass over the string bytes while avalanching all 64 bits and randomizing
/// runtime bucket and tag placement per table.
#[inline]
pub(super) const fn scramble_runtime_hash(static_hash: u64, runtime_seed: u64) -> u64 {
    folded_multiply(static_hash ^ runtime_seed, SCRAMBLE_MIX)
}

/// Finds the lowest 16-bit lane in `tags` equal to `tag`.
#[inline]
const fn match_swar_lane(tags: u64, tag: NonZero<u16>) -> Option<usize> {
    let needle = NonZero::<u64>::from(tag)
        .get()
        .wrapping_mul(0x0001_0001_0001_0001);
    let diff = tags ^ needle;

    // Subtracting 1 from each 16-bit lane sets bit 15 of a lane iff that lane is zero (yielding
    // 0xFFFF, whose bit 15 survives `& !diff`). A zero lane borrows into the next lane, which can
    // also set bit 15 there, while non-zero lanes below it produce no borrow. Therefore the lowest
    // set bit in `matches` always names the lowest zero lane. Because `build_static_table`
    // guarantees all tags in a bucket are distinct and non-zero, at most one lane matches.
    let matches = diff.wrapping_sub(0x0001_0001_0001_0001) & !diff & 0x8000_8000_8000_8000;
    if matches == 0 {
        return None;
    }

    Some(((matches.trailing_zeros() >> 4) & 3) as usize)
}

/// Probes the compile-time 4-way SWAR static symbol table for `value` using `hash`.
///
/// `hash` must come from [`hash_bytes`] on `value.as_bytes()`. On a tag miss, lookup returns
/// [`None`] after one `u64` bucket-tag load without reading [`sym::SYMBOLS`]. Because bucket tags
/// are distinct, a tag hit inspects one candidate in [`sym::SYMBOLS`] and verifies exact byte
/// equality.
#[inline]
pub(super) fn lookup_hashed(hash: u64, value: &str) -> Option<ConstantRepr> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "bucket index intentionally truncates hash bits"
    )]
    let bucket = (hash as usize) & STATIC_TABLE.bucket_mask;
    let tags = STATIC_TABLE.tags[bucket];
    let tag = NonZero::new(((hash >> 48) as u16) | 1).unwrap_or_else(|| unreachable!());

    let lane = match_swar_lane(tags, tag)?;

    let symbol_index = usize::from(STATIC_TABLE.indices[bucket][lane]);
    let candidate = sym::SYMBOLS[symbol_index];

    memchr::arch::all::is_equal(candidate.as_bytes(), value.as_bytes())
        .then_some(ConstantRepr::new_unchecked(symbol_index))
}

#[cfg(test)]
mod tests {
    use core::num::NonZero;

    use super::{
        StaticTable, build_static_table, hash_bytes, hash_bytes_with_seed, lookup_hashed,
        match_swar_lane,
    };

    #[test]
    fn swar_lane_borrow_cases() {
        let raw_tag: u16 = 0x1235;
        let tag = NonZero::new(raw_tag).expect("non-zero tag");
        // Lane 0 matches while lane 1 equals `raw_tag ^ 1`. Borrow from lane 0 sets lane 1's diff
        // to 0xFFFF as well, and the lowest matching lane must still be lane 0.
        let borrow_trap = u64::from(raw_tag) | (u64::from(raw_tag ^ 1) << 16);
        assert_eq!(match_swar_lane(borrow_trap, tag), Some(0));

        // Non-zero lanes below a match must not trigger false matches.
        let lane1_match = u64::from(raw_tag ^ 1) | (u64::from(raw_tag) << 16);
        assert_eq!(match_swar_lane(lane1_match, tag), Some(1));

        let lane3_match = u64::from(raw_tag ^ 0x8000)
            | (u64::from(raw_tag ^ 0xFFFF) << 16)
            | (u64::from(raw_tag ^ 0x0001) << 32)
            | (u64::from(raw_tag) << 48);
        assert_eq!(match_swar_lane(lane3_match, tag), Some(3));

        // Empty lanes (`0x0000`) never match non-zero tags.
        assert_eq!(match_swar_lane(0, tag), None);
        assert_eq!(match_swar_lane(u64::from(raw_tag ^ 1), tag), None);
    }

    #[test]
    fn static_hash_long_sensitivity() {
        const SEED: u64 = 0x9E37_79B9_7F4A_7C15;

        // Every byte position across every long-path length regime (17..=32, 33..=48, >48) must
        // affect the output hash.
        for len in [17_usize, 32, 33, 48, 49, 80, 81] {
            let mut buffer = vec![b'a'; len];
            let baseline = hash_bytes_with_seed(&buffer, SEED);
            for offset in 0..len {
                buffer[offset] ^= 1;
                let mutated = hash_bytes_with_seed(&buffer, SEED);
                buffer[offset] ^= 1;
                assert_ne!(
                    mutated, baseline,
                    "byte {offset} of {len}-byte input had no effect on hash"
                );
            }
        }
    }

    #[test]
    fn lookup_non_constant_misses() {
        for sample in ["", "not_a_predefined_symbol", &"a".repeat(128)] {
            assert_eq!(lookup_hashed(hash_bytes(sample.as_bytes()), sample), None);
        }
    }

    #[test]
    fn static_table_build_edge_cases() {
        const EMPTY: StaticTable = build_static_table(&[]);
        const SHARED_AFFIXES: [&str; 3] = [
            "::graph::types::knowledge::entity::aaa::Metadata",
            "::graph::types::knowledge::entity::bbb::Metadata",
            "::graph::types::knowledge::entity::ccc::Metadata",
        ];
        const TABLE: StaticTable = build_static_table(&SHARED_AFFIXES);

        assert_eq!(EMPTY.tags.len(), 16);
        assert_eq!(EMPTY.bucket_mask, 15);
        assert_eq!(TABLE.tags.len(), 16);
        for (expected_index, text) in SHARED_AFFIXES.iter().enumerate() {
            let hash = hash_bytes_with_seed(text.as_bytes(), TABLE.seed);
            let bucket = usize::try_from(hash & 15).expect("masked to 4 bits");
            let tag = NonZero::new(((hash >> 48) as u16) | 1).expect("non-zero tag");
            let lane = match_swar_lane(TABLE.tags[bucket], tag).expect("symbol should be present");
            assert_eq!(usize::from(TABLE.indices[bucket][lane]), expected_index);
        }
    }
}
