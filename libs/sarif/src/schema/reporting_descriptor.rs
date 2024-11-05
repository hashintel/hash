use alloc::{
    borrow::Cow,
    collections::{BTreeMap, BTreeSet},
};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use url::Url;
use uuid::Uuid;

use crate::schema::MultiformatMessageString;

/// Metadata that describes a specific report produced by the tool, as part of the analysis it
/// provides or its runtime reporting.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[non_exhaustive]
pub struct ReportingDescriptor<'s> {
    /// A stable, opaque identifier for the report.
    #[cfg_attr(feature = "serde", serde(borrow, default))]
    pub id: Cow<'s, str>,

    /// A set of stable, opaque identifiers by which this report was known in some previous
    /// version of the analysis tool.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeSet::is_empty")
    )]
    pub deprecated_ids: BTreeSet<Cow<'s, str>>,

    /// A unique identifier for the report in the form of a GUID.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub guid: Option<Uuid>,

    /// A set of unique identifies in the form of a GUID by which this report was known in some
    /// previous version of the analysis tool.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "BTreeSet::is_empty")
    )]
    pub deprecated_guids: BTreeSet<Uuid>,

    /// A report identifier that is understandable to an end user.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none")
    )]
    pub name: Option<Cow<'s, str>>,

    /// A set of readable identifiers by which this report was known in some previous version of
    /// the analysis tool.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeSet::is_empty")
    )]
    pub deprecated_names: BTreeSet<Cow<'s, str>>,

    /// A concise description of the report.
    ///
    /// Should be a single sentence that is understandable when visible space is limited to a
    /// single line of text.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none")
    )]
    pub short_description: Option<MultiformatMessageString<'s>>,

    /// A description of the report.
    ///
    /// Should, as far as possible, provide details sufficient to enable resolution of any problem
    /// indicated by the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none")
    )]
    pub full_description: Option<MultiformatMessageString<'s>>,

    /// A set of name/value pairs with arbitrary names.
    ///
    /// Each value is a [`MultiformatMessageString`] object, which holds message strings in plain
    /// text and (optionally) Markdown format. The strings can include placeholders, which can
    /// be used to construct a message in combination with an arbitrary number of additional
    /// string arguments.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub message_strings: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// Provides the primary documentation for the report, useful when there is no online
    /// documentation.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none")
    )]
    pub help: Option<MultiformatMessageString<'s>>,

    /// A URI where the primary documentation for the report can be found.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub help_uri: Option<Url>,
}

impl<'s> ReportingDescriptor<'s> {
    /// Creates a new `ReportingDescriptor`.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ReportingDescriptor;
    ///
    /// let descriptor = ReportingDescriptor::new("E0308");
    ///
    /// assert_eq!(descriptor.id, "E0308");
    /// ```
    #[must_use]
    pub fn new(id: impl Into<Cow<'s, str>>) -> Self {
        Self {
            id: id.into(),
            deprecated_ids: BTreeSet::new(),
            guid: None,
            deprecated_guids: BTreeSet::new(),
            name: None,
            deprecated_names: BTreeSet::new(),
            short_description: None,
            full_description: None,
            message_strings: BTreeMap::new(),
            help: None,
            help_uri: None,
        }
    }

    /// Sets the stable, opaque identifier for the report.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ReportingDescriptor;
    ///
    /// let descriptor = ReportingDescriptor::new("E0308").with_id("E0308");
    ///
    /// assert_eq!(descriptor.id, "E0308");
    /// ```
    #[must_use]
    pub fn with_id(mut self, id: impl Into<Cow<'s, str>>) -> Self {
        self.id = id.into();
        self
    }

    /// Adds a stable, opaque identifier by which this report was known in some previous version
    /// of the analysis tool.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ReportingDescriptor;
    ///
    /// let descriptor = ReportingDescriptor::new("E0308")
    ///     .with_deprecated_id("E0308_deprecated_1")
    ///     .with_deprecated_id("E0308_deprecated_2");
    ///
    /// assert_eq!(descriptor.deprecated_ids.len(), 2);
    /// assert!(descriptor.deprecated_ids.contains("E0308_deprecated_1"));
    /// assert!(descriptor.deprecated_ids.contains("E0308_deprecated_2"));
    /// ```
    #[must_use]
    pub fn with_deprecated_id(mut self, id: impl Into<Cow<'s, str>>) -> Self {
        self.deprecated_ids.insert(id.into());
        self
    }

    /// Sets the name of the `ReportingDescriptor`.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ReportingDescriptor;
    ///
    /// let descriptor = ReportingDescriptor::new("E0308").with_name("mismatched types");
    ///
    /// assert_eq!(descriptor.name.unwrap(), "mismatched types");
    /// ```
    #[must_use]
    pub fn with_name(mut self, name: impl Into<Cow<'s, str>>) -> Self {
        self.name = Some(name.into());
        self
    }

