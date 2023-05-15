use alloc::vec::Vec;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{property_bag::PropertyBag, Message, ThreadFlow};

/// A set of [`ThreadFlow`]s which together describe a pattern of code execution relevant to
/// detecting a [`Result`].
///
/// [`Result`]: crate::schema::Result
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct CodeFlow<'s> {
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

    /// An array of one or more unique [`ThreadFlow`] objects, each of which describes the progress
    /// of a program through a thread of execution.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub thread_flows: Vec<ThreadFlow<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
