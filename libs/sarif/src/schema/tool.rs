use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::PropertyBag;

/// The analysis tool that was run.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Tool {
    /// The analysis tool that was run.
    pub driver: ToolComponent,

    /// Tool extensions that contributed to or reconfigured the analysis tool that was run.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Vec::is_empty")
    )]
    pub extensions: Vec<ToolComponent>,

    /// Key/value pairs that provide additional information about the tool.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag,
}

impl Tool {
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
    pub const fn new(driver: ToolComponent) -> Self {
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
    /// assert_eq!(tool.extensions, vec![
    ///     ToolComponent::new("prettier-plugin-packagejson"),
    ///     ToolComponent::new("prettier-plugin-sh"),
    ///     ToolComponent::new("prettier-plugin-sql"),
    /// ]);
    /// ```
    #[must_use]
    pub fn with_extension(mut self, extension: ToolComponent) -> Self {
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
    /// assert_eq!(tool.extensions, vec![
    ///     ToolComponent::new("prettier-plugin-packagejson"),
    ///     ToolComponent::new("prettier-plugin-sh"),
    ///     ToolComponent::new("prettier-plugin-sql"),
    /// ]);
    /// ```
    #[must_use]
    pub fn with_extensions(mut self, extension: impl IntoIterator<Item = ToolComponent>) -> Self {
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
        mut properties: impl FnMut(PropertyBag) -> PropertyBag,
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
pub struct ToolComponent {
    /// The name of the tool component.
    pub name: Cow<'static, str>,
}

impl ToolComponent {
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
    pub fn new(name: impl Into<Cow<'static, str>>) -> Self {
        Self { name: name.into() }
    }
}
