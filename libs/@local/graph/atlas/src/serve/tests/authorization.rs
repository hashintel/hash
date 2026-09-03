//! The authority token's contract, driven through its facade.
//!
//! Every case issues a token, opens it or reads it for a renewal through [`TokenAuthority`] alone,
//! and asserts each outcome by its [`AuthorityError`] cause. The envelope's layout belongs to the
//! production types, and the cases reach every byte without naming an offset: the tamper case flips
//! each position of the envelope in turn, and the nonce case compares whole envelopes.
#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]

use core::time::Duration;
use std::time::SystemTime;

use rand::{SeedableRng as _, rngs::ChaCha20Rng};
use type_system::principal::actor::{ActorId, UserId};
use uuid::Uuid;

use crate::{
    integrity::SecretHexBytes,
    serve::{
        DeltaEpoch,
        authorization::{AuthorityError, Scope, TOKEN_BYTES, TokenAuthority},
        cache::scope::FilterDigest,
        density::CutOffset,
    },
};

/// The acceptance window of every fixture authority.
const HARD: Duration = Duration::from_mins(10);

/// The canonical filter document of the filtered fixtures.
const FILTER: &[u8] = b"{\"kind\":\"all\"}";

/// A deterministic CSPRNG for the fixtures.
///
/// Seeded rather than drawn from the operating system: these cases never depend on the nonce's
/// value, and a fixed stream keeps a failure reproducible.
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

/// The actor identity `actor` names, as a token's presenter.
fn actor(actor: u128) -> ActorId {
    ActorId::User(UserId::new(Uuid::from_u128(actor)))
}

/// The view of one actor, resolved at offset `k`, over the filter digest of `filter` when present.
fn scope(actor_id: u128, k: u8, filter: Option<&[u8]>) -> Scope {
    Scope::new(
        actor(actor_id),
        filter.map(FilterDigest::of),
        CutOffset::new(k),
    )
}

/// An authority over the fixture generation and secret, holding `epoch`.
fn authority(epoch: Option<DeltaEpoch>) -> TokenAuthority<ChaCha20Rng> {
    TokenAuthority::new(generation(), &secret(), HARD, epoch, rng())
}

/// An issued token opens to the scope it sealed, filtered or not, under either epoch form.
///
/// The opened scope carries the actor, the filter digest and the offset unchanged, and the epoch
/// an authority holds at issuance is the one its own open accepts.
#[test]
fn open_roundtrip() {
    let epoch = DeltaEpoch::fresh(&mut rng()).expect("the seeded generator is infallible");

    for authority in [authority(None), authority(Some(epoch))] {
        for (k, filter) in [(0, None), (5, Some(FILTER))] {
            let minted = authority
                .issue(scope(11, k, filter), issued_at())
                .expect("the seeded generator is infallible");

            assert_eq!(
                authority
                    .open(&minted, actor(11), issued_at())
                    .expect("an issued token opens"),
                scope(11, k, filter),
                "the opened scope differs from the sealed one"
            );
        }
    }
}

/// Every byte of the envelope is under the tag, and the version byte leads it.
///
/// The header is the associated data, and the rest is ciphertext and tag. A flipped bit at any
/// position past the first refuses as an authentication fault, a moved issue time included, since
/// `open` judges the tag before the window. A flipped bit in the first byte, the format version,
/// fails the zerocopy cast ahead of the tag and refuses as an envelope fault.
#[test]
fn open_tampered_byte() {
    let authority = authority(None);
    let minted = authority
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    for index in 0..TOKEN_BYTES {
        let mut tampered = minted;
        tampered[index] ^= 1;

        let expected = if index == 0 {
            AuthorityError::Envelope
        } else {
            AuthorityError::Authentication
        };
        assert_eq!(
            authority.open(&tampered, actor(11), issued_at()),
            Err(expected),
            "a token with a flipped bit at byte {index} opened, or refused for another cause"
        );
    }
}

