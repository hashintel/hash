use core::str::FromStr as _;
use std::io::Cursor;

use crate::salt::hash::{ContentHash, ContentHashParseError, ContentHasher, hash_reader};

const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

#[test]
fn matches_the_sha256_known_vector() {
    let digest = ContentHash::digest(b"abc");

    assert_eq!(digest.to_string(), ABC_SHA256);
    assert_eq!(hash_reader(Cursor::new(b"abc")).ok(), Some(digest));
}

#[test]
fn hexadecimal_form_round_trips_through_json() {
    let digest = ContentHash::digest(b"atlas");
    let encoded = serde_json::to_string(&digest).expect("should serialize a content hash");
    let decoded: ContentHash =
        serde_json::from_str(&encoded).expect("should deserialize canonical hexadecimal");

    assert_eq!(decoded, digest);
}

#[test]
fn parser_rejects_noncanonical_hexadecimal() {
    let uppercase = ABC_SHA256.to_ascii_uppercase();

    assert!(matches!(
        ContentHash::from_str("00"),
        Err(ContentHashParseError::Length { actual: 2 })
    ));
    assert!(matches!(
        ContentHash::from_str(&uppercase),
        Err(ContentHashParseError::Character {
            index: 0,
            byte: b'B'
        })
    ));
}

#[test]
fn composite_hash_framing_preserves_component_boundaries() {
    let mut left = ContentHasher::new(b"salt-test-v1");
    left.update(b"ab");
    left.update(b"c");

    let mut right = ContentHasher::new(b"salt-test-v1");
    right.update(b"a");
    right.update(b"bc");

    assert_ne!(left.finish(), right.finish());
}

#[test]
fn domains_separate_identical_components() {
    let mut left = ContentHasher::new(b"salt-left-v1");
    left.update(b"payload");

    let mut right = ContentHasher::new(b"salt-right-v1");
    right.update(b"payload");

    assert_ne!(left.finish(), right.finish());
}
