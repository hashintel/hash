//! A deterministic stand-in for the pipeline's embedding provider.
//!
//! The pipeline consumes a card embedder it does not produce. [`StubEmbedder`] keeps every
//! downstream stage real while no provider credentials are in play, and its fingerprint records the
//! substitution in every generation it publishes.

use core::future::ready;

use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::{Sha256, Update as _},
    math::BoxedVecN,
    salt::embedding::{CardEmbedder, EmbedderFingerprint},
};

/// A deterministic provider deriving each embedding from its text hash.
///
/// The stub keeps provider latency and credentials out of the pipeline while the card table stays
/// content-addressed, so prior-reuse runs exercise the real prior-table path.
#[derive(Debug, Copy, Clone)]
pub(crate) struct StubEmbedder;

impl CardEmbedder for StubEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        let mut hasher = Sha256::new();
        hasher.update(b"live-fit stub embedder");
        EmbedderFingerprint::new(hasher.finalize())
    }

    fn embed(
        &self,
        texts: impl IntoIterator<Item: AsRef<str> + Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .map(|text| {
                let mut hasher = Sha256::new();
                hasher.update(text.as_ref().as_bytes());
                let bytes = hasher.finalize().to_bytes();

                let mut vector = BoxedVecN::zero();
                for (component, &byte) in vector.as_array_mut().iter_mut().zip(bytes.iter().cycle())
                {
                    *component = f32::from(byte) / 255.0;
                }
                vector
            })
            .collect()))
    }
}
