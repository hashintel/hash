use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// The analysis tool that was run.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[non_exhaustive]
pub struct Tool {
    /// The analysis tool that was run.
    pub driver: ToolComponent,
}

impl Tool {
    /// Create a new `Tool` with the given driver.
    #[must_use]
    pub const fn new(driver: ToolComponent) -> Self {
        Self { driver }
    }
}

/// A component, such as a plug-in or the driver, of the analysis tool that was run.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
    pub fn new(name: impl Into<Cow<'static, str>>) -> Self {
        Self { name: name.into() }
    }
}
