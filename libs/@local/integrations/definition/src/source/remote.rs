use alloc::{boxed::Box, collections::BTreeMap, string::String};
use core::num::{NonZeroU16, NonZeroU64};

use serde::Deserialize;
use uuid::Uuid;

/// A User Secret entity in the run owner's web.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecretReference {
    pub secret_entity_uuid: Uuid,
}

/// TLS verification for PostgreSQL and Redshift connections.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SslMode {
    Disable,
    Require,
    #[default]
    VerifyFull,
}

/// A table accessible through the PostgreSQL protocol, including Redshift.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostgresSource {
    pub host: Box<str>,
    #[serde(default = "default_port")]
    pub port: NonZeroU16,
    pub database: Box<str>,
    pub schema: Box<str>,
    pub table: Box<str>,
    #[serde(default)]
    pub ssl_mode: SslMode,
    pub credentials: SecretReference,
}

const fn default_port() -> NonZeroU16 {
    NonZeroU16::new(5432).expect("the PostgreSQL port should be nonzero")
}

impl PostgresSource {
    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        if [&self.host, &self.database, &self.schema, &self.table]
            .iter()
            .any(|value| value.trim().is_empty() || value.contains('\0'))
        {
            return Err("host, database, schema and table must be nonempty and contain no NUL");
        }
        Ok(())
    }
}

/// Authentication supplied by a User Secret whose JSON object contains `value`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "lowercase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RestAuth {
    Header {
        name: String,
        secret_entity_uuid: Uuid,
    },
    Bearer {
        secret_entity_uuid: Uuid,
    },
}

impl RestAuth {
    #[must_use]
    pub const fn reference(&self) -> SecretReference {
        SecretReference {
            secret_entity_uuid: match self {
                Self::Header {
                    secret_entity_uuid, ..
                }
                | Self::Bearer { secret_entity_uuid } => *secret_entity_uuid,
            },
        }
    }
}

/// How the next page is selected from a REST response.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Pagination {
    NextLink { field: String },
    Offset,
}

/// A paginated JSON endpoint. Response cells are captured as nullable strings.
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestSource {
    pub url: String,
    #[serde(default)]
    pub params: BTreeMap<String, String>,
    pub auth: Option<RestAuth>,
    pub results_field: Option<String>,
    pub pagination: Option<Pagination>,
    #[serde(default = "default_page_size")]
    pub page_size: NonZeroU64,
    pub max_pages: Option<NonZeroU64>,
    #[serde(default)]
    pub rate_limit_ms: u64,
}

const fn default_page_size() -> NonZeroU64 {
    NonZeroU64::new(100).expect("the page size should be nonzero")
}

impl RestSource {
    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        if self.url.trim().is_empty() {
            return Err("REST URL must be nonempty");
        }
        if self.rate_limit_ms > 86_400_000 {
            return Err("REST request interval must not exceed one day");
        }
        Ok(())
    }
}

impl core::fmt::Debug for RestSource {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("RestSource")
            .field("url", &"<redacted>")
            .field("params", &"<redacted>")
            .field("auth", &self.auth)
            .field("results_field", &self.results_field)
            .field("pagination", &self.pagination)
            .field("page_size", &self.page_size)
            .field("max_pages", &self.max_pages)
            .field("rate_limit_ms", &self.rate_limit_ms)
            .finish()
    }
}
