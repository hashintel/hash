use alloc::{borrow::Cow, collections::BTreeSet};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{Message, PropertyBag, ReportingDescriptorReference};

/// Information about the relation of one reporting descriptor to another.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ReportingDescriptorRelationship<'s> {
    /// Information about how to locate a relevant reporting descriptor.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub target: ReportingDescriptorReference<'s>,

    /// A set of distinct strings that categorize the relationship.
    ///
    /// Well-known kinds include 'canPrecede', 'canFollow', 'willPrecede', 'willFollow',
    /// 'superset', 'subset', 'equal', 'disjoint', 'relevant', and 'incomparable'.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeSet::is_empty")
    )]
    pub kinds: BTreeSet<Cow<'s, str>>,

    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub description: Option<Message<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
