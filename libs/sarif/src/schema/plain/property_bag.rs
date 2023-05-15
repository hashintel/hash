#[cfg(feature = "serde")]
use alloc::collections::BTreeMap;
use alloc::{borrow::Cow, collections::BTreeSet};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Key/value pairs that provide additional information about the object.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct PropertyBag<'s> {
    /// A set of distinct strings that provide additional information.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeSet::is_empty")
    )]
    pub tags: BTreeSet<Cow<'s, str>>,

    /// Extra properties of any type may be provided to this object.
    #[cfg(feature = "serde")]
    #[serde(flatten, borrow)]
    pub additional: BTreeMap<Cow<'s, str>, serde_json::Value>,
}

impl PropertyBag<'_> {
    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        self.tags.is_empty() && self.additional.is_empty()
    }
}
