//! The authority token's envelope, checked against an independent reimplementation.
//!
//! These cases rebuild the envelope from the primitives - HKDF for the key, the header's byte
//! layout by hand, the AEAD over a hand-assembled associated-data buffer - and compare bytes with
//! what [`TokenAuthority`] produces, in both directions. Every width below is a hand-summed literal
//! rather than a `size_of` over the production layout types, which is what keeps the battery an
//! independent check on the byte order. Each case asserts agreement rather than inheriting it.
#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]

use core::time::Duration;
use std::time::SystemTime;

use chacha20poly1305::{
    KeyInit as _, XChaCha20Poly1305, XNonce,
    aead::{Aead as _, Payload},
};
use hkdf::Hkdf;
use rand::{SeedableRng as _, rngs::ChaCha20Rng};
use sha2::Sha256;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;
use zerocopy::IntoBytes as _;

use crate::{
    integrity::SecretHexBytes,
    serve::{
        authorization::{AuthorityError, Scope, TokenAuthority},
        cache::FilterDigest,
        density::CutOffset,
    },
};

/// The format version's width.
const VERSION_BYTES: usize = 1;

/// The issue time's width.
///
/// The issue time is whole seconds as a little-endian unsigned 64-bit integer.
const ISSUED_AT_BYTES: usize = 8;

/// The nonce width: `XChaCha20`'s 192-bit extended nonce.
const NONCE_BYTES: usize = 24;

/// The clear header's width.
const HEADER_BYTES: usize = VERSION_BYTES + ISSUED_AT_BYTES + NONCE_BYTES;

/// An actor uuid's width.
const ACTOR_BYTES: usize = 16;

/// The filter presence byte's width.
const PRESENCE_BYTES: usize = 1;

/// A SHA-256 digest's width.
const DIGEST_BYTES: usize = 32;

/// The delivery-cut offset's width.
const OFFSET_BYTES: usize = 1;

/// The sealed plaintext's width.
///
/// The sealed plaintext is an actor uuid, a presence byte, a filter digest, and the offset byte.
const PLAINTEXT_BYTES: usize = ACTOR_BYTES + PRESENCE_BYTES + DIGEST_BYTES + OFFSET_BYTES;

/// Poly1305's tag width.
const TAG_BYTES: usize = 16;

/// The whole envelope's width.
///
/// Where a hand-assembled envelope meets a production signature, the compiler unifies this sum with
/// the production width, so a layout drift fails the build before it fails a case.
const ENVELOPE_BYTES: usize = HEADER_BYTES + PLAINTEXT_BYTES + TAG_BYTES;

/// The offset of the nonce inside the clear header: past the version byte and the issue time.
const NONCE_OFFSET: usize = VERSION_BYTES + ISSUED_AT_BYTES;

/// The expansion label.
const LABEL: &[u8] = b"atlas.authorization.v0";

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

/// The fixture issue time, a round wall-clock second.
fn issued_at() -> SystemTime {
    SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000)
}

/// The view of one actor, resolved at offset `k`, over the filter digest of `filter` when present.
fn scope(actor: u128, k: u8, filter: Option<&[u8]>) -> Scope {
    Scope::new(
        ActorEntityUuid::new(Uuid::from_u128(actor)),
        filter.map(FilterDigest::of),
        CutOffset::new(k),
    )
}

