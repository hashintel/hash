use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{PropertyBag, ReportingDescriptor};

/// The analysis tool that was run.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Tool<'s> {
    /// The analysis tool that was run.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub driver: ToolComponent<'s>,

    /// Tool extensions that contributed to or reconfigured the analysis tool that was run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub extensions: Vec<ToolComponent<'s>>,

    /// Key/value pairs that provide additional information about the tool.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}

impl<'s> Tool<'s> {
    /// Create a new `Tool` with the given driver.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{Tool, ToolComponent};
    ///
    /// let tool = Tool::new(ToolComponent::new("prettier"));
    ///
    /// assert_eq!(tool.driver.name, "prettier");
    /// assert!(tool.extensions.is_empty());
    /// assert!(tool.properties.is_empty());
    /// ```
    #[must_use]
    pub const fn new(driver: ToolComponent<'s>) -> Self {
        Self {
            driver,
            extensions: Vec::new(),
            properties: PropertyBag::new(),
        }
    }

    /// Add an extension to the tool.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{Tool, ToolComponent};
    ///
    /// let tool = Tool::new(ToolComponent::new("prettier"))
    ///     .with_extension(ToolComponent::new("prettier-plugin-packagejson"))
    ///     .with_extension(ToolComponent::new("prettier-plugin-sh"))
    ///     .with_extension(ToolComponent::new("prettier-plugin-sql"));
    ///
    /// assert_eq!(
    ///     tool.extensions,
    ///     vec![
    ///         ToolComponent::new("prettier-plugin-packagejson"),
    ///         ToolComponent::new("prettier-plugin-sh"),
    ///         ToolComponent::new("prettier-plugin-sql"),
    ///     ]
    /// );
    /// ```
    #[must_use]
    pub fn with_extension(mut self, extension: ToolComponent<'s>) -> Self {
        self.extensions.push(extension);
        self
    }

    /// Add extensions to the tool.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{Tool, ToolComponent};
    ///
    /// let tool = Tool::new(ToolComponent::new("prettier")).with_extensions([
    ///     ToolComponent::new("prettier-plugin-packagejson"),
    ///     ToolComponent::new("prettier-plugin-sh"),
    ///     ToolComponent::new("prettier-plugin-sql"),
    /// ]);
    ///
    /// assert_eq!(
    ///     tool.extensions,
    ///     vec![
    ///         ToolComponent::new("prettier-plugin-packagejson"),
    ///         ToolComponent::new("prettier-plugin-sh"),
    ///         ToolComponent::new("prettier-plugin-sql"),
    ///     ]
    /// );
    /// ```
    #[must_use]
    pub fn with_extensions(
        mut self,
        extension: impl IntoIterator<Item = ToolComponent<'s>>,
    ) -> Self {
        self.extensions.extend(extension);
        self
    }

    /// Add a property to the tool.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{Tool, ToolComponent};
    ///
    /// let tool = Tool::new(ToolComponent::new("clippy")).with_properties(|properties| {
    ///     properties
    ///         .with_property("precision", "high")
    ///         .with_tag("code-quality")
    ///         .with_tag("static-analysis")
    /// });
    ///
    /// assert_eq!(
    ///     tool.properties.additional.get("precision"),
    ///     Some(&"high".into())
    /// );
    /// assert!(
    ///     tool.properties
    ///         .tags
    ///         .iter()
    ///         .eq(["code-quality", "static-analysis"])
    /// );
    /// ```
    #[must_use]
    pub fn with_properties(
        mut self,
        properties: impl FnOnce(PropertyBag<'s>) -> PropertyBag<'s>,
    ) -> Self {
        self.properties = properties(self.properties);
        self
    }
}

/// A component, such as a plug-in or the driver, of the analysis tool that was run.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[non_exhaustive]
pub struct ToolComponent<'s> {
    /// The name of the tool component.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub name: Cow<'s, str>,

    /// The tool component version, in whatever format the component natively provides.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none")
    )]
    pub version: Option<Cow<'s, str>>,

    /// The tool component version in the format specified by Semantic Versioning 2.0.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub semantic_version: Option<semver::Version>,

    /// An array of [`ReportingDescriptor`]s relevant to the analysis performed by the tool
    /// component.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub rules: Vec<ReportingDescriptor<'s>>,
}

impl<'s> ToolComponent<'s> {
    /// Create a new `ToolComponent` with the given name.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ToolComponent;
    ///
    /// let tool_component = ToolComponent::new("prettier");
    ///
    /// assert_eq!(tool_component.name, "prettier");
    /// ```
    pub fn new(name: impl Into<Cow<'s, str>>) -> Self {
        Self {
            name: name.into(),
            version: None,
            semantic_version: None,
            rules: Vec::new(),
        }
    }

    /// Set the version of the tool component.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ToolComponent;
    ///
    /// let tool_component = ToolComponent::new("rustc").with_version("1.70.0");
    ///
    /// assert_eq!(tool_component.version, Some("1.70.0".into()));
    /// ```
    #[must_use]
    pub fn with_version(mut self, version: impl Into<Cow<'s, str>>) -> Self {
        self.version = Some(version.into());
        self
    }

    /// Set the semantic version of the tool component.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::ToolComponent;
    ///
    /// let tool_component =
    ///     ToolComponent::new("rustc").with_semantic_version(semver::Version::new(1, 70, 0));
    ///
    /// assert_eq!(
    ///     tool_component.semantic_version,
    ///     Some(semver::Version::new(1, 70, 0))
    /// );
    /// ```
    #[must_use]
    pub fn with_semantic_version(mut self, version: semver::Version) -> Self {
        self.semantic_version = Some(version);
        self
    }

    /// Add a rule to the tool component.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{ReportingDescriptor, ToolComponent};
    ///
    /// let tool_component = ToolComponent::new("rustc").with_rule(ReportingDescriptor::new("E0308"));
    ///
    /// assert_eq!(tool_component.rules[0].id, "E0308");
    /// ```
    #[must_use]
    pub fn with_rule(mut self, rule: ReportingDescriptor<'s>) -> Self {
        self.rules.push(rule);
        self
    }

    /// Add rules to the tool component.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{ReportingDescriptor, ToolComponent};
    ///
    /// let tool_component = ToolComponent::new("rustc")
    ///     .with_rules(vec![
    ///         ReportingDescriptor::new("E0308"),
    ///         ReportingDescriptor::new("E0309"),
    ///     ])
    ///     .with_rules([
    ///         ReportingDescriptor::new("E0310"),
    ///         ReportingDescriptor::new("E0311"),
    ///     ]);
    ///
    /// assert_eq!(tool_component.rules[0].id, "E0308");
    /// assert_eq!(tool_component.rules[1].id, "E0309");
    /// assert_eq!(tool_component.rules[2].id, "E0310");
    /// assert_eq!(tool_component.rules[3].id, "E0311");
    /// ```
    #[must_use]
    pub fn with_rules(mut self, rules: impl IntoIterator<Item = ReportingDescriptor<'s>>) -> Self {
        self.rules.extend(rules);
        self
    }
}
