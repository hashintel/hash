//! Draw-rule identity and salt expectations.
//!
//! The formula oracles concatenate the domain tag, fixed-width components and variable-length tail
//! before hashing with [`Sha256Digest::of`]. This compares the incremental derivation with an
//! independently assembled byte sequence.

use core::str;

use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};

use super::RuleIdentity;
use crate::{
    dataset::TemporalAxes,
    integrity::Sha256Digest,
    salt::{
        embedding::EmbedderFingerprint,
        ladder::paired::fixtures::{digest, node, reproducibility, rule, salt, snapshot},
    },
};

/// Serializes the fixture inputs' preimage bytes.
///
/// # Panics
///
/// Panics if the fixture projection does not serialize.
fn preimage() -> Vec<u8> {
    let mut preimage = Vec::new();
    rule()
        .write_preimage(&snapshot(), &reproducibility(), &mut preimage)
        .expect("the fixture projection should serialize");
    preimage
}

#[test]
fn initial_identity_is_recognized_and_unknown_identities_are_refused() {
    assert_eq!(rule().identity(), RuleIdentity::INITIAL);

    let unknown: RuleIdentity =
        serde_json::from_str("7").expect("an unknown identity should still deserialize");
    assert!(unknown.recognize().is_none());
}

#[test]
fn identity_wire_form_is_a_lossless_bare_integer() {
    let encoded = serde_json::to_string(&RuleIdentity::INITIAL)
        .expect("an identity should serialize to a bare integer");
    assert_eq!(encoded, "1");

    let unknown: RuleIdentity =
        serde_json::from_str("7").expect("an unknown identity should still deserialize");
    let round_tripped =
        serde_json::to_string(&unknown).expect("an unknown identity should serialize back");
    assert_eq!(round_tripped, "7");
}

#[test]
fn preimage_is_the_ordered_two_field_projection() {
    let preimage = preimage();
    let text = str::from_utf8(&preimage).expect("the preimage is JSON and therefore UTF-8");

    assert!(
        text.starts_with("{\n  \"snapshot\":"),
        "the first top-level field must be the snapshot",
    );
    assert!(
        text.contains("\n  \"reproducibility\":"),
        "the second top-level field must be the reproducibility echo",
    );

    let top_level_fields: Vec<&str> = text
        .lines()
        .filter(|line| {
            line.strip_prefix("  ")
                .is_some_and(|rest| rest.starts_with('"'))
        })
        .collect();
    assert_eq!(
        top_level_fields.len(),
        2,
        "the projection has exactly two top-level fields, got {top_level_fields:?}",
    );
}

#[test]
fn preimage_round_trips_through_the_document_serde_paths() {
    /// The `snapshot` and `reproducibility` metadata documents a preimage decodes to.
    #[derive(serde::Deserialize)]
    struct Projection {
        snapshot: crate::file::salt::metadata::Snapshot,
        reproducibility: crate::file::salt::metadata::Reproducibility,
    }

    let decoded: Projection = serde_json::from_slice(&preimage())
        .expect("the projection should decode through the document types");

    assert_eq!(decoded.snapshot, snapshot());
    assert_eq!(decoded.reproducibility, reproducibility());
}

