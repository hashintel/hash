use core::{error, str::FromStr as _};

use hashql_core::collections::FastHashMap;

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub(crate) enum DirectiveParseError {
    /// The annotation format is invalid (missing colon separator).
    #[display("invalid annotation format: {_0}, must be of form `//@<key>: <value>`")]
    InvalidFormat(String),
    /// Unknown run mode specified.
    #[display("unknown run mode: {_0}, must be one of `pass`, `fail`, or `skip`")]
    UnknownRunMode(String),
    /// Name cannot be empty.
    #[display("name cannot be empty")]
    EmptyName,
    /// Unknown property key.
    #[display("unknown property key: {_0} with value: {_1}")]
    UnknownPropertyKey(String, String),
    /// Invalid TOML value.
    #[display("invalid TOML value: {_0} for key: {_1}")]
    InvalidToml(String, String, Box<toml::de::Error>),
}

impl error::Error for DirectiveParseError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::InvalidToml(_, _, error) => Some(error),
            Self::InvalidFormat(_)
            | Self::UnknownRunMode(_)
            | Self::EmptyName
            | Self::UnknownPropertyKey(..) => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub(crate) enum RunMode {
    Pass,
    #[default]
    Fail,
    Skip {
        reason: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Directive {
    pub name: String,
    pub description: Option<String>,
    pub run: RunMode,
    pub suite: FastHashMap<String, toml::Value>,
}

impl Directive {
    pub(crate) const MARKER: &'static str = "//@";

    pub(crate) fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: None,
            run: RunMode::default(),
            suite: FastHashMap::default(),
        }
    }

    /// Parses a property annotation string and updates self accordingly.
    ///
    /// # Errors
    ///
    /// If an annotation is malformed.
    pub(crate) fn parse(&mut self, value: &str) -> Result<(), DirectiveParseError> {
        let (key, value) = value
            .split_once(':')
            .ok_or_else(|| DirectiveParseError::InvalidFormat(value.to_owned()))?;

        let key = key.trim();
        let value = value.trim();

        match (key, value) {
            ("run", "pass") => self.run = RunMode::Pass,
            ("run", "fail") => self.run = RunMode::Fail,
            ("run", "skip") => self.run = RunMode::Skip { reason: None },
            ("run", value) if let Some(mut reason) = value.strip_prefix("skip reason=") => {
                reason = reason.trim_matches('"');

                self.run = RunMode::Skip {
                    reason: Some(reason.to_owned()),
                };
            }
            ("run", value) => {
                return Err(DirectiveParseError::UnknownRunMode(value.to_owned()));
            }
            ("name", "") => {
                return Err(DirectiveParseError::EmptyName);
            }
            ("name", name) => {
                name.clone_into(&mut self.name);
            }
            ("description", "") => {
                self.description = None;
            }
            ("description", description) => {
                self.description = Some(description.to_owned());
            }
            (key, value) if let Some(suite_key) = key.strip_prefix("suite#") => {
                let value = toml::Value::from_str(value).map_err(|error| {
                    DirectiveParseError::InvalidToml(
                        key.to_owned(),
                        value.to_owned(),
                        Box::new(error),
                    )
                })?;

                self.suite.insert(suite_key.to_owned(), value);
            }
            (key, value) => {
                return Err(DirectiveParseError::UnknownPropertyKey(
                    key.to_owned(),
                    value.to_owned(),
                ));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use crate::annotation::directive::{Directive, DirectiveParseError, RunMode};

    #[test]
    fn parse_run_mode_pass() {
        let mut directive = Directive::new("test");
        directive
            .parse("run: pass")
            .expect("should successfully parse 'run: pass'");

        assert_eq!(directive.run, RunMode::Pass);
    }

    #[test]
    fn parse_run_mode_pass_without_space() {
        let mut directive = Directive::new("test");
        directive
            .parse("run:pass")
            .expect("should successfully parse 'run:pass'");

        assert_eq!(directive.run, RunMode::Pass);
    }

    #[test]
    fn parse_run_mode_fail() {
        let mut directive = Directive::new("test");
        directive
            .parse("run: fail")
            .expect("should successfully parse 'run: fail'");

        assert_eq!(directive.run, RunMode::Fail);
    }

    #[test]
    fn parse_run_mode_skip() {
        let mut directive = Directive::new("test");
        directive
            .parse("run: skip")
            .expect("should successfully parse 'run: skip'");

        assert_eq!(directive.run, RunMode::Skip { reason: None });
    }

    #[test]
    fn parse_run_mode_skip_with_reason() {
        let mut directive = Directive::new("test");
        directive
            .parse("run: skip reason=reason")
            .expect("should successfully parse 'run: skip reason=reason'");

        assert_eq!(
            directive.run,
            RunMode::Skip {
                reason: Some("reason".to_owned())
            }
        );
    }

    #[test]
    fn parse_invalid_format() {
        let mut directive = Directive::new("test");
        let error = directive
            .parse("run without colon")
            .expect_err("should fail when missing colon separator");

        assert_matches!(error, DirectiveParseError::InvalidFormat(_));
    }

    #[test]
    fn parse_unknown_run_mode() {
        let mut directive = Directive::new("test");
        let error = directive
            .parse("run: invalid")
            .expect_err("should fail with unknown run mode");

        assert_matches!(
            error,
            DirectiveParseError::UnknownRunMode(mode) if mode == "invalid"
        );
    }

    #[test]
    fn parse_unknown_property_key() {
        let mut directive = Directive::new("test");
        let error = directive
            .parse("unknown: value")
            .expect_err("should fail with unknown property key");

        assert_matches!(
            error,
            DirectiveParseError::UnknownPropertyKey(key, value) if key == "unknown" && value == "value"
        );
    }

    #[test]
    fn parse_with_whitespace() {
        let mut directive = Directive::new("test");
        directive
            .parse("  run  :  pass  ")
            .expect("should handle extra whitespace");

        assert_eq!(directive.run, RunMode::Pass);
    }

    #[test]
    fn parse_multiple_directives() {
        let mut directive = Directive::new("test");

        // Set to pass
        directive
            .parse("run: pass")
            .expect("should successfully parse first directive");
        assert_eq!(directive.run, RunMode::Pass);

        // Change to skip
        directive
            .parse("run: skip")
            .expect("should successfully parse second directive");
        assert_eq!(directive.run, RunMode::Skip { reason: None });

        // Change back to fail
        directive
            .parse("run: fail")
            .expect("should successfully parse third directive");
        assert_eq!(directive.run, RunMode::Fail);
    }

    #[test]
    fn parse_case_sensitivity() {
        // Test that the parser is case-sensitive for directive values
        let mut directive = Directive::new("test");

        let error = directive
            .parse("run: PASS")
            .expect_err("should fail with uppercase run mode");

        assert_matches!(
            error,
            DirectiveParseError::UnknownRunMode(mode) if mode == "PASS"
        );

        let error = directive
            .parse("RUN: pass")
            .expect_err("should fail with uppercase key");

        assert_matches!(
            error,
            DirectiveParseError::UnknownPropertyKey(key, value) if key == "RUN" && value == "pass"
        );
    }

    #[test]
    fn parse_empty_values() {
        let mut directive = Directive::new("test");

        // Empty value
        let error = directive
            .parse("run: ")
            .expect_err("should fail with empty value");
        assert_matches!(error, DirectiveParseError::UnknownRunMode(mode) if mode.is_empty());

        // Empty key
        let error = directive
            .parse(": value")
            .expect_err("should fail with empty key");
        assert_matches!(error, DirectiveParseError::UnknownPropertyKey(key, value) if key.is_empty() && value == "value");

        // Just a colon
        let error = directive
            .parse(":")
            .expect_err("should fail with just a colon");
        assert_matches!(error, DirectiveParseError::UnknownPropertyKey(key, value) if key.is_empty() && value.is_empty());
    }

    #[test]
    fn parse_name() {
        let mut directive = Directive::new("test");

        // Valid name
        directive
            .parse("name: example")
            .expect("should parse name directive");
        assert_eq!(directive.name, "example");

        // Invalid name
        let error = directive
            .parse("name: ")
            .expect_err("should fail with invalid name");
        assert_matches!(error, DirectiveParseError::EmptyName);
    }

    #[test]
    fn default_directive() {
        // Verify the default is RunMode::Fail
        let directive = Directive::new("test");
        assert_eq!(
            directive.run,
            RunMode::Fail,
            "default run mode should be Fail"
        );
    }
}
