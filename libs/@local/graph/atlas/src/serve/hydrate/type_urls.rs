//! Resolution from ontology type uuids to their versioned URLs, behind a composable cache.
//!
//! An ontology type uuid derives from the versioned URL it names, so the mapping from uuid to
//! URL is immutable: a store row cannot change its URL under the same uuid, and a resolved pair
//! stays true for as long as the process lives. That is what makes a lazily filled,
//! never-invalidated cache correct here, and why the cache is generation-independent - a
//! generation swap changes which uuids a response requires, never what a uuid resolves to.
//!
//! [`ResolveTypeUrls`] is the resolution capability and [`CachedHydrate`] the cache that
//! composes over any source of it. The source stays cache-oblivious. It answers every uuid it
//! receives, and the wrapper decides which uuids reach it.

use alloc::sync::Arc;
use std::sync::nonpoison::RwLock;

use hashql_core::collections::FastHashMap;
use type_system::ontology::{VersionedUrl, id::OntologyTypeUuid};

use super::client::DetailError;

/// The capability to resolve ontology type uuids to their versioned URLs.
pub(crate) trait TypeUrlResolver {
    /// Resolves the uuids the source knows among `types`, as uuid-URL pairs.
    ///
    /// A uuid the source does not know is absent from the answer rather than an error, so a
    /// caller distinguishes a failed read from a type the store no longer serves. The answer
    /// may repeat a uuid, because the store can hold more than one row for one type across
    /// archival cycles. Every such row answers the same immutable pair, so consumers key by
    /// uuid rather than count.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the source rejects the read or the answer can no longer
    /// reach the caller.
    // A plain `async fn` reveals no auto traits to generic callers, and the transport awaits
    // this future inside a spawned task - that holds because every transport caller names its
    // resolver concretely, so the future's `Send` leaks from the concrete impl instead of an
    // explicit `impl Future + Send` bound.
    async fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
    ) -> Result<Vec<(OntologyTypeUuid, VersionedUrl)>, DetailError>;
}

impl<T> TypeUrlResolver for Arc<T>
where
    T: TypeUrlResolver,
{
    async fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
    ) -> Result<Vec<(OntologyTypeUuid, VersionedUrl)>, DetailError> {
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
    ) -> Result<Vec<(OntologyTypeUuid, VersionedUrl)>, DetailError> {
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

    use hashql_core::collections::FastHashMap;
    use type_system::ontology::{VersionedUrl, id::OntologyTypeUuid};

    use super::{CachedTypeUrlResolver, TypeUrlResolver};
    use crate::serve::hydrate::client::DetailError;

    /// A resolution source that records every uuid set that reaches it.
    struct Ledger {
        urls: FastHashMap<OntologyTypeUuid, VersionedUrl>,
        asked: Mutex<Vec<Vec<OntologyTypeUuid>>>,
    }

    impl TypeUrlResolver for Ledger {
        fn resolve(
            &self,
            types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
        ) -> impl Future<Output = Result<Vec<(OntologyTypeUuid, VersionedUrl)>, DetailError>>
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
