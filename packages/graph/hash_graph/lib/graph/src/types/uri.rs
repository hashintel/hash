use std::{fmt, num::ParseIntError, result::Result as StdResult, str::FromStr};

use error_stack::{ensure, Context, Report};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

pub type BaseId = String;
pub type BaseIdRef = str;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Uri {
    base_id: String,
    version: u32,
}

impl Uri {
    /// Creates a new `Uri` from the given `base_id` and `version`.
    #[must_use]
    pub const fn new(base_id: String, version: u32) -> Self {
        Self { base_id, version }
    }

    #[must_use]
    pub fn base_id(&self) -> &BaseIdRef {
        &self.base_id
    }

    #[must_use]
    pub const fn version(&self) -> u32 {
        self.version
    }
}

impl fmt::Display for Uri {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}/v/{}", self.base_id, self.version)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum UriErrorKind {
    NoVersion,
    MultipleVersions,
    InvalidVersion(ParseIntError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseUriError {
    kind: UriErrorKind,
}

impl fmt::Display for ParseUriError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.kind {
            UriErrorKind::NoVersion => fmt.write_str("No version encoded in URI"),
            UriErrorKind::MultipleVersions => fmt.write_str("Multiple versions encoded in URI"),
            UriErrorKind::InvalidVersion(error) => fmt::Display::fmt(&error, fmt),
        }
    }
}

impl Context for ParseUriError {}

impl FromStr for Uri {
    type Err = Report<ParseUriError>;

    fn from_str(uri: &str) -> std::result::Result<Self, Self::Err> {
        let mut split = uri.split("/v/");
        let base_id = split.next().ok_or(ParseUriError {
            kind: UriErrorKind::NoVersion,
        })?;
        let version = split.next().ok_or(ParseUriError {
            kind: UriErrorKind::NoVersion,
        })?;
        ensure!(split.next().is_none(), ParseUriError {
            kind: UriErrorKind::MultipleVersions
        });

        Ok(Self::new(
            base_id.to_owned(),
            version.parse().map_err(|error| ParseUriError {
                kind: UriErrorKind::InvalidVersion(error),
            })?,
        ))
    }
}

impl Serialize for Uri {
    fn serialize<S>(&self, serializer: S) -> StdResult<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.to_string().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for Uri {
    fn deserialize<D>(deserializer: D) -> StdResult<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        String::deserialize(deserializer)?
            .parse()
            .map_err(de::Error::custom)
    }
}
