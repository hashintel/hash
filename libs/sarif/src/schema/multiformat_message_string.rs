use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::PropertyBag;

/// A message string or message format string rendered in multiple formats ([§3.12]).
///
///
/// # General
///
/// A `MultiformatMessageString` object groups together all available textual formats for a message
/// string.
///
///
/// # Localization
///
/// Certain `MultiformatMessageString`-valued properties in this document, for example,
/// [`ReportingDescriptor::short_description`] ([§3.49.9]), can be translated into other languages.
/// We describe these properties as being “localizable”. The description of every localizable
/// property will state that it is localizable.
///
///
/// [`ReportingDescriptor::short_description`]: crate::schema::ReportingDescriptor::short_description
///
/// [§3.12]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317473
/// [§3.49.9]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317845
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct MultiformatMessageString<'s> {
    /// A plain text message string or format string ([§3.12.3]).
    ///
    ///
    /// A `MultiformatMessageString` object **shall** contain a property named `text` whose value
    /// is a non-empty string containing a plain text representation of the message.
    ///
    /// > ## Note
    /// >
    /// > This property is required to ensure that the message is viewable even in contexts that do
    /// > not support the rendering of formatted text
    ///
    /// [§3.12.3]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317476
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub text: Cow<'s, str>,

    /// A Markdown message string or format string ([§3.12.4]).
    ///
    ///
    /// A `MultiformatMessageString` object **may** contain a property named `markdown` whose value
    /// is a non-empty string containing a [formatted message] ([§3.11.4]) expressed in
    /// [GitHub-Flavored Markdown][GFM].
    ///
    /// SARIF consumers that cannot (or choose not to) render formatted text **shall** ignore the
    /// markdown property and use the text property ([§3.12.3]) instead.
    ///
    /// [formatted message]: struct.Message.html#formatted-messages
    ///
    /// [§3.11.4]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317463
    /// [§3.12.3]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317476
    /// [§3.12.4]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317477
    ///
    /// [GFM]: https://github.github.com/gfm/
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub markdown: Option<Cow<'s, str>>,

    /// Key/value pairs that provide additional information about this message.
    ///
    /// See the [`PropertyBag`] object ([§3.8]) for details.
    ///
    /// [§3.11.11]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317448
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
