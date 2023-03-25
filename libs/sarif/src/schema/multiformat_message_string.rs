use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::PropertyBag;

/// A message string or message format string rendered in multiple formats.
///
/// It groups together all available textual formats for a message string
///
/// See the [SARIF specification §3.12][spec] for more information.
///
/// [spec]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html#_Toc34317473.
///
/// ## Localization
///
/// Certain `MultiformatMessageString`-value properties, for example
/// [`ReportingDescriptor::short_description`], can be translated into other languages. These
/// properties are described as "localizable". The description of every localizable property will
/// state that it is localizable.
///
/// [`ReportingDescriptor::short_description`]: crate::schema::ReportingDescriptor::short_description
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct MultiformatMessageString<'s> {
    /// A plain text representation of the message.
    ///
    /// ## Note
    ///
    /// This property is required to ensure that the message is viewable even in contexts that do
    /// not support the rendering of formatted text
    ///
    /// See the [SARIF specification §3.12.3][spec] for more information.
    ///
    /// [spec]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html#_Toc34317476
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub text: Cow<'s, str>,

    /// A formatted message expressed in [GitHub-Flavored Markdown].
    ///
    /// SARIF consumers that cannot (or choose not to) render formatted text should ignore the
    /// `markdown` property and use the [`text`] property instead.
    ///
    /// See the [SARIF specification §3.12.4][spec] for more information.
    ///
    /// [GitHub-Flavored Markdown]: https://github.github.com/gfm/
    /// [`text`]: Self::text
    /// [spec]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html#_Toc34317477
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none")
    )]
    pub markdown: Option<Cow<'s, str>>,

    /// Key/value pairs that provide additional information about the message.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}

impl<'s> MultiformatMessageString<'s> {
    /// Creates a new `ReportingDescriptor` with the provided [`text`] property.
    ///
    /// [`text`]: Self::text
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::MultiformatMessageString;
    ///
    /// let message = MultiformatMessageString::new("mismatched types");
    ///
    /// assert_eq!(message.text, "mismatched types");
    /// ```
    #[must_use]
    pub fn new(text: impl Into<Cow<'s, str>>) -> Self {
        Self {
            text: text.into(),
            markdown: None,
            properties: PropertyBag::new(),
        }
    }

    /// Sets the name of the `ReportingDescriptor`.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::MultiformatMessageString;
    ///
    /// let message =
    ///     MultiformatMessageString::new("mismatched types").with_markdown("mismatched **types**");
    ///
    /// assert_eq!(message.markdown.unwrap(), "mismatched **types**");
    /// ```
    #[must_use]
    pub fn with_markdown(mut self, markdown: impl Into<Cow<'s, str>>) -> Self {
        self.markdown = Some(markdown.into());
        self
    }

    /// Add additional properties to the message.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::MultiformatMessageString;
    ///
    /// let message = MultiformatMessageString::new("mismatched types")
    ///     .with_properties(|properties| properties.with_property("foo", "bar"));
    ///
    /// assert_eq!(message.properties.additional.get("foo").unwrap(), "bar");
    /// ```
    #[must_use]
    pub fn with_properties(
        mut self,
        mut properties: impl FnMut(PropertyBag<'s>) -> PropertyBag<'s>,
    ) -> Self {
        self.properties = properties(self.properties);
        self
    }
}
