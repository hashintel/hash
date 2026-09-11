#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum AuthorityError {
    Envelope,
    Decryption,
    Actor,
    Generation,
    Expired,
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