#[test]
fn equal_inputs_share_a_salt_and_any_changed_input_rotates_it() {
    let base = rule()
        .derive_salt(&snapshot(), &reproducibility())
        .expect("the fixture should derive a salt");
    let repeat = rule()
        .derive_salt(&snapshot(), &reproducibility())
        .expect("the fixture should derive a salt");
    assert_eq!(base, repeat, "byte-identical inputs share one draw");

    let mut reseeded = reproducibility();
    reseeded.config.seed ^= 1;

    let mut re_embedded = reproducibility();
    re_embedded.embedder = EmbedderFingerprint::new(digest("another contract"));

    let mut chained = reproducibility();
    chained.prior = Some(
        digest("prior generation")
            .to_string()
            .parse()
            .expect("a digest's text form is a generation id"),
    );

    let mut grown = snapshot();
    grown.nodes += 1;

    let mut observed = snapshot();
    observed.axes = Some(TemporalAxes {
        transaction_time: "2026-08-06T00:00:00Z"
            .parse::<Timestamp<TransactionTime>>()
            .expect("the fixture transaction time should parse"),
        decision_time: "2026-08-06T00:00:00Z"
            .parse::<Timestamp<DecisionTime>>()
            .expect("the fixture decision time should parse"),
    });

    let variants = [
        rule().derive_salt(&snapshot(), &reseeded),
        rule().derive_salt(&snapshot(), &re_embedded),
        rule().derive_salt(&snapshot(), &chained),
        rule().derive_salt(&grown, &reproducibility()),
        rule().derive_salt(&observed, &reproducibility()),
    ]
    .map(|salt| salt.expect("every variant should derive a salt"));

    for (index, variant) in variants.iter().enumerate() {
        assert_ne!(
            *variant, base,
            "changed-input variant {index} should rotate the salt",
        );
        for other in &variants[index + 1..] {
            assert_ne!(variant, other, "distinct variants should not share a salt");
        }
    }
}

#[test]
fn the_salt_is_the_tagged_digest_of_the_preimage() {
    let preimage = preimage();
    let salt = salt();

    let expected =
        Sha256Digest::of([b"atlas.paired-movement.salt.1\n".as_slice(), &preimage].concat());
    assert_eq!(salt.0, expected);
}

#[test]
fn the_order_key_is_the_tagged_digest_of_salt_then_subject() {
    let salt = salt();
    let key = rule().order_key(salt, b"subject one");

    let expected = Sha256Digest::of(
        [
            b"atlas.paired-movement.order.1\n".as_slice(),
            &salt.0.to_bytes(),
            b"subject one",
        ]
        .concat(),
    );
    assert_eq!(key.0, expected);
}

/// Compares equal inputs and distinct fixed subject/salt combinations.
///
/// The unequal fixtures check these encodings, not a general absence of SHA-256 collisions.
#[test]
fn order_keys_separate_subjects_and_salts() {
    let salt = salt();

    let mut grown = snapshot();
    grown.nodes += 1;
    let rotated = rule()
        .derive_salt(&grown, &reproducibility())
        .expect("the grown snapshot should derive a salt");

    assert_eq!(
        rule().order_key(salt, b"pair"),
        rule().order_key(salt, b"pair"),
        "one salt and one subject re-derive one key",
    );
    assert_ne!(
        rule().order_key(salt, b"pair"),
        rule().order_key(salt, b"riap"),
        "distinct subjects draw distinct keys",
    );
    assert_ne!(
        rule().order_key(salt, b"pair"),
        rule().order_key(rotated, b"pair"),
        "a rotated salt rotates every key",
    );
}

#[test]
#[expect(
    clippy::little_endian_bytes,
    reason = "the oracle restates identity 1's little-endian subject encodings independently of \
              the production encoders"
)]
fn pair_and_row_subjects_are_the_persisted_little_endian_forms() {
    let salt = salt();

    let expected_pair = Sha256Digest::of(
        [
            b"atlas.paired-movement.order.1\n".as_slice(),
            &salt.0.to_bytes(),
            &7_u64.to_le_bytes(),
            &9_u64.to_le_bytes(),
        ]
        .concat(),
    );
    assert_eq!(
        rule().pair_order_key(salt, node(7), node(9)).0,
        expected_pair,
        "the pair subject is source then target, each little endian",
    );

    let expected_row = Sha256Digest::of(
        [
            b"atlas.paired-movement.order.1\n".as_slice(),
            &salt.0.to_bytes(),
            &7_u64.to_le_bytes(),
        ]
        .concat(),
    );
    assert_eq!(
        rule().row_order_key(salt, node(7)).0,
        expected_row,
        "the row subject is the row alone, little endian",
    );

    assert_ne!(
        rule().pair_order_key(salt, node(7), node(9)),
        rule().pair_order_key(salt, node(9), node(7)),
        "orientation is part of the pair subject",
    );
}
