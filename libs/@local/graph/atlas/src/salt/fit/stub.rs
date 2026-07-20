//! Deterministic stand-ins for the pipeline's supplied model inputs.
//!
//! The pipeline consumes two fitted models it does not produce: a
//! card embedder and a relation classifier. The stand-ins here keep
//! every downstream stage real - embedding reuse, classification,
//! resolution, and both policy artifacts - while the training
//! ingestion seam that supplies fitted models is unbuilt. Both are
//! deterministic and corpus-independent, and the embedder's
//! fingerprint records the substitution in every generation it
//! publishes.

use core::future::ready;

use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::{Sha256, Update as _},
    math::{AlignedVecN, BoxedVecN},
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        policy::classifier::{
            Classifier, FitConfig as ClassifierFitConfig, TrainingRow, TrainingSet,
            fit as fit_classifier,
        },
    },
};

/// A deterministic classifier fitted from a synthetic corpus.
///
/// The stub stands in for the supplied model input while the training
/// ingestion seam is unbuilt, keeping the pipeline's policy stage
/// real: classification, resolution, and both artifacts run against
/// it.
#[must_use]
pub(crate) fn stub_classifier() -> Classifier {
    const ROWS: usize = 4;
    // Coprime to the dimension, so no two corpus rows repeat.
    const PATTERN: [f32; 13] = [
        -0.75, -0.625, -0.5, -0.375, -0.25, -0.125, 0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75,
    ];

    let mut storage = BoxedVecN::<{ ROWS * CANONICAL_DIMENSIONS }>::zero();
    for (component, &value) in storage
        .as_array_mut()
        .iter_mut()
        .zip(PATTERN.iter().cycle())
    {
        *component = value;
    }
    let embeddings = AlignedVecN::from_slice(storage.as_array()).expect("boxed storage is aligned");

    let rows: Vec<TrainingRow> = [
        ([0.7, 0.2, 0.1], b"group-a" as &[u8]),
        ([0.2, 0.6, 0.2], b"group-b"),
        ([0.1, 0.2, 0.7], b"group-c"),
        ([0.3, 0.4, 0.3], b"group-d"),
    ]
    .into_iter()
    .map(|(target, group)| {
        let mut hasher = Sha256::new();
        hasher.update(group);
        TrainingRow {
            target,
            weight: 1.0,
            group: hasher.finalize(),
        }
    })
    .collect();

    let training = TrainingSet::new(embeddings, &rows).expect("the stub corpus validates");
    fit_classifier(training, ClassifierFitConfig { folds: 2, .. })
        .expect("the stub classifier fits")
        .classifier
}

/// A deterministic provider deriving each embedding from its text
/// hash.
///
/// The stub keeps provider latency and credentials out of the
/// pipeline while the card table stays content-addressed, so
/// prior-reuse runs exercise the real prior-table path.
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
