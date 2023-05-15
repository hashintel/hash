use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::plain::{physical_location::PhysicalLocation, property_bag::PropertyBag};

/// Identifies a particular toolComponent object, either the driver or an extension.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ResultProvenance<'s> {
    /// The date and time at which the result was first detected.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub first_detection_time_utc: Option<Cow<'s, str>>,

    /// The date and time at which the result was most recently detected.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub last_detection_time_utc: Option<Cow<'s, str>>,

    /// A GUID-valued string equal to the automationDetails.guid property of the run in which the
    /// result was first detected.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            rename = "firstDetectionRunGuid",
            skip_serializing_if = "Option::is_none"
        )
    )]
    pub first_detection_run: Option<Uuid>,

    /// A GUID-valued string equal to the automationDetails.guid property of the run in which the
    /// result was most recently detected.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            rename = "lastDetectionRunGuid",
            skip_serializing_if = "Option::is_none"
        )
    )]
    pub last_detection_run: Option<Uuid>,

    /// The index within the run.invocations array of the invocation object which describes the
    /// tool invocation that detected the result.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub invocation_index: Option<usize>,

    /// The portions of an analysis tool's output that a converter transformed into the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub conversion_source: Vec<PhysicalLocation<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