/// The actor identity `actor` names, as a token's presenter.
fn presenter(actor: u128) -> ActorEntityUuid {
    ActorEntityUuid::new(Uuid::from_u128(actor))
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
fn header(now: SystemTime, nonce: &[u8]) -> [u8; HEADER_BYTES] {
    let mut bytes = [0_u8; HEADER_BYTES];
    bytes[0] = 0;
    bytes[VERSION_BYTES..NONCE_OFFSET].copy_from_slice(
        &now.duration_since(SystemTime::UNIX_EPOCH)
            .expect("the fixture instant is after the epoch")
            .as_secs()
            .to_le_bytes(),
    );
    bytes[NONCE_OFFSET..].copy_from_slice(nonce);

    bytes
}

/// Assembles the sealed plaintext by hand.
///
/// The bytes run actor uuid, presence byte, filter digest, and offset byte, in that order.
fn plaintext(actor: u128, k: u8, filter: Option<&[u8]>) -> [u8; PLAINTEXT_BYTES] {
    let mut bytes = [0_u8; PLAINTEXT_BYTES];
    bytes[..ACTOR_BYTES].copy_from_slice(&Uuid::from_u128(actor).into_bytes());
    if let Some(canonical) = filter {
        bytes[ACTOR_BYTES] = 1;
        bytes[ACTOR_BYTES + PRESENCE_BYTES..PLAINTEXT_BYTES - OFFSET_BYTES]
            .copy_from_slice(&FilterDigest::of(canonical).as_bytes());
    }
    bytes[PLAINTEXT_BYTES - OFFSET_BYTES] = k;

    bytes
}

/// Seals a plaintext under the independent implementation.
///
/// The production `open` must accept the resulting envelope, which makes this the counterpart of
/// the byte-compared mint.
fn seal_raw(
    plaintext: &[u8; PLAINTEXT_BYTES],
    now: SystemTime,
    nonce: &[u8; NONCE_BYTES],
) -> [u8; ENVELOPE_BYTES] {
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

    let mut blob = [0_u8; ENVELOPE_BYTES];
    blob[..HEADER_BYTES].copy_from_slice(&clear);
    blob[HEADER_BYTES..].copy_from_slice(&body);

    blob
}

/// A minted token is byte-identical to an independently assembled envelope, filtered or not.
///
/// The associated data is the clear header's own bytes, so this case pins that too. An
/// implementation that authenticated a re-encoded form of the same fields would produce a different
/// tag and fail here. The envelope is the same fixed 99 bytes at either offset and with or without
/// a filter. An absent filter leaves the digest field zero rather than dropping it, so a filter's
/// presence never shows in the length.
#[test]
fn a_minted_token_matches_an_independent_envelope() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());

    for (k, filter) in [(0, None), (5, Some(b"{\"kind\":\"all\"}".as_slice()))] {
        let minted = authority
            .mint(scope(11, k, filter), issued_at())
            .expect("the seeded generator is infallible");

        // The nonce is public, so the reimplementation takes it from the envelope under test and
        // derives everything else - which is why this case needs no control over the entropy
        // source.
        let nonce = &minted[NONCE_OFFSET..NONCE_OFFSET + NONCE_BYTES];
        let clear = header(issued_at(), nonce);
        let body = XChaCha20Poly1305::new(&key().into())
            .encrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: &plaintext(11, k, filter),
                    aad: &clear,
                },
            )
            .expect("the fixture payload encrypts");

        let mut expected = clear.to_vec();
        expected.extend_from_slice(&body);

        assert_eq!(
            minted.as_slice(),
            expected.as_slice(),
            "the envelope is not the assembled bytes"
        );
        assert_eq!(
            minted.len(),
            ENVELOPE_BYTES,
            "the envelope is a fixed 99 bytes"
        );
    }
}

/// An independent decryption recovers the sealed plaintext.
///
/// The mint-side byte comparison has its counterpart here. This case decrypts the body under the
/// independently derived key and compares it with the hand-assembled plaintext, which pins the
/// sealed bytes from both sides of the AEAD.
#[test]
fn an_independent_open_recovers_the_scope() {
    let canonical = b"{\"kind\":\"all\"}".as_slice();
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let minted = authority
        .mint(scope(11, 5, Some(canonical)), issued_at())
        .expect("the seeded generator is infallible");

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
        plaintext(11, 5, Some(canonical)),
        "the sealed plaintext is not the assembled bytes"
    );
}

/// A hand-assembled envelope opens to the scope it names, filtered or not.
///
/// The independent implementation seals, the production `open` accepts and resolves the scope. With
/// the mint-side byte comparison this closes the loop in both directions, so the round trip through
/// the production pair alone needs no case of its own.
#[test]
fn a_hand_assembled_envelope_opens() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());

    for (k, filter) in [(0, None), (5, Some(b"{\"kind\":\"all\"}".as_slice()))] {
        let blob = seal_raw(&plaintext(11, k, filter), issued_at(), &[9; NONCE_BYTES]);

        assert_eq!(
            authority
                .open(&blob, presenter(11), issued_at())
                .expect("a hand-assembled envelope opens"),
            scope(11, k, filter),
            "the opened scope differs from the sealed one"
        );
    }
}

/// A rewritten issue time refuses as an authentication fault.
///
/// The clear header is in the associated data, so editing the field the age check reads invalidates
/// the tag. `open` judges the tag first, which is why the cause is authentication rather than
/// staleness whichever direction the edit moves the clock.
#[test]
fn a_rewritten_issue_time_refuses() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let mut minted = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    // Move the recorded second, which the tag covers.
    minted[VERSION_BYTES] = minted[VERSION_BYTES].wrapping_add(1);

    assert_eq!(
        authority.open(&minted, presenter(11), issued_at()),
        Err(AuthorityError::Authentication),
        "an edited header opened"
    );
}

/// A token older than the hard window refuses, and so does a future-dated one.
#[test]
fn a_token_outside_the_window_refuses() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let minted = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");
    let hard = Duration::from_mins(10);

    assert_eq!(
        authority.open(&minted, presenter(11), issued_at() + hard),
        Err(AuthorityError::Stale),
        "a token at the hard window opened"
    );
    assert_eq!(
        authority.open(&minted, presenter(11), issued_at() - Duration::from_secs(1)),
        Err(AuthorityError::Stale),
        "a future-dated token opened"
    );
    authority
        .open(
            &minted,
            presenter(11),
            issued_at() + hard - Duration::from_secs(1),
        )
        .expect("a token one second inside the window opens");
}

