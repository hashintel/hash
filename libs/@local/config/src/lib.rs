//! Layered configuration for HASH binaries.
//!
//! # Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

mod defaults;
mod error;

use core::fmt;

use error_stack::Report;
use figment::Figment;
use serde_core::{Serialize, de::DeserializeOwned};

pub use self::error::LoadError;
use self::{defaults::Defaults, error::load_report};

/// Builds a configuration from layered sources.
///
/// # Examples
///
/// ```
/// #[derive(serde::Deserialize)]
/// struct Config {
///     host: String,
/// }
///
/// let config = hash_config::Loader::new()
///     .with_defaults(serde_json::json!({ "host": "localhost" }))
///     .load::<Config>()?;
///
/// assert_eq!(config.host, "localhost");
/// # Ok::<(), error_stack::Report<hash_config::LoadError>>(())
/// ```
#[derive(Default)]
pub struct Loader {
    defaults: Figment,
}

impl fmt::Debug for Loader {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Loader")
            .field(
                "layers",
                &self
                    .defaults
                    .metadata()
                    .map(|metadata| &metadata.name)
                    .collect::<Vec<_>>(),
            )
            .finish_non_exhaustive()
    }
}

impl Loader {
    /// Creates a loader with no configuration values.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds values to the programmatic default layer.
    ///
    /// Repeated calls are applied in order: later values replace earlier scalars and arrays, while
    /// maps merge recursively. Each value must serialize to a map; serialization and shape errors
    /// are reported by [`load`](Self::load) and name this call.
    #[must_use]
    #[track_caller]
    pub fn with_defaults(mut self, values: impl Serialize) -> Self {
        self.defaults = self.defaults.merge(Defaults::new(values));
        self
    }

    /// Deserializes the merged values into `C`.
    ///
    /// # Errors
    ///
    /// Returns [`LoadError::Invalid`] when a value does not fit `C`, when a required value is not
    /// set, or when a default does not serialize to a map. The report names the key, the shape
    /// that was expected, and the layer the key came from. Configuration values never appear in a
    /// report, so it is safe to log one in full.
    #[track_caller]
    pub fn load<C>(self) -> Result<C, Report<LoadError>>
    where
        C: DeserializeOwned,
    {
        match self.defaults.extract::<C>() {
            Ok(value) => Ok(value),
            Err(error) => Err(load_report(error)),
        }
    }
}
