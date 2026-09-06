//! Layered configuration for HASH binaries.
//!
//! # Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

mod defaults;
mod error;
mod file;

use core::fmt;
use std::path::PathBuf;

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
    files: Vec<PathBuf>,
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
            .field("files", &self.files)
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

    /// Adds a required TOML file above the programmatic defaults.
    ///
    /// Files are read by [`load`](Self::load), in the order they were added. Later files replace
    /// earlier scalars and arrays, while maps merge recursively. Every file takes precedence over
    /// every default, regardless of the order of builder calls. Relative paths resolve against the
    /// working directory at load time; the file extension does not select the format.
    ///
    /// # Examples
    ///
    /// ```
    /// #[derive(serde::Deserialize)]
    /// struct Config {
    ///     host: String,
    ///     port: u16,
    /// }
    ///
    /// # figment::Jail::expect_with(|jail| {
    /// # jail.create_file("hash-graph.toml", "host = 'localhost'\n")?;
    /// let config = hash_config::Loader::new()
    ///     .with_defaults(serde_json::json!({ "port": 5432 }))
    ///     .with_file("hash-graph.toml")
    ///     .load::<Config>()
    ///     .expect("the configuration file should load");
    ///
    /// assert_eq!(config.host, "localhost");
    /// assert_eq!(config.port, 5432);
    /// # Ok(())
    /// # });
    /// ```
    #[must_use]
    pub fn with_file(mut self, path: impl Into<PathBuf>) -> Self {
        self.files.push(path.into());
        self
    }

    /// Deserializes the merged values into `C`.
    ///
    /// # Errors
    ///
    /// - [`LoadError::Invalid`] if a value does not fit `C`, a required value is missing, or a
    ///   default does not serialize to a map.
    /// - [`LoadError::ReadFile`] if a required file is absent, unreadable, or not UTF-8.
    /// - [`LoadError::ParseFile`] if a file does not contain valid TOML.
    ///
    /// The report names the key, expected shape, and source when available. Rejected values and
    /// TOML source excerpts are withheld.
    #[track_caller]
    pub fn load<C>(self) -> Result<C, Report<LoadError>>
    where
        C: DeserializeOwned,
    {
        let mut values = self.defaults;
        for path in self.files {
            values = values.merge(file::File::read(path)?);
        }

        match values.extract::<C>() {
            Ok(value) => Ok(value),
            Err(error) => Err(load_report(error)),
        }
    }
}
