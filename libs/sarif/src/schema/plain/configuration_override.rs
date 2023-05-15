#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{
    property_bag::PropertyBag, ReportingConfiguration, ReportingDescriptorReference,
};

/// Information about how a specific rule or notification was reconfigured at runtime.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ConfigurationOverride<'s> {
    /// Information about a rule or notification that can be configured at runtime.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub configuration: ReportingConfiguration<'s>,

    /// Information about how to locate a relevant reporting descriptor.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub descriptor: ReportingDescriptorReference<'s>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
