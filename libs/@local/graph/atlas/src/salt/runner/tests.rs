use alloc::borrow::Cow;
use core::{future::ready, num::NonZero};
use std::collections::HashMap;

use camino::Utf8PathBuf;
use hashql_core::id::Id as _;
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{LE, U64};

use super::{Admission, PriorMode, RunnerOptions, run};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node, Ontology, PROJECTOR_DIMENSIONS, card::Card,
        memory::MemoryDataset,
    },
    file::generation::GenerationRoot,
    identity::{NodeRowId, OntologyRowId},
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, UnitFraction, VecN},
    progress::NoProgress,
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        fit::{ClassifierInput, FitConfig, PlacementOptions},
        landmark::select::SelectionOptions,
        policy::classifier::{
            FitConfig as ClassifierFitConfig, TrainingRow, TrainingSet, fit as fit_classifier,
        },
        quality::{probe::ProbeOptions, report::QualityThresholds, runner::QualityRunOptions},
    },
};

const NODES: usize = 48;

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-runner-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    dir
}

/// A probe-scale corpus for the real fit.
///
/// Unit-norm pseudo-random representations whose canonical embeddings extend them with zeros, one
/// node type alternating between two ontology rows, and one link type.
fn dataset() -> MemoryDataset {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x27A);
    let mut canonical = HashMap::new();

    let nodes = (0..NODES)
        .map(|row| {
            let mut components = [0.0_f32; PROJECTOR_DIMENSIONS];
            for component in &mut components {
                *component = rng.random::<f32>() - 0.5;
            }
            let norm = components
                .iter()
                .map(|&component| f64::from(component) * f64::from(component))
                .sum::<f64>()
                .sqrt();
            #[expect(
                clippy::cast_possible_truncation,
                reason = "the normalization factor of a 512-component vector is far inside f32 \
                          range"
            )]
            for component in &mut components {
                *component = (f64::from(*component) / norm) as f32;
            }

            let mut extended = BoxedVecN::<CANONICAL_DIMENSIONS>::zero();
            extended.as_array_mut()[..PROJECTOR_DIMENSIONS].copy_from_slice(&components);
            canonical.insert(row as u64, extended);

            Node {
                id: U64::<LE>::new(row as u64),
                ontology: smallvec![OntologyRowId::from_usize(row & 1)],
                embedding: BoxedVecN::new(&VecN::new(components)),
                confidence: None,
            }
        })
        .collect();

    let edges = vec![Edge {
        id: U64::<LE>::new(100),
        source: NodeRowId::new(0),
        target: NodeRowId::new(1),
        ontology: smallvec![OntologyRowId::new(2)],
        embedding: None,
        confidence: None,
        source_confidence: None,
        target_confidence: None,
    }];

    let ontology = vec![
        Ontology {
            id: U64::<LE>::new(0),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(1),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(2),
            parents: smallvec![],
        },
    ];

    let cards = HashMap::from([
        (0, Card::verbatim("Person entity card".to_owned())),
        (1, Card::verbatim("Company entity card".to_owned())),
        (2, Card::verbatim("Employment link card".to_owned())),
    ]);

    MemoryDataset::new(nodes, edges, ontology, canonical, cards)
}

/// A deterministic provider deriving each embedding from its text hash.
struct HashEmbedder;

