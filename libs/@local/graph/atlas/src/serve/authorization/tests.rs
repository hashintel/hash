use core::{mem::offset_of, time::Duration};
use std::time::SystemTime;

use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    scope::{Scope, ScopeFilter},
    token::UnixEpochSeconds,
};
use crate::{morton::Zoom, serve::visibility::cache::FilterDigest};

/// Authorization preserves the same filter identity the visibility cache keys use.
#[test]
fn filter_digest_roundtrip() {
    let digest = FilterDigest::of(b"filter bytes");
    let filter = ScopeFilter::from(Some(digest));
    let decoded = ScopeFilter::try_read_from_bytes(filter.as_bytes())
        .expect("the written filter should decode");
    assert_eq!(decoded.digest(), Some(digest));
}

/// The token format intentionally truncates timestamps to integral Unix seconds.
#[test]
fn timestamp_seconds() {
    let issued_at = SystemTime::UNIX_EPOCH + Duration::from_millis(1_000_900);
    let encoded = UnixEpochSeconds::new(issued_at);
    assert_eq!(
        SystemTime::from(encoded),
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_000)
    );
}

/// Scope decoding validates the embedded delivery offset before exposing it to callers.
#[test]
fn scope_zoom_bytes() {
    let mut bytes = [0_u8; size_of::<Scope>()];
    assert!(
        Scope::try_read_from_bytes(&bytes).is_ok(),
        "zero fields should form a valid root scope before changing the zoom"
    );

    for byte in u8::MIN..=u8::MAX {
        bytes[offset_of!(Scope, k)] = byte;
        assert_eq!(
            Scope::try_read_from_bytes(&bytes).ok().map(|scope| scope.k),
            Zoom::new(byte),
            "scope decoding should enforce the zoom domain for byte {byte}"
        );
    }
}
