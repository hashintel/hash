use alloc::{boxed::Box, collections::BTreeMap, string::String};
use core::num::NonZeroU64;

use percent_encoding::percent_decode_str;
use serde::Deserialize;
use url::Url;
use uuid::Uuid;

/// A User Secret entity in the run owner's web.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecretReference {
    pub secret_entity_uuid: Uuid,
}

const SOCKET_HOST: &str = "connection must use a network host, not a Unix socket";

/// Whether libpq treats a host starting with `first` as a Unix-domain socket.
///
/// A host starting with `/` names a socket directory and one starting with `@` an abstract socket.
/// An empty host falls back to the default socket directory. Sockets reach files and services on
/// the machine running the capture, so connections are limited to network hosts.
const fn socket(first: Option<u8>) -> bool {
    matches!(first, None | Some(b'/' | b'@'))
}

/// A table accessible through the PostgreSQL protocol, including Redshift.
#[derive(Clone, PartialEq, Eq, Deserialize, derive_more::Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostgresSource {
    #[debug(skip)]
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
        let authority = self.connection.host_str().unwrap_or_default();
        if !authority.is_empty() && socket(percent_decode_str(authority).next()) {
            return Err(SOCKET_HOST);
        }
        let mut host = !authority.is_empty();
        let mut database = !matches!(self.connection.path(), "" | "/");
        for (name, value) in self.connection.query_pairs() {
            if name.contains('\0') || value.contains('\0') {
                return Err("connection parameters must contain no NUL");
            }
            match name.as_ref() {
                "user" | "password" | "passfile" | "service" | "servicefile" => {
                    return Err("connection credentials must come from the referenced User Secret");
                }
                "host" => {
                    if value.split(',').any(|entry| socket(entry.bytes().next())) {
                        return Err(SOCKET_HOST);
                    }
                    host = true;
                }
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
#[derive(Clone, PartialEq, Eq, Deserialize, derive_more::Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestSource {
    #[debug(skip)]
    pub url: String,
    #[serde(default)]
    #[debug(skip)]
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

pub(crate) const fn default_page_size() -> NonZeroU64 {
    NonZeroU64::new(100).expect("the page size should be nonzero")
}

impl RestSource {
    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        if self.url.trim().is_empty() {
            return Err("REST URL must be nonempty");
        }
        // Next links stay on the configured origin, so checking it keeps credentials off
        // cleartext requests for every page.
        if self.auth.is_some() && !Url::parse(&self.url).is_ok_and(|url| url.scheme() == "https") {
            return Err("authenticated REST sources must use an https URL");
        }
        if self.rate_limit_ms > 86_400_000 {
            return Err("REST request interval must not exceed one day");
        }
        Ok(())
    }
}
