//! Version metadata for both procedures and services.

use harpc_types::version::Version;

/// Represents the deprecation information for a procedure or service.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Deprecation {
    /// The version at which the procedure/service was deprecated.
    pub since: Version,
    /// The reason for deprecation.
    pub reason: Option<&'static str>,
}

/// Metadata containing version information for procedures and services.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Metadata {
    /// The version at which the procedure/service was introduced.
    pub since: Version,

    /// The deprecation information for the procedure/service.
    pub deprecation: Option<Deprecation>,
}