/// A token at or past the hard window refuses, and so does a future-dated one.
#[test]
fn open_outside_window() {
    let authority = authority(None);
    let minted = authority
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_eq!(
        authority.open(&minted, actor(11), issued_at() + HARD),
        Err(AuthorityError::Stale),
        "a token at the hard window opened"
    );
    assert_eq!(
        authority.open(&minted, actor(11), issued_at() - Duration::from_secs(1)),
        Err(AuthorityError::Stale),
        "a future-dated token opened"
    );
    authority
        .open(
            &minted,
            actor(11),
            issued_at() + HARD - Duration::from_secs(1),
        )
        .expect("a token one second inside the window opens");
}

/// A token issued under another generation refuses.
///
/// The generation salts the key. The refusal happens at the tag rather than at a field comparison,
/// and it holds for a token whose plaintext is otherwise identical.
#[test]
fn open_foreign_generation() {
    let minted = authority(None)
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    let foreign = TokenAuthority::new(
        "1a".repeat(32)
            .parse()
            .expect("64 hexadecimal digits name a generation"),
        &secret(),
        HARD,
        None,
        rng(),
    );

    assert_eq!(
        foreign.open(&minted, actor(11), issued_at()),
        Err(AuthorityError::Authentication),
        "a token from another generation opened"
    );
}

/// A token opened under another secret refuses at the tag.
#[test]
fn open_foreign_secret() {
    let minted = authority(None)
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    let foreign = TokenAuthority::new(
        generation(),
        &SecretHexBytes::new([0xA5; 32]),
        HARD,
        None,
        rng(),
    );

    assert_eq!(
        foreign.open(&minted, actor(11), issued_at()),
        Err(AuthorityError::Authentication),
        "a token opened under another secret"
    );
}

/// A valid token presented by an actor it does not name refuses.
///
/// The tag proves the server issued the token, not that the presenter is its subject: without this
/// refusal a leaked token would grant any authenticated actor the subject's scope.
#[test]
fn open_foreign_actor() {
    let authority = authority(None);
    let minted = authority
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_eq!(
        authority.open(&minted, actor(12), issued_at()),
        Err(AuthorityError::Actor),
        "another actor's presentation opened"
    );
}

/// A token sealed under a dead delta epoch refuses to open.
///
/// The issuing and successor authorities share one generation and secret, standing in for a
/// serving process before and after a restart. The sealing key is identical, and the refusal is
/// the epoch comparison rather than the tag.
#[test]
fn open_dead_epoch() {
    let mut draws = rng();
    let first = DeltaEpoch::fresh(&mut draws).expect("the seeded generator is infallible");
    let second = DeltaEpoch::fresh(&mut draws).expect("the seeded generator is infallible");

    let minted = authority(Some(first))
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_eq!(
        authority(Some(second)).open(&minted, actor(11), issued_at()),
        Err(AuthorityError::Epoch),
        "a dead epoch's token opened"
    );
}

/// The absent and present epoch forms refuse each other in both directions.
///
/// A delta-serving process must not accept the tokens of a no-delta predecessor, whose sessions
/// never learned any slot. A no-delta process must not accept tokens whose sessions may hold slot
/// rows from a delta predecessor, and exact equality of the sealed form is the one rule covering
/// both.
#[test]
fn open_epoch_presence_mismatch() {
    let epoch = DeltaEpoch::fresh(&mut rng()).expect("the seeded generator is infallible");
    let without = authority(None);
    let with = authority(Some(epoch));

    let absent_sealed = without
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");
    let present_sealed = with
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_eq!(
        with.open(&absent_sealed, actor(11), issued_at()),
        Err(AuthorityError::Epoch),
        "a no-delta token opened under a live epoch"
    );
    assert_eq!(
        without.open(&present_sealed, actor(11), issued_at()),
        Err(AuthorityError::Epoch),
        "a delta token opened under a no-delta authority"
    );
}

