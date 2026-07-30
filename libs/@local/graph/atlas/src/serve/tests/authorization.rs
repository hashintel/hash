//! The authority token's envelope, checked against an independent reimplementation.
//!
//! These cases rebuild the envelope from the primitives - HKDF for the key, the header's byte
//! layout by hand, the AEAD over a hand-assembled associated-data buffer - and compare bytes with
//! what [`Authority`] produces. A test that only round-tripped `mint` through `open` would pass for
//! a module that agrees with itself about the wrong bytes.

use core::time::Duration;
use std::time::SystemTime;

use chacha20poly1305::{
    KeyInit as _, XChaCha20Poly1305, XNonce,
    aead::{Aead as _, Payload},
};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hkdf::Hkdf;
use rand::CryptoRng;
use rand_core::RngCore;
use sha2::Sha256;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use crate::{
    integrity::{SecretHexBytes, Sha256Digest},
    serve::{
        authorization::{Authority, AuthorityError},
        cache::{FilterDigest, VisibilityKey},
    },
};

/// The envelope's nonce width.
const NONCE_BYTES: usize = 24;

/// The clear header's width: one version byte, eight issue-time bytes, the nonce.
const HEADER_BYTES: usize = 1 + 8 + NONCE_BYTES;

/// The sealed plaintext's width: an actor uuid, a presence byte, a filter digest.
const PLAINTEXT_BYTES: usize = 16 + 1 + Sha256Digest::BYTES;

/// Poly1305's tag width.
const TAG_BYTES: usize = 16;

/// The expansion label.
const LABEL: &[u8] = b"atlas.authorization.v0";

/// The fixture nonce, emitted for every mint.
const NONCE: [u8; NONCE_BYTES] = [
    0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x01,
    0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
];

/// An entropy source emitting one pinned nonce.
///
/// Repeating a nonce is the one thing production must never do, which is exactly why a fixture
/// wants it: a pinned nonce makes the whole envelope hand-derivable, so the comparison below is
/// against bytes rather than against another run of the same code.
struct PinnedRng;

impl RngCore for PinnedRng {
    fn next_u32(&mut self) -> u32 {
        u32::from_le_bytes(NONCE[..4].try_into().expect("four bytes"))
    }

    fn next_u64(&mut self) -> u64 {
        u64::from_le_bytes(NONCE[..8].try_into().expect("eight bytes"))
    }

    fn fill_bytes(&mut self, destination: &mut [u8]) {
        for (slot, byte) in destination.iter_mut().zip(NONCE.iter().cycle()) {
            *slot = *byte;
        }
    }
}

impl CryptoRng for PinnedRng {}

/// The fixture secret: 32 bytes of key material, value arbitrary.
fn secret() -> SecretHexBytes<32> {
    SecretHexBytes::new([0x5A; 32])
}

/// The fixture generation.
fn generation() -> crate::file::generation::GenerationId {
    "07".repeat(32)
        .parse()
        .expect("64 hexadecimal digits name a generation")
}

/// The fixture issue time: a round wall-clock second.
fn issued_at() -> SystemTime {
    SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000)
}

/// The scope of one actor, with the filter digest `filter` when present.
fn scope(actor: u128, filter: Option<&[u8]>) -> VisibilityKey {
    VisibilityKey {
        generation: generation(),
        actor: AuthenticatedActor::Uuid(ActorEntityUuid::new(Uuid::from_u128(actor))),
        filter: filter.map(FilterDigest::of),
    }
}

/// Derives the sealing key independently: HKDF-SHA256, generation digest as salt, one label.
fn key() -> [u8; 32] {
    let mut key = [0_u8; 32];
    Hkdf::<Sha256>::new(Some(&generation().digest().to_bytes()), secret().as_bytes())
        .expand(LABEL, &mut key)
        .expect("thirty-two bytes is a valid HKDF-SHA256 output length");

    key
}

/// Assembles the clear header by hand: version, issue time in little-endian seconds, nonce.
fn header(now: SystemTime) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(HEADER_BYTES);
    bytes.push(0);
    bytes.extend_from_slice(
        &now.duration_since(SystemTime::UNIX_EPOCH)
            .expect("the fixture instant is after the epoch")
            .as_secs()
            .to_le_bytes(),
    );
    bytes.extend_from_slice(&NONCE);

    bytes
}

/// Assembles the sealed plaintext by hand: actor uuid, presence byte, filter digest.
fn plaintext(actor: u128, filter: Option<&[u8]>) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(PLAINTEXT_BYTES);
    bytes.extend_from_slice(&Uuid::from_u128(actor).into_bytes());
    match filter {
        Some(canonical) => {
            bytes.push(1);
            bytes.extend_from_slice(&FilterDigest::of(canonical).digest().to_bytes());
        }
        None => {
            bytes.push(0);
            bytes.extend_from_slice(&[0; Sha256Digest::BYTES]);
        }
    }

    bytes
}

