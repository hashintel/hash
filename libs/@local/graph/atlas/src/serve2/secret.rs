use core::ops::Deref;

use crate::integrity::SecretHexBytes;

#[derive(Debug, PartialEq, Eq)]
#[repr(transparent)]
pub(crate) struct ServeSecret(SecretHexBytes<32>);

impl ServeSecret {
    const LENGTH: usize = size_of::<Self>();
}

impl Deref for ServeSecret {
    type Target = SecretHexBytes<{ Self::LENGTH }>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<SecretHexBytes<{ Self::LENGTH }>> for ServeSecret {
    fn from(bytes: SecretHexBytes<{ Self::LENGTH }>) -> Self {
        Self(bytes)
    }
}
