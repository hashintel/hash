//! The wire row-id codec battery: round trips, image exactness, key separation, and the spec
//! reference.

use super::*;

#[test]
fn codec_round_trips_every_small_universe() {
    for universe in [
        1_u32, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33, 48, 100, 257, 1000,
    ] {
        let codec = codec::RowCodec::derive(b"secret", codec_generation(), b"test", universe);

        let image: Vec<u32> = (0..universe).map(|row| codec.encode(row).get()).collect();
        for (row, &wire) in (0..universe).zip(&image) {
            assert_eq!(
                codec.decode(wire),
                Some(row),
                "decode inverts encode at N={universe}",
            );
        }
        let distinct: HashSet<u32> = image.iter().copied().collect();
        assert_eq!(
            u32::try_from(distinct.len()).expect("the universe fits u32"),
            universe,
            "encoded ids stay distinct at N={universe}",
        );
        assert!(
            image.iter().any(|&wire| wire >= universe),
            "the image escapes [0, {universe}): ids no longer bound the universe",
        );
    }
}

#[test]
fn codec_round_trips_a_large_universe_sample() {
    let universe = 500_000;
    let codec = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);

    let mut seen = HashSet::new();
    for row in (0..universe).step_by(631) {
        let wire = codec.encode(row).get();
        assert!(seen.insert(wire), "sampled wire values stay distinct");
        assert_eq!(codec.decode(wire), Some(row));
    }
}

#[test]
fn codec_decodes_only_the_encoded_image() {
    let universe = 48_u32;
    let codec = codec::RowCodec::derive(b"secret", codec_generation(), b"test", universe);
    let image: HashSet<u32> = (0..universe).map(|row| codec.encode(row).get()).collect();

    // A probe sweep outside the image answers None - including the
    // low dense range the retired [0, N) codec would have occupied.
    for wire in (0..10_000).chain([1 << 31, u32::MAX - 1, u32::MAX]) {
        match codec.decode(wire) {
            Some(row) => {
                assert!(row < universe, "decoded rows lie in the universe");
                assert_eq!(
                    codec.encode(row).get(),
                    wire,
                    "a decoding wire value is its row's encoding",
                );
                assert!(image.contains(&wire), "decoding values lie in the image");
            }
            None => assert!(!image.contains(&wire), "image values decode"),
        }
    }
}

#[test]
fn codec_degenerate_universes_stay_closed() {
    let empty = codec::RowCodec::derive(b"secret", codec_generation(), b"test", 0);
    for wire in [0, 1, u32::MAX] {
        assert_eq!(
            empty.decode(wire),
            None,
            "an empty universe decodes nothing"
        );
    }

    let single = codec::RowCodec::derive(b"secret", codec_generation(), b"test", 1);
    let wire = single.encode(0);
    assert_eq!(single.decode(wire.get()), Some(0));
    assert_eq!(single.decode(wire.get().wrapping_add(1)), None);
}

#[test]
#[should_panic(expected = "the codec encodes rows of its own universe")]
fn codec_encode_rejects_out_of_universe_rows() {
    let codec = codec::RowCodec::derive(b"secret", codec_generation(), b"test", 48);
    _ = codec.encode(48);
}

#[test]
fn codec_separates_secrets_generations_and_labels() {
    let universe = 4096;
    let base = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);
    let other_secret =
        codec::RowCodec::derive(b"another", codec_generation(), codec::NODE_LABEL, universe);
    let other_generation = codec::RowCodec::derive(
        b"secret",
        "2222222222222222222222222222222222222222222222222222222222222222"
            .parse()
            .expect("the literal is 64 hex digits"),
        codec::NODE_LABEL,
        universe,
    );
    let other_label =
        codec::RowCodec::derive(b"secret", codec_generation(), b"another-label", universe);

    for (name, other) in [
        ("secret", &other_secret),
        ("generation", &other_generation),
        ("label", &other_label),
    ] {
        let differing = (0..universe)
            .filter(|&row| base.encode(row) != other.encode(row))
            .count();
        assert!(differing > 0, "a changed {name} changes the mapping");
    }
}

