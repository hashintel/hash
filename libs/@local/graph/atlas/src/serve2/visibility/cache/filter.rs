use crate::integrity::{Sha256, Sha256Digest, Update as _};

#[derive(
    Debug,
    Copy,
    Clone,
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

const impl PartialEq for FilterDigest {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

const impl Eq for FilterDigest {}
