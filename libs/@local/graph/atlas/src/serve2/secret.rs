use core::ops::Deref;

use crate::integrity::SecretHexBytes;

#[derive(Debug, PartialEq, Eq)]
#[repr(transparent)]
pub(crate) struct ServeSecret(SecretHexBytes<32>);

impl ServeSecret {
    const LENGTH: usize = size_of::<Self>();
}

impl Deref for ServeSecret {
    type Target = SecretHexBytes<32>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
