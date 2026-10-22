use alloc::{boxed::Box, collections::BTreeMap, string::String};
use core::num::NonZeroU64;

use serde::Deserialize;
use url::Url;
use uuid::Uuid;

/// A User Secret entity in the run owner's web.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecretReference {
    pub secret_entity_uuid: Uuid,
}

/// A table accessible through the PostgreSQL protocol, including Redshift.
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostgresSource {
    pub connection: Url,
    pub schema: Box<str>,
    pub table: Box<str>,
    pub credentials: SecretReference,
}

impl PostgresSource {
    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        if !matches!(self.connection.scheme(), "postgres" | "postgresql")
            || self.connection.cannot_be_a_base()
            || self.connection.fragment().is_some()
        {
            return Err("connection must be a PostgreSQL URI without a fragment");
        }
        if !self.connection.username().is_empty() || self.connection.password().is_some() {
            return Err("connection credentials must come from the referenced User Secret");
        }
        let mut host = self
            .connection
            .host_str()
            .is_some_and(|host| !host.is_empty());
        let mut database = !matches!(self.connection.path(), "" | "/");
        for (name, value) in self.connection.query_pairs() {
            if name.contains('\0') || value.contains('\0') {
                return Err("connection parameters must contain no NUL");
            }
            match name.as_ref() {
                "user" | "password" | "passfile" | "service" | "servicefile" => {
                    return Err("connection credentials must come from the referenced User Secret");
                }
                "host" => host = !value.is_empty(),
                "dbname" => database = !value.is_empty(),
                "sslmode" if !matches!(value.as_ref(), "disable" | "require" | "verify-full") => {
                    return Err("sslmode must be disable, require or verify-full");
                }
                "port" if value.parse::<core::num::NonZeroU16>().is_err() => {
                    return Err("connection port must be between 1 and 65535");
                }
                _ => {}
            }
        }
        if !host || !database || self.connection.port() == Some(0) {
            return Err("connection must specify a host, database and nonzero port");
        }
        if [&self.schema, &self.table]
            .iter()
            .any(|value| value.trim().is_empty() || value.contains('\0'))
        {
            return Err("schema and table must be nonempty and contain no NUL");
        }
        Ok(())
    }
}

impl core::fmt::Debug for PostgresSource {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("PostgresSource")
            .field("connection", &"<redacted>")
            .field("schema", &self.schema)
            .field("table", &self.table)
            .field("credentials", &self.credentials)
            .finish()
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
