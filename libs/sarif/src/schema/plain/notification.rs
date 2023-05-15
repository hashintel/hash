use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{
    plain::{location::Location, property_bag::PropertyBag},
    Exception, Level, Message, ReportingDescriptorReference,
};

/// Describes a condition relevant to the tool itself, as opposed to being relevant to a target
/// being analyzed by the tool.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Notification<'s> {
    /// The locations relevant to this notification.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub locations: Vec<Location<'s>>,

    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub message: Message<'s>,

    /// A value specifying the severity level of the notification.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub level: Level,

    /// The thread identifier of the code that generated the notification.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub thread_id: Option<i64>,

    /// The Coordinated Universal Time (UTC) date and time at which the analysis tool generated the
    /// notification.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none",)
    )]
    pub time_utc: Option<Cow<'s, str>>,

    /// Describes a runtime exception encountered during the execution of an analysis tool.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub exception: Exception<'s>,

    /// Information about how to locate a relevant reporting descriptor.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub descriptor: Option<ReportingDescriptorReference<'s>>,

    /// Information about how to locate a relevant reporting descriptor.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub associated_rule: Option<ReportingDescriptorReference<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
