use alloc::{borrow::Cow, collections::BTreeMap, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{plain::PropertyBag, EdgeTraversal, Message, MultiformatMessageString};

/// Represents the traversal of a single edge during a graph traversal.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct GraphTraversal<'s> {
    /// The index within the run.graphs to be associated with the result.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub run_graph_index: Option<usize>,

    /// The index within the result.graphs to be associated with the result.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub result_graph_index: Option<usize>,

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

    /// Values of relevant expressions at the start of the graph traversal that may change during
    /// graph traversal.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub initial_state: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// Values of relevant expressions at the start of the graph traversal that remain constant for
    /// the graph traversal.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub immutable_state: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// The sequences of edges traversed by this graph traversal.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub edge_traversals: Vec<EdgeTraversal<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
