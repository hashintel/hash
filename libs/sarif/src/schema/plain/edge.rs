use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{plain::PropertyBag, Message};

/// Represents a directed edge in a graph.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Edge<'s> {
    /// A string that uniquely identifies the edge within its graph.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub id: Cow<'s, str>,

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
    pub label: Option<Message<'s>>,

    /// Identifies the source node (the node at which the edge starts).
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub source_node_id: Cow<'s, str>,

    /// Identifies the target node (the node at which the edge ends).
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub target_node_id: Cow<'s, str>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
