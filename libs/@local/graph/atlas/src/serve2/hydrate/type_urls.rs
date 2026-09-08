use alloc::sync::Arc;
use std::sync::nonpoison::RwLock;

use error_stack::Report;
use hashql_core::collections::FastHashMap;
use type_system::ontology::{VersionedUrl, id::OntologyTypeUuid};

use super::client::HydrateError;

/// The capability to resolve ontology type uuids to their versioned URLs.
pub(crate) trait TypeUrlResolver {
    async fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
    ) -> Result<Vec<(OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>;
}

impl<T> TypeUrlResolver for &T
where
    T: TypeUrlResolver,
{
    async fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
    ) -> Result<Vec<(OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>> {
        T::resolve(self, types).await
    }
}

impl<T> TypeUrlResolver for Arc<T>
where
    T: TypeUrlResolver,
{
    async fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
    ) -> Result<Vec<(OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>> {
        T::resolve(self, types).await
    }
}

/// A resolution source behind a lazily filled cache that never invalidates.
///
/// Every resolved pair enters the cache, and a cached uuid never reaches the inner source
/// again. An unresolved uuid stays uncached on purpose: deriving uuids from URLs means a
/// re-created type resurrects under its old uuid, so absence is re-asked on every call rather
/// than remembered.
pub(crate) struct CachedTypeUrlResolver<T> {
    /// The cache-oblivious source answering the uuids the cache does not hold.
    inner: T,
    /// Every pair any resolution ever answered.
    known: RwLock<FastHashMap<OntologyTypeUuid, VersionedUrl>>,
}

impl<T> CachedTypeUrlResolver<T> {
    /// Wraps `inner` behind an empty cache.
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
    async fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
    ) -> Result<Vec<(OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>> {
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

        if misses.is_empty() {
            return Ok(found);
        }

        let fresh = self.inner.resolve(misses).await?;

        {
            let mut known = self.known.write();
            for &(uuid, ref url) in &fresh {
                known.insert(uuid, url.clone());
            }
        }

        found.extend(fresh);
        Ok(found)
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::future;
    use std::sync::nonpoison::Mutex;

    use error_stack::Report;
    use hashql_core::collections::FastHashMap;
    use type_system::ontology::{VersionedUrl, id::OntologyTypeUuid};

    use super::{CachedTypeUrlResolver, HydrateError, TypeUrlResolver};

    /// A resolution source that records every uuid set that reaches it.
    struct Ledger {
        urls: FastHashMap<OntologyTypeUuid, VersionedUrl>,
        asked: Mutex<Vec<Vec<OntologyTypeUuid>>>,
    }

    impl TypeUrlResolver for Ledger {
        fn resolve(
            &self,
            types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
        ) -> impl Future<Output = Result<Vec<(OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>>
        {
            let types = types.into_iter().collect::<Vec<_>>();
            self.asked.lock().push(types.clone());

            future::ready(Ok(types
                .into_iter()
                .filter_map(|uuid| self.urls.get(&uuid).map(|url| (uuid, url.clone())))
                .collect()))
        }
    }

    fn type_url(ordinal: u64) -> VersionedUrl {
        format!("https://example.com/types/entity-type/fixture-{ordinal}/v/1")
            .parse()
            .expect("the fixture URL parses")
    }

    fn ledger(ordinals: impl IntoIterator<Item = u64>) -> (Ledger, Vec<OntologyTypeUuid>) {
        let urls: FastHashMap<_, _> = ordinals
            .into_iter()
            .map(|ordinal| {
                let url = type_url(ordinal);
                (OntologyTypeUuid::from_url(&url), url)
            })
            .collect();
        let uuids = urls.keys().copied().collect();

        (
            Ledger {
                urls,
                asked: Mutex::new(Vec::new()),
            },
            uuids,
        )
    }

    #[tokio::test]
    async fn cache_hit() {
        let (ledger, uuids) = ledger([0]);
        let cached = CachedTypeUrlResolver::new(ledger);

        let first = cached
            .resolve(uuids.iter().copied())
            .await
            .expect("the source is total");
        let second = cached
            .resolve(uuids.iter().copied())
            .await
            .expect("the source is total");

        assert_eq!(first, second);
        assert_eq!(
            *cached.inner.asked.lock(),
            vec![uuids],
            "the second resolution answers from the cache alone"
        );
    }

    #[tokio::test]
    async fn unresolved_retried() {
        let (ledger, _) = ledger([]);
        let unknown = OntologyTypeUuid::from_url(&type_url(7));
        let cached = CachedTypeUrlResolver::new(ledger);

        let first = cached
            .resolve([unknown])
            .await
            .expect("an absent uuid is not an error");
        let second = cached
            .resolve([unknown])
            .await
            .expect("an absent uuid is not an error");

        assert!(first.is_empty());
        assert!(second.is_empty());
        assert_eq!(
            cached.inner.asked.lock().len(),
            2,
            "absence is never cached, so both calls reach the source"
        );
    }

    #[tokio::test]
    async fn partial_hit() {
        let (ledger, known) = ledger([0, 1]);
        let cached = CachedTypeUrlResolver::new(ledger);

        let warm: Vec<_> = known.iter().copied().take(1).collect();
        let warmed = cached.resolve(warm).await.expect("the source is total");
        assert_eq!(warmed.len(), 1);
        let answer = cached
            .resolve(known.iter().copied())
            .await
            .expect("the source is total");

        assert_eq!(answer.len(), 2);
        let asked = cached.inner.asked.lock();
        assert_eq!(
            asked[1],
            known[1..].to_vec(),
            "the warmed uuid stays out of the second read"
        );
    }

    #[tokio::test]
    async fn arc_source() {
        let (ledger, uuids) = ledger([3]);
        let cached = CachedTypeUrlResolver::new(Arc::new(ledger));

        let answer = cached.resolve(uuids).await.expect("the source is total");

        assert_eq!(answer.len(), 1);
    }
}