/// Two no-delta authorities accept each other's tokens.
///
/// The absent form equals itself across constructions, and a process serving without a delta
/// consumer keeps its tokens valid across restarts.
#[test]
fn open_absent_epoch_after_restart() {
    let minted = authority(None)
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_eq!(
        authority(None)
            .open(&minted, actor(11), issued_at())
            .expect("a no-delta token opens after a no-delta restart"),
        scope(11, 5, None),
        "the opened scope differs from the sealed one"
    );
}

/// An expired token no longer opens, yet still yields its view state for a renewal.
///
/// The property the carried read exists for: hard invalidation forces a fresh token without
/// perturbing the view. At an instant past the hard window, `open` refuses the token as stale while
/// `continuity` still reads the sealed state, and a token re-issued from that state opens, sealing
/// the same view.
#[test]
fn continuity_expired() {
    let authority = authority(None);
    let minted = authority
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");
    let later = issued_at() + HARD + Duration::from_mins(1);

    assert_eq!(
        authority.open(&minted, actor(11), later),
        Err(AuthorityError::Stale),
        "an expired token opened"
    );

    let carried = authority
        .continuity(&minted, actor(11))
        .expect("an expired token still yields its view state");
    assert_eq!(
        carried,
        scope(11, 5, None),
        "the continuity read differs from the sealed scope"
    );

    let renewed = authority
        .issue(carried, later)
        .expect("the seeded generator is infallible");
    assert_eq!(
        authority
            .open(&renewed, actor(11), later)
            .expect("the renewed token opens"),
        scope(11, 5, None),
        "the renewal perturbed the view"
    );
}

/// The continuity read skips the window and keeps the tag: a flipped tag byte refuses.
#[test]
fn continuity_tampered() {
    let authority = authority(None);
    let mut tampered = authority
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");
    tampered[TOKEN_BYTES - 1] ^= 1;

    assert_eq!(
        authority.continuity(&tampered, actor(11)),
        Err(AuthorityError::Authentication),
        "a tampered token carried"
    );
}

/// The continuity read skips the window and keeps the actor comparison: a presenter the token does
/// not name refuses.
#[test]
fn continuity_foreign_actor() {
    let authority = authority(None);
    let minted = authority
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_eq!(
        authority.continuity(&minted, actor(12)),
        Err(AuthorityError::Actor),
        "another actor's presentation carried"
    );
}

/// A token sealed under a dead delta epoch refuses to carry into a renewal.
///
/// The renewal read is the path the session-replacement contract names: view state accumulated
/// beside a dead register must not carry into a token issued under the live one.
#[test]
fn continuity_dead_epoch() {
    let mut draws = rng();
    let first = DeltaEpoch::fresh(&mut draws).expect("the seeded generator is infallible");
    let second = DeltaEpoch::fresh(&mut draws).expect("the seeded generator is infallible");

    let minted = authority(Some(first))
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_eq!(
        authority(Some(second)).continuity(&minted, actor(11)),
        Err(AuthorityError::Epoch),
        "a dead epoch's token carried into a renewal"
    );
}

/// A second issuance draws a different nonce.
///
/// Nonce reuse under one key repeats the keystream and the Poly1305 one-time key, and the property
/// worth witnessing is the opposite of determinism: the entropy source advances per issuance. Two
/// tokens of one scope at one instant differ through the nonce alone, and an equal pair would mean
/// a repeated draw. Both tokens open.
#[test]
fn issue_distinct_nonces() {
    let authority = authority(None);
    let first = authority
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");
    let second = authority
        .issue(scope(11, 5, None), issued_at())
        .expect("the seeded generator is infallible");

    assert_ne!(first, second, "two issuances shared a nonce");
    for minted in [&first, &second] {
        authority
            .open(minted, actor(11), issued_at())
            .expect("an equal-scope token opens");
    }
}