/// A token minted under another generation refuses.
///
/// The generation salts the key, so this refusal happens at the tag rather than at a field
/// comparison, and it holds for a token whose plaintext is otherwise identical.
#[test]
fn a_foreign_generation_refuses() {
    let minting = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let minted = minting
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    let foreign = TokenAuthority::new(
        "1a".repeat(32)
            .parse()
            .expect("64 hexadecimal digits name a generation"),
        &secret(),
        Duration::from_mins(10),
        rng(),
    );

    assert_eq!(
        foreign.open(&minted, presenter(11), issued_at()),
        Err(AuthorityError::Authentication),
        "a token from another generation opened"
    );
}

/// A token opened under another secret refuses at the tag.
#[test]
fn a_foreign_secret_refuses() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let minted = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    let foreign = TokenAuthority::new(
        generation(),
        &SecretHexBytes::new([0xA5; 32]),
        Duration::from_mins(10),
        rng(),
    );
    assert_eq!(
        foreign.open(&minted, presenter(11), issued_at()),
        Err(AuthorityError::Authentication),
        "a token opened under another secret"
    );
}

/// Tampering with any authenticated byte refuses.
///
/// The issue time has its own case, and the nonce, the ciphertext, and the tag cover the remaining
/// regions. The nonce is in the clear header, so its edit fails through the associated data, while
/// the other two fail as ciphertext.
#[test]
fn a_tampered_byte_refuses() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let minted = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    for (region, index) in [
        ("nonce", NONCE_OFFSET),
        ("ciphertext", HEADER_BYTES),
        ("tag", minted.len() - 1),
    ] {
        let mut tampered = minted;
        tampered[index] ^= 1;
        assert_eq!(
            authority.open(&tampered, presenter(11), issued_at()),
            Err(AuthorityError::Authentication),
            "a token with a tampered {region} byte opened"
        );
    }
}

/// A valid token presented by an actor it does not name refuses.
///
/// The tag proves the server minted the token, not that the presenter is its subject: without this
/// refusal a leaked token would grant any authenticated actor the subject's scope.
#[test]
fn a_foreign_actor_refuses() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let minted = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_eq!(
        authority.open(&minted, presenter(12), issued_at()),
        Err(AuthorityError::Actor),
        "another actor's presentation opened"
    );
}

/// An expired token no longer opens, yet still carries its view state for a re-mint.
///
/// The property the carried read exists for: hard invalidation forces a fresh mint without
/// perturbing the view. At an instant past the hard window, `open` refuses the token as stale while
/// `carried` still reads the sealed state - and a token re-minted from that state opens, sealing
/// the same view.
#[test]
fn an_expired_token_still_carries_its_scope() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let minted = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");
    let later = issued_at() + Duration::from_mins(11);

    assert_eq!(
        authority.open(&minted, presenter(11), later),
        Err(AuthorityError::Stale),
        "an expired token opened"
    );

    let carried = authority
        .carried(&minted, presenter(11))
        .expect("an expired token still carries its state");
    assert_eq!(carried, scope(11, 5, None), "the carried state differs");

    let renewed = authority
        .mint(carried, later)
        .expect("the seeded generator is infallible");
    assert_eq!(
        authority
            .open(&renewed, presenter(11), later)
            .expect("the renewed token opens"),
        scope(11, 5, None),
        "the renewal perturbed the view"
    );
}

/// The carried read forgives staleness alone: the tag and the actor still refuse.
#[test]
fn a_carried_read_still_enforces_tag_and_actor() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let minted = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    let mut tampered = minted;
    tampered[HEADER_BYTES] ^= 1;
    assert_eq!(
        authority.carried(&tampered, presenter(11)),
        Err(AuthorityError::Authentication),
        "a tampered token carried"
    );
    assert_eq!(
        authority.carried(&minted, presenter(12)),
        Err(AuthorityError::Actor),
        "another actor's presentation carried"
    );
}

/// A second mint draws a different nonce.
///
/// Nonce reuse under one key repeats the keystream and the Poly1305 one-time key, so the property
/// worth witnessing is the opposite of determinism: the entropy source advances per mint. Both
/// tokens open.
#[test]
fn two_mints_draw_distinct_nonces() {
    let authority = TokenAuthority::new(generation(), &secret(), Duration::from_mins(10), rng());
    let first = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");
    let second = authority
        .mint(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_ne!(
        first[NONCE_OFFSET..NONCE_OFFSET + NONCE_BYTES],
        second[NONCE_OFFSET..NONCE_OFFSET + NONCE_BYTES],
        "two mints shared a nonce"
    );
    for minted in [&first, &second] {
        authority
            .open(minted, presenter(11), issued_at())
            .expect("an equal-scope token opens");
    }
}
