use core::{fmt, str::FromStr, time::Duration};
use std::time::SystemTime;

use zerocopy::{LE, U64};

use super::{
    authority::{NONCE_BYTES, TAG_BYTES},
    scope::Scope,
};
use crate::integrity::{HexBytes, ParseHexError};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u8)]
pub(super) enum MessageVersion {
    V1 = 1,
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(super) struct UnixEpochSeconds(U64<LE>);

impl UnixEpochSeconds {
    pub(super) fn new(time: SystemTime) -> Self {
        let duration = time.saturating_duration_since(SystemTime::UNIX_EPOCH);

        Self(U64::new(duration.as_secs()))
    }
}

impl From<UnixEpochSeconds> for SystemTime {
    fn from(seconds: UnixEpochSeconds) -> Self {
        SystemTime::UNIX_EPOCH + Duration::from_secs(seconds.0.get())
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(C)]
pub(super) struct TokenHeader {
    pub version: MessageVersion,
    pub issued_at: UnixEpochSeconds,
    pub nonce: [u8; NONCE_BYTES],
}

impl TokenHeader {
    pub(super) const BYTES: usize = size_of::<Self>();
}

/// The token envelope's trailer, the AEAD's tag over the ciphertext and the clear header.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(C)]
pub(super) struct TokenTrailer {
    pub tag: [u8; TAG_BYTES],
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(C)]
pub(super) struct Token {
    pub header: TokenHeader,
    pub ciphertext: [u8; size_of::<Scope>()],
    pub trailer: TokenTrailer,
}

impl Token {
    pub(super) const BYTES: usize = size_of::<Self>();
}

/// An encrypted authority presentation with a lowercase hexadecimal text form.
///
/// Text parsing checks only the encoding.
/// [`Authority::decrypt`](super::authority::Authority::decrypt) verifies the presented authority.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct EncryptedToken(HexBytes<{ Token::BYTES }>);

impl EncryptedToken {
    pub(super) const fn new_unchecked(bytes: [u8; Token::BYTES]) -> Self {
        Self(HexBytes::new(bytes))
    }
}

impl fmt::Display for EncryptedToken {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl FromStr for EncryptedToken {
    type Err = ParseHexError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        value.parse::<HexBytes<{ Token::BYTES }>>().map(Self)
    }
}
