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
use rand::{SeedableRng as _, rngs::ChaCha20Rng};
use sha2::Sha256;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;
use zerocopy::IntoBytes as _;

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

/// The offset of the nonce inside the clear header: past the version byte and the issue time.
///
/// The battery reads the layout by documented offset rather than through the module's own zerocopy
/// types, which is what keeps it an independent check on the byte order.
const NONCE_OFFSET: usize = 1 + 8;

/// A deterministic CSPRNG for the fixtures.
///
/// Seeded rather than drawn from the operating system: these cases never depend on the nonce's
/// value, so a fixed stream keeps a failure reproducible.
fn rng() -> ChaCha20Rng {
    ChaCha20Rng::from_seed([7; 32])
}

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
fn header(now: SystemTime, nonce: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(HEADER_BYTES);
    bytes.push(0);
    bytes.extend_from_slice(
        &now.duration_since(SystemTime::UNIX_EPOCH)
            .expect("the fixture instant is after the epoch")
            .as_secs()
            .to_le_bytes(),
    );
    bytes.extend_from_slice(nonce);

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
    let mut authority = Authority::new(generation(), rng());
    let minted = authority.mint(&secret(), scope(11, None), issued_at());

    // The nonce is public, so the reimplementation takes it from the envelope under test and
    // derives everything else - which is why this case needs no control over the entropy
    // source.
    let nonce = &minted[NONCE_OFFSET..NONCE_OFFSET + NONCE_BYTES];
    let header = header(issued_at(), nonce);
    let body = XChaCha20Poly1305::new(&key().into())
        .encrypt(
            XNonce::from_slice(nonce),
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
    let mut authority = Authority::new(generation(), rng());

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

/// A rewritten issue time refuses as an authentication fault.
///
/// The clear header is in the associated data, so editing the field the age check reads invalidates
/// the tag. The tag is judged first, which is why the cause is authentication rather than staleness
/// whichever direction the edit moves the clock.
#[test]
fn a_rewritten_issue_time_refuses() {
    let mut authority = Authority::new(generation(), rng());
    let mut minted = authority.mint(&secret(), scope(11, None), issued_at());

    // Move the recorded second, which the tag covers.
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
    let mut authority = Authority::new(generation(), rng());
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
    let mut minting = Authority::new(generation(), rng());
    let minted = minting.mint(&secret(), scope(11, None), issued_at());

    let foreign = Authority::new(
        "1a".repeat(32)
            .parse()
            .expect("64 hexadecimal digits name a generation"),
        rng(),
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
    let authority = Authority::new(generation(), rng());

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
