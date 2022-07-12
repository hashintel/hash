use std::{fmt, num::ParseIntError, result::Result as StdResult, str::FromStr};

use error_stack::{ensure, Context, Report};
use serde::{de, Deserialize, Deserializer, Serialize};

pub type BaseId = String;
pub type BaseIdRef = str;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, sqlx::Type)]
#[serde(transparent)]
#[sqlx(transparent)]
// TODO: Change representation to store the version directly
pub struct Uri(String);

impl Uri {
    /// Creates a new `Uri` from the given `base_id` and `version`.
    #[must_use]
    pub fn new(base_id: &str, version: u32) -> Self {
        Self(format!("{base_id}/v/{version}"))
    }

    #[must_use]
    pub fn base_id(&self) -> &BaseIdRef {
        self.0
            .split_once("/v/")
            .unwrap_or_else(|| unreachable!("URI was validated before"))
            .0
    }

    #[must_use]
    pub fn version(&self) -> u32 {
        self.0
            .split_once("/v/")
            .unwrap_or_else(|| unreachable!("URI was validated before"))
            .1
            .parse()
            .unwrap_or_else(|_| unreachable!("URI was validated before"))
    }
}

impl fmt::Display for Uri {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}", self.0)
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
            base_id,
            version.parse().map_err(|error| ParseUriError {
                kind: UriErrorKind::InvalidVersion(error),
            })?,
        ))
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
