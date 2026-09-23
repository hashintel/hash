use core::{mem::offset_of, time::Duration};
use std::time::SystemTime;

use zerocopy::{FromBytes as _, IntoBytes as _, TryFromBytes as _};

use super::{
    scope::{Scope, ScopeFilter},
    token::UnixEpochSeconds,
};
use crate::{morton::Zoom, serve::visibility::cache::FilterDigest};

#[test]
fn filter_digest_roundtrip() {
    let digest = FilterDigest::of(b"filter bytes");
    let filter = ScopeFilter::from(Some(digest));
    let decoded = ScopeFilter::try_read_from_bytes(filter.as_bytes())
        .expect("the written filter should decode");
    assert_eq!(decoded.digest(), Some(digest));
}

#[test]
fn timestamp_seconds() {
    let issued_at = SystemTime::UNIX_EPOCH + Duration::from_millis(1_000_900);
    let encoded = UnixEpochSeconds::new(issued_at);
    assert_eq!(
        encoded.to_system_time(),
        Some(SystemTime::UNIX_EPOCH + Duration::from_secs(1_000))
    );
}

#[test]
fn timestamp_before_epoch() {
    let time = SystemTime::UNIX_EPOCH - Duration::from_nanos(1);
    assert_eq!(
        UnixEpochSeconds::new(time).to_system_time(),
        Some(SystemTime::UNIX_EPOCH)
    );
}

// Unix and Windows system times cannot represent the full unsigned seconds range.
#[cfg(any(unix, windows))]
#[test]
fn timestamp_decoded_overflow() {
    let encoded = UnixEpochSeconds::read_from_bytes(&[u8::MAX; size_of::<UnixEpochSeconds>()])
        .expect("the seconds should decode independently of the host time range");
    assert_eq!(encoded.to_system_time(), None);
}

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
