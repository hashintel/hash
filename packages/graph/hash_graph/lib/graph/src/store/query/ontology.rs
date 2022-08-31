use std::{fmt, fmt::Formatter, marker::PhantomData};

use type_system::{uri::BaseUri, EntityType, LinkType};

pub type LinkTypeQuery<'q> = OntologyQuery<'q, LinkType>;
pub type EntityTypeQuery<'q> = OntologyQuery<'q, EntityType>;

#[derive(Debug, Copy, Clone)]
pub enum OntologyVersion {
    Exact(u32),
    Latest,
}

pub struct OntologyQuery<'q, T> {
    _marker: PhantomData<fn() -> T>,
    uri: Option<&'q BaseUri>,
    version: Option<OntologyVersion>,
}

impl<T> fmt::Debug for OntologyQuery<'_, T> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.debug_struct("OntologyQuery")
            .field("uri", &self.uri())
            .field("version", &self.version())
            .finish()
    }
}

impl<T> OntologyQuery<'_, T> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            _marker: PhantomData,
            uri: None,
            version: None,
        }
    }
}

/// Methods for building up a query.
impl<'q, T> OntologyQuery<'q, T> {
    #[must_use]
    pub const fn by_uri(mut self, uri: &'q BaseUri) -> Self {
        self.uri = Some(uri);
        self
    }

    #[must_use]
    pub const fn by_version(mut self, version: u32) -> Self {
        self.version = Some(OntologyVersion::Exact(version));
        self
    }

    #[must_use]
    pub const fn by_latest_version(mut self) -> Self {
        self.version = Some(OntologyVersion::Latest);
        self
    }
}

/// Parameters specified in the query.
impl<'q, T> OntologyQuery<'q, T> {
    #[must_use]
    pub const fn uri(&self) -> Option<&BaseUri> {
        self.uri
    }

    #[must_use]
    pub const fn version(&self) -> Option<OntologyVersion> {
        self.version
    }
}
