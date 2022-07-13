use std::{fmt, result::Result as StdResult, str::FromStr};

use error_stack::{Context, IntoReport, Report, Result, ResultExt};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

pub type BaseId = String;
pub type BaseIdRef = str;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct VersionedUri {
    base_id: BaseId,
    version: u32,
}

impl VersionedUri {
    /// Creates a new `VersionedUri` from the given `base_id` and `version`.
    #[must_use]
    pub const fn new(base_id: BaseId, version: u32) -> Self {
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

impl fmt::Display for VersionedUri {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}/v/{}", self.base_id, self.version)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseUriError;

impl fmt::Display for ParseUriError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("provided string does not contain a valid version")
    }
}

impl Context for ParseUriError {}

impl FromStr for VersionedUri {
    type Err = Report<ParseUriError>;

    fn from_str(uri: &str) -> Result<Self, ParseUriError> {
        let (base_id, version) = uri.rsplit_once("/v/").ok_or(ParseUriError)?;

        Ok(Self::new(
            base_id.to_owned(),
            version.parse().report().change_context(ParseUriError)?,
        ))
    }
}

impl Serialize for VersionedUri {
    fn serialize<S>(&self, serializer: S) -> StdResult<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.to_string().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for VersionedUri {
    fn deserialize<D>(deserializer: D) -> StdResult<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        String::deserialize(deserializer)?
            .parse()
            .map_err(de::Error::custom)
    }
}
