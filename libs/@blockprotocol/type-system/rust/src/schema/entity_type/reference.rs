use core::ptr;

use serde::{Deserialize, Serialize};

use crate::url::VersionedUrl;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(deny_unknown_fields)]
#[repr(transparent)]
pub struct EntityTypeReference {
    #[serde(rename = "$ref")]
    pub url: VersionedUrl,
}

impl From<&VersionedUrl> for &EntityTypeReference {
    fn from(url: &VersionedUrl) -> Self {
        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref::<VersionedUrl>(url).cast::<EntityTypeReference>() }
    }
}
