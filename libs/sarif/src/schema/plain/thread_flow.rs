use alloc::{borrow::Cow, collections::BTreeMap, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{
    plain::{property_bag::PropertyBag, Message, MultiformatMessageString},
    ThreadFlowLocation,
};

/// Describes a sequence of code locations that specify a path through a single thread of execution
/// such as an operating system or fiber.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ThreadFlow<'s> {
    /// An string that uniquely identifies the threadFlow within the codeFlow in which it occurs.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub id: Option<Cow<'s, str>>,

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

    /// Values of relevant expressions at the start of the thread flow that may change during
    /// thread flow execution.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub initial_state: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// Values of relevant expressions at the start of the thread flow that remain constant.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub immutable_state: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// A temporally ordered array of [`ThreadFlowLocation`] objects.
    ///
    /// Each of which describes a location visited by the tool while producing the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub locations: Vec<ThreadFlowLocation<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
