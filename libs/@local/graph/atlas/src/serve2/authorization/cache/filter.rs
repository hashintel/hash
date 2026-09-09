use crate::integrity::{Sha256, Sha256Digest, Update as _};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct FilterDigest(Sha256Digest);

impl FilterDigest {
    pub(crate) fn of(filter: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(b"filter");
        hasher.update(filter);

        Self(hasher.finalize())
    }
}
