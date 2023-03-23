use alloc::borrow::Cow;

use serde::{Deserialize, Serialize};

/// Metadata that describes a specific report produced by the tool, as part of the analysis it
/// provides or its runtime reporting.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[non_exhaustive]
pub struct ReportingDescriptor {
    /// A stable, opaque identifier for the report.
    pub id: Cow<'static, str>,

    /// A report identifier that is understandable to an end user.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub name: Option<Cow<'static, str>>,
}

impl ReportingDescriptor {
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
    pub fn new(id: impl Into<Cow<'static, str>>) -> Self {
        Self {
            id: id.into(),
            name: None,
        }
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
    pub fn with_name(mut self, name: impl Into<Cow<'static, str>>) -> Self {
        self.name = Some(name.into());
        self
    }
}
