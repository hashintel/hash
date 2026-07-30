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
    if let Some(canonical) = filter {
        bytes.push(1);
        bytes.extend_from_slice(&FilterDigest::of(canonical).digest().to_bytes());
    } else {
        bytes.push(0);
        bytes.extend_from_slice(&[0; Sha256Digest::BYTES]);
    }

    bytes
}

/// Seals an arbitrary plaintext under the independent implementation.
///
/// The production mint cannot emit a malformed plaintext, so the format negatives need their own
/// sealer. The same path gives the refusal cases their positive complement: a hand-assembled
/// envelope the production `open` accepts.
fn seal_raw(plaintext: &[u8], now: SystemTime, nonce: &[u8; NONCE_BYTES]) -> Vec<u8> {
    let clear = header(now, nonce);
    let body = XChaCha20Poly1305::new(&key().into())
        .encrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: plaintext,
                aad: &clear,
            },
        )
        .expect("the fixture payload encrypts");

    let mut blob = clear;
    blob.extend_from_slice(&body);

    blob
}

/// A minted token is byte-identical to an independently assembled envelope, filtered or not.
///
/// The associated data is the clear header's own bytes, so this case pins that too: an
/// implementation that authenticated a re-encoded form of the same fields would produce a different
/// tag and fail here. Both presence values seal to the same 98 bytes - the digest field is zeroed
/// rather than omitted when absent, so a filter's presence never shows in the length.
#[test]
fn a_minted_token_matches_an_independent_envelope() {
    let mut authority = Authority::new(generation(), rng());

    for filter in [None, Some(b"{\"kind\":\"all\"}".as_slice())] {
        let minted = authority.mint(&secret(), scope(11, filter), issued_at());

        // The nonce is public, so the reimplementation takes it from the envelope under test and
        // derives everything else - which is why this case needs no control over the entropy
        // source.
        let nonce = &minted[NONCE_OFFSET..NONCE_OFFSET + NONCE_BYTES];
        let header = header(issued_at(), nonce);
        let body = XChaCha20Poly1305::new(&key().into())
            .encrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: &plaintext(11, filter),
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
}

/// An independent decryption recovers the sealed plaintext.
///
/// The counterpart of the mint-side byte comparison: the body is decrypted under the independently
/// derived key and compared with the hand-assembled plaintext, so the sealed bytes are pinned from
/// both sides of the AEAD.
#[test]
fn an_independent_open_recovers_the_scope() {
    let canonical = b"{\"kind\":\"all\"}".as_slice();
    let mut authority = Authority::new(generation(), rng());
    let minted = authority.mint(&secret(), scope(11, Some(canonical)), issued_at());

    let (clear, body) = minted.split_at(HEADER_BYTES);
    let recovered = XChaCha20Poly1305::new(&key().into())
        .decrypt(
            XNonce::from_slice(&clear[NONCE_OFFSET..]),
            Payload {
                msg: body,
                aad: clear,
            },
        )
        .expect("the tag authenticates under the independent key");

    assert_eq!(
        recovered,
        plaintext(11, Some(canonical)),
        "the sealed plaintext is not the assembled bytes"
    );
}

/// A hand-assembled envelope opens to the scope it names.
///
/// The refusal cases' positive complement: the independent implementation seals, the production
/// `open` accepts. With the mint-side byte comparison this closes the loop in both directions.
#[test]
fn a_hand_assembled_envelope_opens() {
    let authority = Authority::new(generation(), rng());
    let blob = seal_raw(&plaintext(11, None), issued_at(), &[9; NONCE_BYTES]);

    assert_eq!(
        authority
            .open(&secret(), &blob, issued_at(), Duration::from_mins(10))
            .expect("a hand-assembled envelope opens"),
        scope(11, None),
        "the opened scope differs from the sealed one"
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

/// A token opened under another secret refuses at the tag.
#[test]
fn a_foreign_secret_refuses() {
    let mut authority = Authority::new(generation(), rng());
    let minted = authority.mint(&secret(), scope(11, None), issued_at());

    assert_eq!(
        authority.open(
            &SecretHexBytes::new([0xA5; 32]),
            &minted,
            issued_at(),
            Duration::from_mins(10)
        ),
        Err(AuthorityError::Authentication),
        "a token opened under another secret"
    );
}

/// Tampering any authenticated byte refuses: the nonce, the ciphertext, and the tag.
///
/// The issue time has its own case; these cover the remaining regions. The nonce sits in the clear
/// header, so its edit fails through the associated data; the other two fail as ciphertext.
#[test]
fn a_tampered_byte_refuses() {
    let mut authority = Authority::new(generation(), rng());
    let minted = authority.mint(&secret(), scope(11, None), issued_at());

    for (region, index) in [
        ("nonce", NONCE_OFFSET),
        ("ciphertext", HEADER_BYTES),
        ("tag", minted.len() - 1),
    ] {
        let mut tampered = minted.clone();
        tampered[index] ^= 1;
        assert_eq!(
            authority.open(&secret(), &tampered, issued_at(), Duration::from_mins(10)),
            Err(AuthorityError::Authentication),
            "a token with a tampered {region} byte opened"
        );
    }
}

/// A foreign format version refuses as an envelope fault, before any cryptography.
///
/// The header parse validates the version discriminant, so the cause is
/// [`AuthorityError::Envelope`] rather than authentication - and it stays that under a wrong
/// secret, which is what "before the key" means observably.
#[test]
fn a_foreign_version_refuses() {
    let mut authority = Authority::new(generation(), rng());
    let mut minted = authority.mint(&secret(), scope(11, None), issued_at());
    minted[0] = 1;

    assert_eq!(
        authority.open(&secret(), &minted, issued_at(), Duration::from_mins(10)),
        Err(AuthorityError::Envelope),
        "a foreign version opened"
    );
    assert_eq!(
        authority.open(
            &SecretHexBytes::new([0xA5; 32]),
            &minted,
            issued_at(),
            Duration::from_mins(10)
        ),
        Err(AuthorityError::Envelope),
        "the version check consulted the key"
    );
}

/// A malformed plaintext refuses as an envelope fault, reachable only through the reference.
///
/// The production mint cannot emit these, so [`seal_raw`] seals them by hand: a truncated scope, an
/// extended one, and an unknown presence byte, each failing the scope parse after the tag has
/// passed. [`a_hand_assembled_envelope_opens`] is the control - the same sealing path with a
/// canonical plaintext opens, so these refuse on the plaintext's form alone.
#[test]
fn a_malformed_plaintext_refuses() {
    let authority = Authority::new(generation(), rng());
    let open = |plaintext: &[u8]| {
        authority.open(
            &secret(),
            &seal_raw(plaintext, issued_at(), &[9; NONCE_BYTES]),
            issued_at(),
            Duration::from_mins(10),
        )
    };

    let canonical = plaintext(11, None);
    let truncated = canonical[..PLAINTEXT_BYTES - 1].to_vec();
    let mut extended = canonical.clone();
    extended.push(0);
    let mut unknown_presence = canonical;
    unknown_presence[16] = 2;

    for (case, body) in [
        ("a truncated plaintext", &truncated),
        ("an extended plaintext", &extended),
        ("an unknown presence byte", &unknown_presence),
    ] {
        assert_eq!(open(body), Err(AuthorityError::Envelope), "{case} opened");
    }
}

/// Two mints draw two nonces.
///
/// Nonce reuse under one key repeats the keystream and the Poly1305 one-time key, so the property
/// worth witnessing is the opposite of determinism: the entropy source advances per mint. Both
/// tokens open.
#[test]
fn two_mints_draw_distinct_nonces() {
    let mut authority = Authority::new(generation(), rng());
    let first = authority.mint(&secret(), scope(11, None), issued_at());
    let second = authority.mint(&secret(), scope(11, None), issued_at());

    assert_ne!(
        first[NONCE_OFFSET..NONCE_OFFSET + NONCE_BYTES],
        second[NONCE_OFFSET..NONCE_OFFSET + NONCE_BYTES],
        "two mints shared a nonce"
    );
    for minted in [&first, &second] {
        authority
            .open(&secret(), minted, issued_at(), Duration::from_mins(10))
            .expect("an equal-scope token opens");
    }
}