impl CardEmbedder for HashEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        let mut hasher = Sha256::new();
        hasher.update(b"generation runner test embedder");
        EmbedderFingerprint::new(hasher.finalize())
    }

    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .map(|text| {
                let mut hasher = Sha256::new();
                hasher.update(text.as_bytes());
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

/// A deterministic classifier fitted from a synthetic corpus.
///
/// The supplied model input of the fixture runs.
fn classifier() -> ClassifierInput {
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

    let training = TrainingSet::new(embeddings, &rows).expect("the fixture corpus validates");
    let classifier = fit_classifier(training, ClassifierFitConfig { folds: 2, .. })
        .expect("the fixture classifier fits")
        .classifier;

    let mut hasher = Sha256::new();
    hasher.update(b"fixture classifier artifact");
    ClassifierInput::Supplied {
        classifier,
        source: hasher.finalize(),
    }
}

/// Fixture-sized runner options over the given gates.
fn options(seed: u64, thresholds: QualityThresholds) -> RunnerOptions {
    RunnerOptions {
        fit: FitConfig {
            seed,
            selection: SelectionOptions {
                maximum_count: NonZero::new(8).expect("the fixture capacity is nonzero"),
                ..
            },
            curve: AffinityCurve::fit(1.0, 0.1).expect("the reference falloff is well-conditioned"),
            neighbours: NonZero::new(4).expect("the fixture neighbour count is nonzero"),
            // The runner fixtures probe the run protocol, not the
            // placement: they opt out of the default's training run.
            placement: PlacementOptions::LandmarkBaseline,
            ..
        },
        quality: QualityRunOptions {
            probe: ProbeOptions {
                anchors: NonZero::new(8).expect("nonzero"),
                comparisons: NonZero::new(16).expect("nonzero"),
                // Rung 2 is all-degenerate on this 8-node landmark-baseline
                // fixture (coincident map placements zero the radii), and the
                // verdict fails closed on absent density evidence - the
                // fail-closed arm itself is pinned in the quality tests. The
                // runner fixtures probe the run protocol, so they read the
                // rung where evidence exists.
                neighbourhoods: Cow::Owned(vec![NonZero::new(4).expect("nonzero")]),
                triplet_pairs: 8,
                ..
            },
            thresholds,
            ..
        },
        ..
    }
}

/// A run whose report passes activates what it publishes.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn passing_run_activates_the_generation() {
    let root = GenerationRoot::new(scratch("activates")).expect("the root should open");
    let dataset = dataset();
    let classifier = classifier();

    let outcome = run(
        &dataset,
        &HashEmbedder,
        &classifier,
        None,
        &root,
        &options(7, QualityThresholds { .. }),
        NoProgress,
    )
    .await
    .expect("the run should reach a verdict");

    assert_eq!(outcome.admission, Admission::Active);
    assert!(outcome.report.passes());
    assert_eq!(outcome.report.anchors, 8);
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(outcome.generation.id()),
        "the admitted generation is the active one",
    );
    assert!(
        outcome
            .generation
            .repository()
            .metadata
            .reproducibility
            .prior
            .is_none(),
        "an empty root runs fresh",
    );
}

/// A run whose report refuses admission publishes a candidate and leaves the pointer alone.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn refused_run_leaves_a_candidate() {
    let root = GenerationRoot::new(scratch("candidate")).expect("the root should open");
    let dataset = dataset();
    let classifier = classifier();

    // A 2D projection of 48 pseudo-random unit vectors cannot carry
    // near-perfect neighbourhoods: the floor refuses admission on a
    // real reading, not on a rigged fixture.
    let outcome = run(
        &dataset,
        &HashEmbedder,
        &classifier,
        None,
        &root,
        &options(
            7,
            QualityThresholds {
                minimum_recall: UnitFraction::new(0.99).expect("0.99 lies inside [0, 1]"),
                ..
            },
        ),
        NoProgress,
    )
    .await
    .expect("the run should reach a verdict");

    assert_eq!(outcome.admission, Admission::Candidate);
    assert!(!outcome.report.passes());
    assert_eq!(
        root.current().expect("the pointer should read"),
        None,
        "a refused generation never activates",
    );
    assert!(
        root.open(outcome.generation.id()).is_ok(),
        "the candidate stays published for the human exception path",
    );
}

/// The second run reuses the active generation as its prior; a fresh run ignores it.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn prior_modes_route_reuse() {
    let root = GenerationRoot::new(scratch("prior")).expect("the root should open");
    let dataset = dataset();
    let classifier = classifier();

    let first = run(
        &dataset,
        &HashEmbedder,
        &classifier,
        None,
        &root,
        &options(7, QualityThresholds { .. }),
        NoProgress,
    )
    .await
    .expect("the first run should reach a verdict");
    assert_eq!(first.admission, Admission::Active);

    let reused = run(
        &dataset,
        &HashEmbedder,
        &classifier,
        None,
        &root,
        &options(11, QualityThresholds { .. }),
        NoProgress,
    )
    .await
    .expect("the reuse run should reach a verdict");
    let metadata = &reused.generation.repository().metadata;
    assert_eq!(
        metadata.reproducibility.prior,
        Some(first.generation.id()),
        "the active generation seeds the second run",
    );
    assert_eq!(
        metadata.evidence.cards.reused, 3,
        "every card text carries over from the prior",
    );
    assert_eq!(metadata.evidence.cards.embedded, 0);

    let fresh = run(
        &dataset,
        &HashEmbedder,
        &classifier,
        None,
        &root,
        &RunnerOptions {
            prior: PriorMode::Fresh,
            ..options(13, QualityThresholds { .. })
        },
        NoProgress,
    )
    .await
    .expect("the fresh run should reach a verdict");
    assert!(
        fresh
            .generation
            .repository()
            .metadata
            .reproducibility
            .prior
            .is_none(),
        "a fresh run ignores the active generation",
    );
}