    /// Adds a readable identifier by which this report was known in some previous version of
    /// the analysis tool.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ReportingDescriptor;
    ///
    /// let descriptor = ReportingDescriptor::new("E0308")
    ///     .with_deprecated_name("mismatched types (deprecated 1)")
    ///     .with_deprecated_name("mismatched types (deprecated 2)");
    ///
    /// assert_eq!(descriptor.deprecated_names.len(), 2);
    /// assert!(
    ///     descriptor
    ///         .deprecated_names
    ///         .contains("mismatched types (deprecated 1)")
    /// );
    /// assert!(
    ///     descriptor
    ///         .deprecated_names
    ///         .contains("mismatched types (deprecated 2)")
    /// );
    /// ```
    #[must_use]
    pub fn with_deprecated_name(mut self, name: impl Into<Cow<'s, str>>) -> Self {
        self.deprecated_names.insert(name.into());
        self
    }

    /// Sets the short description of the `ReportingDescriptor`.
    #[must_use]
    pub fn with_short_description(
        mut self,
        short_description: MultiformatMessageString<'s>,
    ) -> Self {
        self.short_description = Some(short_description);
        self
    }

    /// Sets the full description of the `ReportingDescriptor`.
    #[must_use]
    pub fn with_full_description(mut self, full_description: MultiformatMessageString<'s>) -> Self {
        self.full_description = Some(full_description);
        self
    }

    /// Adds a message string to the `ReportingDescriptor`.
    #[must_use]
    pub fn with_message_string(
        mut self,
        key: impl Into<Cow<'s, str>>,
        message_string: MultiformatMessageString<'s>,
    ) -> Self {
        self.message_strings.insert(key.into(), message_string);
        self
    }

    /// Sets the help of the `ReportingDescriptor`.
    #[must_use]
    pub fn with_help(mut self, help: MultiformatMessageString<'s>) -> Self {
        self.help = Some(help);
        self
    }

    /// Sets the help URI of the `ReportingDescriptor`.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ReportingDescriptor;
    /// use url::Url;
    ///
    /// let descriptor = ReportingDescriptor::new("E0308").with_help_uri(Url::parse(
    ///     "https://doc.rust-lang.org/error-index.html#E0308",
    /// )?);
    ///
    /// assert_eq!(
    ///     descriptor.help_uri.unwrap().as_str(),
    ///     "https://doc.rust-lang.org/error-index.html#E0308"
    /// );
    /// # Ok::<(), url::ParseError>(())
    /// ```
    #[must_use]
    pub fn with_help_uri(mut self, help_uri: impl Into<Url>) -> Self {
        self.help_uri = Some(help_uri.into());
        self
    }
}

#[cfg(all(feature = "serde", test))]
mod tests {
    use alloc::{
        borrow::Cow,
        format,
        string::{String, ToString as _},
    };
    use std::{io, process::Command};

    use url::Url;

    use crate::schema::{MultiformatMessageString, PropertyBag, ReportingDescriptor};

    fn error_code_to_uri(code: u32) -> String {
        format!("https://doc.rust-lang.org/error-index.html#E{code:04}")
    }

    fn error_code_to_help(code: u32) -> io::Result<String> {
        let explain_command = Command::new("rustc")
            .arg("--explain")
            .arg(format!("E{code:04}"))
            .output()?;

        Ok(String::from_utf8_lossy(&explain_command.stdout).to_string())
    }

    #[test]
    fn error_308() {
        let code = 308;
        let uri = error_code_to_uri(code);
        let help = error_code_to_help(code).expect("failed to get help message");

        let descriptor = ReportingDescriptor::new(format!("E{code:04}"))
            .with_name("mismatched types")
            .with_short_description(MultiformatMessageString {
                text: Cow::Borrowed("Expected type did not match the received type."),
                markdown: None,
                properties: PropertyBag::default(),
            })
            .with_full_description(MultiformatMessageString {
                text: Cow::Borrowed("The compiler expected one type but found another."),
                markdown: None,
                properties: PropertyBag::default(),
            })
            .with_help(MultiformatMessageString {
                text: Cow::Borrowed(&help),
                markdown: None,
                properties: PropertyBag::default(),
            })
            .with_help_uri(Url::parse(&uri).expect("failed to parse URL"));

        assert_eq!(descriptor.id, format!("E{code:04}"));
        assert_eq!(
            descriptor.name.expect("name was not set"),
            "mismatched types"
        );
        assert_eq!(
            descriptor
                .short_description
                .expect("short description was not set")
                .text,
            "Expected type did not match the received type."
        );
        assert_eq!(
            descriptor
                .full_description
                .expect("full description was not set")
                .text,
            "The compiler expected one type but found another."
        );
        assert_eq!(descriptor.help.expect("help text was not set").text, help);
        assert_eq!(
            descriptor.help_uri.expect("help URI was not set").as_str(),
            uri
        );
    }
}
