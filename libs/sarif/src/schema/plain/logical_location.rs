use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::PropertyBag;

/// A logical location of a construct that produced a [`Result`].
///
/// [`Result`]: crate::schema::plain::Result
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct LogicalLocation<'s> {
    /// Identifies the construct in which the result occurred.
    ///
    /// For example, this property might contain the name of a class or a method.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub name: Option<Cow<'s, str>>,

    /// The index within the logical locations array.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub index: Option<usize>,

    /// The human-readable fully qualified name of the logical location.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub fully_qualified_name: Option<Cow<'s, str>>,

    /// The machine-readable name for the logical location.
    ///
    /// Such as a mangled function name provided by a C++ compiler that encodes calling convention,
    /// return type and other details along with the function name.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub decorated_name: Option<Cow<'s, str>>,

    /// Identifies the index of the immediate parent of the construct in which the result was
    /// detected.
    ///
    /// For example, this property might point to a logical location that represents the namespace
    /// that holds a type.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub parent_index: Option<usize>,

    /// The type of construct this logical location component refers to.
    ///
    /// Should be one of "function", "member", "module", "namespace", "parameter", "resource",
    /// "returnType", "type", "variable", "object", "array", "property", "value", "element",
    /// "text", "attribute", "comment", "declaration", "dtd" or "processingInstruction", if any of
    /// those accurately describe the construct.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub kind: Option<Cow<'s, str>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