/// A minted token is byte-identical to an independently assembled envelope.
///
/// The associated data is the clear header's own bytes, so this case pins that too: an
/// implementation that authenticated a re-encoded form of the same fields would produce a different
/// tag and fail here.
#[test]
fn a_minted_token_matches_an_independent_envelope() {
    let mut authority = Authority::new(generation(), PinnedRng);
    let minted = authority.mint(&secret(), scope(11, None), issued_at());

    let header = header(issued_at());
    let body = XChaCha20Poly1305::new(&key().into())
        .encrypt(
            XNonce::from_slice(&NONCE),
            Payload {
                msg: &plaintext(11, None),
                aad: &header,
            },
        )
        .expect("the fixture payload encrypts");

    let mut expected = header;
    expected.extend_from_slice(&body);

    assert_eq!(minted, expected, "the envelope is not the assembled bytes");
    assert_eq!(
        minted.len(),
        HEADER_BYTES + PLAINTEXT_BYTES + TAG_BYTES,
        "the envelope is a fixed 98 bytes"
    );
}

/// A token opens to the scope it was minted for, filtered or not.
#[test]
fn a_minted_token_opens_to_its_scope() {
    let mut authority = Authority::new(generation(), PinnedRng);

    for filter in [None, Some(b"{\"kind\":\"all\"}".as_slice())] {
        let scope = scope(11, filter);
        let minted = authority.mint(&secret(), scope, issued_at());

        assert_eq!(
            authority
                .open(&secret(), &minted, issued_at(), Duration::from_mins(10))
                .expect("a fresh token opens"),
            scope,
            "the opened scope differs from the minted one"
        );
    }
}

/// A rewritten issue time refuses, because the tag authenticates the clear header.
///
/// Without the header in the associated data, editing this field would buy an attacker an unbounded
/// token life: the age check reads the value it rewrites.
#[test]
fn a_rewritten_issue_time_refuses() {
    let mut authority = Authority::new(generation(), PinnedRng);
    let mut minted = authority.mint(&secret(), scope(11, None), issued_at());

    // Advance the recorded second, leaving the age check satisfied and the tag stale.
    minted[1] = minted[1].wrapping_add(1);

    assert_eq!(
        authority.open(&secret(), &minted, issued_at(), Duration::from_mins(10)),
        Err(AuthorityError::Authentication),
        "an edited header opened"
    );
}

/// A token older than the hard window refuses, and so does a future-dated one.
#[test]
fn a_token_outside_the_window_refuses() {
    let mut authority = Authority::new(generation(), PinnedRng);
    let minted = authority.mint(&secret(), scope(11, None), issued_at());
    let hard = Duration::from_mins(10);

    assert_eq!(
        authority.open(&secret(), &minted, issued_at() + hard, hard),
        Err(AuthorityError::Stale),
        "a token at the hard window opened"
    );
    assert_eq!(
        authority.open(
            &secret(),
            &minted,
            issued_at() - Duration::from_secs(1),
            hard
        ),
        Err(AuthorityError::Stale),
        "a future-dated token opened"
    );
    authority
        .open(
            &secret(),
            &minted,
            issued_at() + hard - Duration::from_secs(1),
            hard,
        )
        .expect("a token one second inside the window opens");
}

/// A token minted under another generation refuses.
///
/// The generation salts the key, so this refusal happens at the tag rather than at a field
/// comparison, and it holds for a token whose plaintext is otherwise identical.
#[test]
fn a_foreign_generation_refuses() {
    let mut minting = Authority::new(generation(), PinnedRng);
    let minted = minting.mint(&secret(), scope(11, None), issued_at());

    let foreign = Authority::new(
        "1a".repeat(32)
            .parse()
            .expect("64 hexadecimal digits name a generation"),
        PinnedRng,
    );

    assert_eq!(
        foreign.open(&secret(), &minted, issued_at(), Duration::from_mins(10)),
        Err(AuthorityError::Authentication),
        "a token from another generation opened"
    );
}

/// A blob too short for a header refuses as an envelope fault.
#[test]
fn a_truncated_blob_refuses() {
    let authority = Authority::new(generation(), PinnedRng);

    for length in [0, 1, HEADER_BYTES - 1] {
        assert_eq!(
            authority.open(
                &secret(),
                &vec![0; length],
                issued_at(),
                Duration::from_mins(10)
            ),
            Err(AuthorityError::Envelope),
            "a {length}-byte blob opened"
        );
    }
}
