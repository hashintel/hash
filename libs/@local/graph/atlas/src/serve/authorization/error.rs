/// A refusal to honour a presented authority.
///
/// [`Authority::decrypt`](super::authority::Authority::decrypt) and
/// [`ScopeLease::current`](super::scope::ScopeLease::current) retain the failed check as a typed
/// error. Formatting reports only the check, without token contents. The [API
/// extractors](crate::api) log this distinction and map token failures to one
/// unauthorized response.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum AuthorityError {
    /// The token or scope is malformed, or its issue time exceeds the host's representable range.
    Envelope,
    /// Authenticated decryption rejects the token under this authority's key.
    Decryption,
    /// The scope belongs to a different actor than the one presenting it.
    Actor,
    /// The scope names a different generation.
    Generation,
    /// The check time precedes issuance or the token has reached the expiration boundary.
    Expired,
    /// The scope names a different [delta lifetime](crate::serve::delta::DeltaId).
    Delta,
}

impl core::fmt::Display for AuthorityError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Envelope => fmt.write_str("invalid authority envelope"),
            Self::Decryption => fmt.write_str("failed to decrypt authority"),
            Self::Actor => fmt.write_str("authority actor mismatch"),
            Self::Generation => fmt.write_str("authority generation mismatch"),
            Self::Expired => fmt.write_str("authority has expired"),
            Self::Delta => fmt.write_str("authority delta mismatch"),
        }
    }
}

impl core::error::Error for AuthorityError {}
