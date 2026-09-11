use type_system::ontology::VersionedUrl;

/// The identity-derivation contract of an ontology id type.
pub(crate) trait OntologyIdentity: Sized {
    /// Derives the id naming `url` in this id space.
    fn from_versioned_url(url: &VersionedUrl) -> Option<Self>;
}
