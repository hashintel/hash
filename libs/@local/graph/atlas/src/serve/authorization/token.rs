//! The authority token's byte envelope.
//!
//! A token contains a clear header, encrypted [`Scope`] and AEAD tag at fixed offsets, in that
//! order. The nonce selects the cipher's per-message state. The whole header is associated data,
//! authenticating the version and issue time along with the nonce. The expiry check interprets the
//! issue time after successful decryption.
//!
//! [`Authority`](super::authority::Authority) owns sealing and verification. [`EncryptedToken`]
//! supplies the hexadecimal presentation of the whole envelope, including the clear header.
//! Encryption covers only the scope.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::{fmt, str::FromStr, time::Duration};
use std::time::SystemTime;

use zerocopy::{LE, U64};

use super::{
    authority::{NONCE_BYTES, TAG_BYTES},
    scope::Scope,
};
use crate::integrity::{HexBytes, ParseHexError};

/// The token's envelope layout version.
///
/// Decoding accepts only the discriminants this enum names. An unsupported version is an
/// [`AuthorityError::Envelope`](super::error::AuthorityError::Envelope). Starting at 1 prevents a
/// zero-filled buffer from parsing as a valid header. The version check validates the
/// discriminator, not the origin of the remaining bytes.
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
    /// The layout this module defines: [`TokenHeader`], [`Scope`], [`TokenTrailer`].
    V1 = 1,
}

/// A point in time as whole seconds since the Unix epoch, little-endian.
///
/// Encoding the instant as a fixed-width count makes decoding host-independent. Conversion
/// truncates towards the epoch and maps earlier times to the epoch.
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
    /// Encodes `time` as whole seconds since the Unix epoch.
    ///
    /// # Warning
    ///
    /// A `time` before the epoch encodes as the epoch. Conversion discards sub-second precision.
    pub(super) fn new(time: SystemTime) -> Self {
        let duration = time.saturating_duration_since(SystemTime::UNIX_EPOCH);

        Self(U64::new(duration.as_secs()))
    }

    /// Converts the timestamp into a host-representable instant.
    ///
    /// Returns [`None`] when the seconds exceed this platform's [`SystemTime`] range.
    pub(super) fn to_system_time(self) -> Option<SystemTime> {
        SystemTime::UNIX_EPOCH.checked_add(Duration::from_secs(self.0.get()))
    }
}

/// The token's clear prefix, and the AEAD's associated data.
///
/// [`TokenTrailer`]'s tag authenticates these bytes together with the ciphertext. The header fields
/// remain readable without the authority key.
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
    /// The layout the remaining bytes follow.
    pub version: MessageVersion,
    /// The scope's issue time, the start of its expiration window.
    pub issued_at: UnixEpochSeconds,
    /// The per-token nonce for sealing this envelope.
    pub nonce: [u8; NONCE_BYTES],
}

impl TokenHeader {
    /// The header's width, the offset at which the ciphertext begins.
    pub(super) const BYTES: usize = size_of::<Self>();
}

/// The AEAD tag authenticating the ciphertext and clear header.
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
    /// The AEAD tag over the ciphertext and the clear header.
    pub tag: [u8; TAG_BYTES],
}

/// A fixed-width authority envelope with a clear header and encrypted scope.
///
/// For this layout, every token has the same width because the ciphertext is exactly [`Scope`]'s
/// size and [`ScopeFilter`](super::scope::ScopeFilter) pads its absent form. Filtered and
/// unfiltered scopes therefore have indistinguishable token lengths.
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
    /// The clear prefix the tag authenticates.
    pub header: TokenHeader,
    /// The sealed [`Scope`].
    pub ciphertext: [u8; size_of::<Scope>()],
    /// The tag over the ciphertext and the header.
    pub trailer: TokenTrailer,
}

impl Token {
    /// The token's total width, the length every presentation decodes to.
    pub(super) const BYTES: usize = size_of::<Self>();
}

/// A fixed-width authority presentation in lowercase hexadecimal.
///
/// [`core::fmt::Display`] writes the entire envelope, including its clear header. Parsing accepts
/// only exactly twice [`Token::BYTES`] lowercase hexadecimal characters and validates only this
/// encoding. Uppercase letters, prefixes and surrounding whitespace cause [`ParseHexError`].
/// [`Authority::decrypt`](super::authority::Authority::decrypt) authenticates the envelope and
/// validates its scope.
///
/// [`core::fmt::Debug`] also exposes the presentation. Treat either rendering as the reusable
/// token, even though neither reveals the encrypted scope directly.
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
    /// Constructs a presentable token from sealed envelope bytes.
    ///
    /// `bytes` must contain a complete [`Token`] envelope sealed and authenticated by an
    /// [`Authority`](super::authority::Authority).
    // this unchecked invariant affects token validity, not memory safety.
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
