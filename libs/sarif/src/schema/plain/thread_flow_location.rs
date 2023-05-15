use alloc::{
    borrow::Cow,
    collections::{BTreeMap, BTreeSet},
    vec::Vec,
};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{
    plain::{location::Location, property_bag::PropertyBag, MultiformatMessageString},
    ReportingDescriptorReference, Stack, WebRequest, WebResponse,
};

#[derive(Debug, Default, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub enum Importance {
    Unimportant,
    #[default]
    Important,
    Essential,
}

/// A location visited by an analysis tool while simulating or monitoring the execution of a
/// program.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ThreadFlowLocation<'s> {
    /// The index within the run threadFlowLocations array.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one",
        )
    )]
    pub index: Option<usize>,

    /// A location within a programming artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub location: Option<Location<'s>>,

    /// A call stack that is relevant to a result.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub stack: Option<Stack<'s>>,

    /// A set of distinct strings that categorize the thread flow location.
    ///
    /// Well-known kinds include 'acquire', 'release', 'enter', 'exit', 'call', 'return', 'branch',
    /// 'implicit', 'false', 'true', 'caution', 'danger', 'unknown', 'unreachable', 'taint',
    /// 'function', 'handler', 'lock', 'memory', 'resource', 'scope' and 'value'.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeSet::is_empty")
    )]
    pub kinds: BTreeSet<Cow<'s, str>>,

    /// An array of references to rule or taxonomy reporting descriptors that are applicable to the
    /// thread flow location.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub taxa: Vec<ReportingDescriptorReference<'s>>,

    /// The name of the module that contains the code that is executing.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub module: Option<Cow<'s, str>>,

    /// A dictionary, each of whose keys specifies a variable or expression, the associated value
    /// of which represents the variable or expression value. For an annotation of kind
    /// 'continuation', for example, this dictionary might hold the current assumed values of a set
    /// of global variables.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub state: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// An integer representing a containment hierarchy within the thread flow.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub nesting_level: Option<u64>,

    /// An integer representing the temporal order in which execution reached this location.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one",
        )
    )]
    pub execution_order: Option<usize>,

    /// The Coordinated Universal Time (UTC) date and time at which this location was executed.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none",)
    )]
    pub execution_time_utc: Option<Cow<'s, str>>,

    /// The name of the module that contains the code that is executing.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub importance: Option<Importance>,

    /// Describes an HTTP request.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub web_request: Option<WebRequest<'s>>,

    /// Describes the response to an HTTP request.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub web_response: Option<WebResponse<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
