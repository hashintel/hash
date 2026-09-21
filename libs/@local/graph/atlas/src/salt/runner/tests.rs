use alloc::{borrow::Cow, sync::Arc};
use core::future::ready;
use std::{collections::HashMap, sync::Mutex};

use camino::Utf8PathBuf;
use hashql_core::id::{Id as _, IdSlice, IdVec};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{LE, U64};

use super::{Admission, PriorMode, RunnerOptions, probe_rng, run};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node, Ontology, PROJECTOR_DIMENSIONS, card::Card,
        memory::MemoryDataset,
    },
    device::Device,
    file::generation::GenerationRoot,
    identity::{CardRow, NodeRowId, OntologyRowId},
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, DFinite, UnitFraction, VecN, nz, positive},
    progress::{NoProgress, Progress},
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        fit::{ClassifierInput, FitConfig, PlacementOptions},
        landmark::select::SelectionOptions,
        policy::classifier::{
            FitConfig as ClassifierFitConfig, FitOptions as ClassifierFitOptions, TrainingRow,
            TrainingSet, fit as fit_classifier,
        },
        quality::{
            QualityMetric, probe::ProbeOptions, report::QualityThresholds,
            runner::QualityRunOptions,
        },
    },
};

/// Row count of the runner fixture corpus.
const NODES: usize = 48;

/// Returns a per-process scratch path after attempting to remove its previous directory.
///
/// # Panics
///
/// This panics if the system temporary directory's path is not UTF-8.
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

/// Builds a small corpus with seeded representations and typed rows.
///
/// Canonical embeddings zero-extend the normalized representations. Normalization computes in
/// double precision before rounding the components to `f32`. Nodes alternate between two direct
/// ontology types, and the link uses a third type.
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
                embedding: Cow::Owned(BoxedVecN::new(&VecN::new(components))),
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

/// Fits the fixture's supplied classifier from a fixed synthetic corpus.
///
/// # Panics
///
/// This panics if the synthetic training fixture fails validation or fitting.
fn classifier() -> ClassifierInput {
    const ROWS: usize = 4;
    // A period coprime to the row width visits every pattern offset before repeating. This
    // 13-element pattern spans four 3,072-component rows. Therefore each row starts at a distinct
    // pattern offset and has a distinct embedding.
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
    let embeddings: &IdSlice<CardRow, AlignedVecN<CANONICAL_DIMENSIONS>> = IdSlice::from_raw(
        AlignedVecN::from_slice(storage.as_array()).expect("boxed storage is aligned"),
    );

    let rows: IdVec<CardRow, TrainingRow> = [
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
    let classifier = fit_classifier(
        training,
        ClassifierFitConfig::new(ClassifierFitOptions { folds: 2, .. })
            .expect("the fixture classifier fit config is valid"),
        &NoProgress,
    )
    .expect("the fixture classifier fits")
    .classifier;

    let mut hasher = Sha256::new();
    hasher.update(b"fixture classifier artifact");
    ClassifierInput::Supplied {
        classifier,
        source: hasher.finalize(),
    }
}

/// Configures a small landmark-baseline run with the given seed and thresholds.
fn options(seed: u64, thresholds: QualityThresholds) -> RunnerOptions {
    RunnerOptions {
        fit: FitConfig {
            seed,
            selection: SelectionOptions {
                maximum_count: nz!(8),
                ..
            },
            curve: AffinityCurve::fit(positive!(1.0), positive!(0.1))
                .expect("the reference falloff is well-conditioned"),
            neighbours: nz!(4),
            // the landmark baseline keeps these protocol fixtures independent of projector
            // training.
            placement: PlacementOptions::LandmarkBaseline,
            ..
        },
        quality: QualityRunOptions {
            probe: ProbeOptions {
                anchors: nz!(8),
                comparisons: nz!(16),
                // the fixture caps landmarks at eight for 48 rows. Coincident placements can
                // remove density-spread evidence at small neighbourhood sizes. Size 4 is the
                // selected neighbourhood for the passing admission case.
                neighbourhoods: Cow::Owned(vec![nz!(4)]),
                triplet_pairs: 8,
                ..
            },
            thresholds,
            ..
        },
        device: Device::Cpu.pin(0).resolve(),
        ..
    }
}

/// A shared log of admission readings in reporting order.
///
/// Detached observers append to the same log. Reading or appending panics if its mutex is poisoned.
#[derive(Debug, Clone, Default)]
struct RecordingBattery(Arc<Mutex<Vec<(QualityMetric, DFinite)>>>);

impl RecordingBattery {
    /// Copies the recorded readings in reporting order.
    ///
    /// # Panics
    ///
    /// This panics if the log's mutex is poisoned.
    fn readings(&self) -> Vec<(QualityMetric, DFinite)> {
        self.0
            .lock()
            .expect("no reporter panicked holding the log")
            .clone()
    }
}

impl Progress for RecordingBattery {
    type Detached = Self;

    fn detach(&self) -> Self {
        self.clone()
    }

    fn quality_probe(&self, metric: QualityMetric, value: DFinite) {
        self.0
            .lock()
            .expect("no reporter panicked holding the log")
            .push((metric, value));
    }
}

#[tokio::test]
async fn passing_run_activates_the_generation() {
    let root = GenerationRoot::new(scratch("activates")).expect("the root should open");
    let dataset = dataset();
    let classifier = classifier();

    let battery = RecordingBattery::default();

    let outcome = run(
        &dataset,
        &HashEmbedder,
        &classifier,
        None,
        &root,
        options(7, QualityThresholds { .. }),
        &battery,
    )
    .await
    .expect("the run should reach a verdict");

    assert_eq!(outcome.admission, Admission::Active);
    assert_eq!(
        outcome
            .report
            .controls()
            .into_iter()
            .filter_map(|control| control.reading().map(|reading| (control.metric, reading)))
            .collect::<Vec<_>>(),
        battery.readings(),
    );
    assert_eq!(
        battery.readings().len(),
        6,
        "a passing verdict has every control's evidence: {:?}",
        battery.readings(),
    );
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

#[tokio::test]
async fn refused_run_leaves_a_candidate() {
    let root = GenerationRoot::new(scratch("candidate")).expect("the root should open");
    let dataset = dataset();
    let classifier = classifier();

    // raise the recall floor to exercise refusal on this fixture's measured neighbourhood loss.
    let outcome = run(
        &dataset,
        &HashEmbedder,
        &classifier,
        None,
        &root,
        options(
            7,
            QualityThresholds {
                minimum_recall: UnitFraction::new(0.99).expect("0.99 lies inside [0, 1]"),
                ..
            },
        ),
        &NoProgress,
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

#[tokio::test]
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
        options(7, QualityThresholds { .. }),
        &NoProgress,
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
        options(11, QualityThresholds { .. }),
        &NoProgress,
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
        RunnerOptions {
            prior: PriorMode::Fresh,
            ..options(13, QualityThresholds { .. })
        },
        &NoProgress,
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

#[test]
fn the_admission_probe_derives_its_draws_from_the_fit_seed() {
    let draws = |seed| {
        let mut rng = probe_rng(seed);
        core::array::from_fn::<u64, 4, _>(|_| rng.random_range(0..u64::MAX))
    };

    assert_eq!(
        draws(13),
        draws(13),
        "equal fit seeds derive equal probe draws, or the run cannot replay",
    );
    assert_ne!(
        draws(13),
        draws(14),
        "the derivation consumes the seed rather than the pinned name alone",
    );
}