#[test]
fn codec_derivation_is_deterministic() {
    let universe = 4096;
    let first = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);
    let second =
        codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);

    for row in 0..universe {
        assert_eq!(first.encode(row), second.encode(row));
    }
}

/// The full-range codec written a second time.
///
/// From the documented construction and pinned parameter picks rather than from `serve::codec`.
///
/// Agreement between the two freezes the wire mapping itself - a refactor that changes any derived
/// bit fails loudly.
mod codec_reference {
    use core::hash::Hasher as _;

    use hkdf::Hkdf;
    use sha2::Sha256;
    use siphasher::sip::SipHasher24;

    use crate::file::generation::GenerationId;

    /// The pinned Feistel round count.
    const ROUNDS: usize = 8;

    /// One universe's reference codec.
    pub(super) struct Reference {
        /// The universe size `N`.
        universe: u32,
        /// The per-round SipHash-2-4 keys.
        keys: [[u8; 16]; ROUNDS],
    }

    impl Reference {
        /// Derives the reference codec of one universe.
        pub(super) fn derive(
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

        /// Encodes `row`.
        pub(super) fn encode(&self, row: u32) -> u32 {
            assert!(
                row < self.universe,
                "the reference shares the producer contract"
            );
            self.permute(row)
        }

        /// Decodes `wire`: the inverse pass, then the bounds check against the universe.
        pub(super) fn decode(&self, wire: u32) -> Option<u32> {
            let row = self.unpermute(wire);
            (row < self.universe).then_some(row)
        }

        /// Applies the network once.
        ///
        /// Round `i` maps `(L, R)` to `(R, L xor F_i(R))` over two 16-bit halves.
        fn permute(&self, mut state: u32) -> u32 {
            for key in &self.keys {
                let left = state >> 16;
                let right = state & 0xFFFF;
                state = (right << 16) | (left ^ (round(key, right) & 0xFFFF));
            }

            state
        }

        /// Applies the inverse network once.
        ///
        /// Derived from the round's own algebra: the output `(L', R')` of round `i` determines
        /// its input as `R = L'` and `L = R' xor F_i(L')`, so the inverse walks the keys in
        /// reverse, recovering each round's input from its output.
        fn unpermute(&self, mut state: u32) -> u32 {
            for key in self.keys.iter().rev() {
                let out_left = state >> 16;
                let out_right = state & 0xFFFF;
                let left = out_right ^ (round(key, out_left) & 0xFFFF);
                state = (left << 16) | out_left;
            }

            state
        }
    }

    /// Evaluates one round function.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the caller masks to the half width; the narrowing keeps the used bits"
    )]
    fn round(key: &[u8; 16], half: u32) -> u32 {
        let mut hasher = SipHasher24::new_with_key(key);
        hasher.write(&half.to_le_bytes());
        hasher.finish() as u32
    }
}

#[test]
fn codec_agrees_with_the_spec_reference() {
    for universe in [2_u32, 3, 5, 48, 100, 257, 1025, 4096] {
        let codec =
            codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);
        let model = codec_reference::Reference::derive(
            b"secret",
            codec_generation(),
            codec::NODE_LABEL,
            universe,
        );

        for row in 0..universe {
            let wire = codec.encode(row).get();
            assert_eq!(
                wire,
                model.encode(row),
                "both expressions of the codec agree at N={universe}, row {row}",
            );
            assert_eq!(
                model.decode(wire),
                Some(row),
                "the reference inverts the production encoding at N={universe}, row {row}",
            );
        }

        // Both expressions agree on the misses too: decode exactness
        // holds across implementations, not merely within one.
        for wire in (0..2_048).chain([1 << 31, u32::MAX]) {
            assert_eq!(
                codec.decode(wire),
                model.decode(wire),
                "both expressions agree on decode at N={universe}, wire {wire}",
            );
        }
    }
}

