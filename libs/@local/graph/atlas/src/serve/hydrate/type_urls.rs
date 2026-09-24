use alloc::sync::Arc;
use std::sync::nonpoison::RwLock;

use error_stack::Report;
use hashql_core::collections::FastHashMap;
use type_system::ontology::{VersionedUrl, id::OntologyTypeUuid};

use super::client::HydrateError;

/// The capability to resolve ontology type UUIDs to their versioned URLs.
pub(crate) trait TypeUrlResolver {
    /// Resolves each requested ontology type uuid to its versioned URL, unordered.
    ///
    /// # Errors
    ///
    /// Returns [`HydrateError`] when a store read fails.
    fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>;
}

impl<T> TypeUrlResolver for &T
where
    T: TypeUrlResolver,
{
    fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
    {
        T::resolve(self, types)
    }
}

impl<T> TypeUrlResolver for Arc<T>
where
    T: TypeUrlResolver,
{
    fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
    {
        T::resolve(self, types)
    }
}

/// A resolution source with a persistent cache of successful lookups.
///
/// Unresolved UUIDs remain uncached. A recreated type has the same UUID and can resolve on a later
/// call.
pub(crate) struct CachedTypeUrlResolver<T> {
    inner: T,
    known: RwLock<FastHashMap<OntologyTypeUuid, VersionedUrl>>,
}

impl<T> CachedTypeUrlResolver<T> {
    /// Wraps `inner` with an empty cache.
    pub(crate) fn new(inner: T) -> Self {
        Self {
            inner,
            known: RwLock::new(FastHashMap::default()),
        }
    }
}

impl<T> TypeUrlResolver for CachedTypeUrlResolver<T>
where
    T: TypeUrlResolver,
{
    /// Answers from the cache first and asks `inner` only for the misses.
    ///
    /// A read lock covers the cache lookup. The misses' answers enter the cache before the
    /// combined result returns. An unresolved UUID never enters the cache, and a later call
    /// retries it against `inner`.
    ///
    /// # Panics
    ///
    /// Panics where `inner` does. A UUID the cache already holds never reaches it.
    fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
    {
        let types = types.into_iter();
        let mut found = Vec::with_capacity(types.len());
        let mut misses = Vec::new();

        {
            let known = self.known.read();
            for uuid in types {
                match known.get(&uuid) {
                    Some(url) => found.push((uuid, url.clone())),
                    None => misses.push(uuid),
                }
            }
        }

        if !misses.is_empty() {
            let fresh = self.inner.resolve(misses)?;
            let mut known = self.known.write();
            for (uuid, url) in fresh {
                known.insert(uuid, url.clone());
                found.push((uuid, url));
            }
            drop(known);
        }

        Ok(found)
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use std::sync::nonpoison::Mutex;

    use error_stack::Report;
    use hashql_core::collections::FastHashMap;
    use type_system::ontology::{VersionedUrl, id::OntologyTypeUuid};

    use super::{CachedTypeUrlResolver, HydrateError, TypeUrlResolver};

    /// A [`TypeUrlResolver`] fixture answering a fixed set of UUIDs.
    ///
    /// It records every requested UUID batch. A test asserts which UUIDs the caller requested.
    struct Ledger {
        urls: FastHashMap<OntologyTypeUuid, VersionedUrl>,
        asked: Mutex<Vec<Vec<OntologyTypeUuid>>>,
    }

    impl Ledger {
        /// Builds a deterministic fixture URL for `ordinal`.
        ///
        /// It is stable across calls. A test computes the same UUID [`Self::new`] derived from it.
        fn type_url(ordinal: u64) -> VersionedUrl {
            format!("https://example.com/types/entity-type/fixture-{ordinal}/v/1")
                .parse()
                .expect("should parse the fixture URL")
        }

        /// Builds a [`Ledger`] resolving exactly the UUIDs derived from `ordinals`.
        ///
        /// The call returns those UUIDs beside the ledger, in [`FastHashMap`]'s iteration order.
        fn new(ordinals: impl IntoIterator<Item = u64>) -> (Self, Vec<OntologyTypeUuid>) {
            let urls: FastHashMap<_, _> = ordinals
                .into_iter()
                .map(|ordinal| {
                    let url = Self::type_url(ordinal);
                    (OntologyTypeUuid::from_url(&url), url)
                })
                .collect();
            let uuids = urls.keys().copied().collect();
            (
                Self {
                    urls,
                    asked: Mutex::new(Vec::new()),
                },
                uuids,
            )
        }
    }

    impl TypeUrlResolver for Ledger {
        fn resolve(
            &self,
            types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
        ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
        {
            let types: Vec<_> = types.into_iter().collect();
            let found: Vec<_> = types
                .iter()
                .filter_map(|uuid| self.urls.get(uuid).map(|url| (*uuid, url.clone())))
                .collect();
            self.asked.lock().push(types);
            Ok(found)
        }
    }

    #[test]
    fn cache_hit() {
        let (ledger, uuids) = Ledger::new([0]);
        let cached = CachedTypeUrlResolver::new(ledger);
        let first: Vec<_> = cached
            .resolve(uuids.iter().copied())
            .expect("should resolve the known type")
            .into_iter()
            .collect();
        let second: Vec<_> = cached
            .resolve(uuids.iter().copied())
            .expect("should resolve the cached type")
            .into_iter()
            .collect();

        assert_eq!(first.len(), 1);
        assert_eq!(first, second);
        assert_eq!(*cached.inner.asked.lock(), vec![uuids]);
    }

    /// An unresolvable UUID asks the inner resolver again on every call.
    ///
    /// A miss is never cached.
    #[test]
    fn unresolved_retried() {
        let (ledger, _) = Ledger::new([]);
        let unknown = OntologyTypeUuid::from_url(&Ledger::type_url(7));
        let cached = CachedTypeUrlResolver::new(ledger);
        for _ in 0..2 {
            assert_eq!(
                cached
                    .resolve([unknown])
                    .expect("should accept an unresolved type")
                    .into_iter()
                    .count(),
                0
            );
        }
        assert_eq!(
            *cached.inner.asked.lock(),
            vec![vec![unknown], vec![unknown]]
        );
    }

    /// Resolving both UUIDs after warming one asks the inner resolver only for the other.
    ///
    /// The cache answers the warmed UUID without a second request.
    #[test]
    fn partial_hit() {
        let (ledger, known) = Ledger::new([0, 1]);
        let cached = CachedTypeUrlResolver::new(ledger);
        let warmed = cached
            .resolve(known.iter().copied().take(1))
            .expect("should resolve the first type");
        assert_eq!(warmed.into_iter().count(), 1);
        let answer = cached
            .resolve(known.iter().copied())
            .expect("should resolve both types");

        assert_eq!(answer.into_iter().count(), 2);
        let asked = cached.inner.asked.lock();
        assert_eq!(asked[1], known[1..]);
    }

    /// [`CachedTypeUrlResolver`] works over an [`Arc`]-wrapped inner resolver.
    ///
    /// The case exercises the blanket `TypeUrlResolver for Arc<T>` impl.
    #[test]
    fn arc_source() {
        let (ledger, uuids) = Ledger::new([3]);
        let cached = CachedTypeUrlResolver::new(Arc::new(ledger));
        let answer = cached
            .resolve(uuids)
            .expect("should resolve the known type");
        assert_eq!(answer.into_iter().count(), 1);
    }
}
