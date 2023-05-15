use alloc::{borrow::Cow, collections::BTreeMap};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{plain::PropertyBag, Message, MultiformatMessageString};

/// Represents the traversal of a single edge during a graph traversal.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct EdgeTraversal<'s> {
    /// Identifies the edge being traversed.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub edge_id: Cow<'s, str>,

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
    pub message: Option<Message<'s>>,

    /// The values of relevant expressions after the edge has been traversed.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub final_state: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// The number of edge traversals necessary to return from a nested graph.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub step_over_edge_count: Option<u64>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