#[test]
fn codec_mappings_survive_universe_growth() {
    // The permutation is universe-independent: growing the universe
    // leaves every existing wire id fixed, so rows appended within a
    // generation never move ids already on the wire.
    let small = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, 1_000);
    let grown = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, 500_000);

    for row in 0..1_000 {
        let wire = small.encode(row);
        assert_eq!(wire, grown.encode(row), "row {row} is stable under growth");
        assert_eq!(grown.decode(wire.get()), Some(row));
    }
}

#[test]
fn codec_stays_injective_at_scale() {
    let universe = 300_000;
    let codec = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);

    let image: HashSet<u32> = (0..universe).map(|row| codec.encode(row).get()).collect();
    assert_eq!(
        u32::try_from(image.len()).expect("the universe fits u32"),
        universe,
        "encoded ids stay distinct at scale",
    );
}

#[test]
fn codec_wire_ids_estimate_the_full_range_never_the_universe() {
    let universe = 10_000_u32;
    let sample = 100_u32;
    let trials = 128_u32;

    // Two selections a mapping bias would separate: the first block
    // of assignment order, and a stride spanning the universe.
    let block: Vec<u32> = (0..sample).collect();
    let spread: Vec<u32> = (0..sample).map(|index| index * 97).collect();

    let mut block_total = 0_u64;
    let mut spread_total = 0_u64;
    for trial in 0..trials {
        let secret = trial.to_le_bytes();
        let codec =
            codec::RowCodec::derive(&secret, codec_generation(), codec::NODE_LABEL, universe);
        let widest = |rows: &[u32]| {
            rows.iter()
                .map(|&row| u64::from(codec.encode(row).get()))
                .max()
                .expect("the selection is nonempty")
        };
        block_total += widest(&block);
        spread_total += widest(&spread);
    }

    // Averaged over trials, the German-tank estimate m(1 + 1/k) - 1
    // applied to full-range ids recovers the u32 range - never N.
    // Comparisons stay in the scale of 2^32 · k · trials -
    // multiplied out, never divided. This is regression evidence
    // against gross mapping bias - a codec issuing [0, N) or
    // assignment-ordered ids fails both selections by orders of
    // magnitude. A distribution smoke at 128 keys cannot establish
    // indistinguishability from a random permutation or bound
    // leakage at corpus observation volume; the stronger property
    // stays a design target.
    //
    // The tolerance derives from the estimator's own spread. The
    // maximum of k uniform draws on [0, M) has variance
    // M^2 k / ((k+1)^2 (k+2)); the scaled per-trial statistic
    // (k+1) · max has standard deviation M · √(k / (k+2)), and
    // the sum over t independent trials spreads by √(t) of that.
    // Twelve standard deviations never flakes and still binds the
    // distribution two-sidedly - about four times tighter than the
    // loose bound it replaces, and five orders of magnitude away
    // from what the retired [0, N) codec would have produced.
    let scaled = |total: u64| total * u64::from(sample + 1);
    let target = (1_u64 << 32) * u64::from(sample) * u64::from(trials);
    let deviation =
        2.0_f64.powi(32) * (f64::from(trials) * f64::from(sample) / f64::from(sample + 2)).sqrt();
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the tolerance is a positive count far below u64::MAX"
    )]
    let tolerance = (12.0 * deviation) as u64;
    for (name, total) in [("block", block_total), ("spread", spread_total)] {
        assert!(
            scaled(total).abs_diff(target) < tolerance,
            "the {name} selection estimates the full range: {total} total",
        );
    }
    // The difference of the two sums doubles the variance; its
    // tolerance widens by √(2).
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the tolerance is a positive count far below u64::MAX"
    )]
    let difference_tolerance = (12.0 * core::f64::consts::SQRT_2 * deviation) as u64;
    assert!(
        scaled(block_total.abs_diff(spread_total)) < difference_tolerance,
        "the selections' range estimates agree: {block_total} vs {spread_total}",
    );
}
