use alloc::vec::Vec;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{
    location_relationship::LocationRelationship, logical_location::LogicalLocation,
    physical_location::PhysicalLocation, property_bag::PropertyBag, Message, Region,
};

/// A location within a programming artifact.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Location<'s> {
    /// Value that distinguishes this location from all other locations within a single result
    /// object.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one",
        )
    )]
    pub id: Option<usize>,

    /// A physical location relevant to a result.
    ///
    /// Specifies a reference to a programming artifact together with a range of bytes or
    /// characters within that artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub physical_location: Option<PhysicalLocation<'s>>,

    /// The logical locations associated with the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub logical_locations: Vec<LogicalLocation<'s>>,

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

    /// A set of regions relevant to the location.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub annotations: Vec<Region<'s>>,

    /// An array of objects that describe relationships between this location and others.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub relationships: Vec<LocationRelationship<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
