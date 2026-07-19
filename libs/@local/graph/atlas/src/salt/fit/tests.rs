use core::{future::ready, num::NonZero};
use std::{collections::HashMap, fs};

use camino::Utf8PathBuf;
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{LE, U64};

use super::{FitConfig, FitError, PolicyOptions, fit, prepare::identity::MappedIdentityTable};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node, NodeRowId, Ontology, OntologyRowId, PROJECTOR_DIMENSIONS,
        card::Card, memory::MemoryDataset,
    },
    file::{
        array::ArrayFile,
        classifier::read::ClassifierFile,
        generation::GenerationRoot,
        identity::read::IdentityFile,
        landmark::read::LandmarkFile,
        policy::read::PolicyFile,
        salt::{SaltRepository, metadata::Placement},
    },
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, VecN},
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        landmark::{artifact::MappedLandmarkSkeleton, select::SelectionOptions},
        policy::{
            PolicyOverride, PolicySource, Posterior,
            artifact::MappedPolicyTable,
            classifier::{
                Classifier, FitConfig as ClassifierFitConfig, TrainingRow, TrainingSet,
                fit as fit_classifier,
            },
        },
    },
};

const NODES: usize = 48;
const LANDMARKS: u32 = 8;

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-fit-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    dir
}

/// A unit-norm pseudo-random representation for node `row`.
fn representation(rng: &mut Xoshiro256PlusPlus) -> BoxedVecN<PROJECTOR_DIMENSIONS> {
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
        reason = "the normalization factor of a 512-component vector is far inside f32 range"
    )]
    for component in &mut components {
        *component = (f64::from(*component) / norm) as f32;
    }

    BoxedVecN::new(&VecN::new(components))
}

fn dataset() -> MemoryDataset {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0xF17);

    let nodes = (0..NODES)
        .map(|row| Node {
            id: U64::<LE>::new(row as u64),
            ontology: smallvec![OntologyRowId::new((row & 1) as u64)],
            embedding: representation(&mut rng),
            confidence: None,
        })
        .collect();

    let edges = vec![
        Edge {
            id: U64::<LE>::new(100),
            source: NodeRowId::new(0),
            target: NodeRowId::new(1),
            ontology: smallvec![OntologyRowId::new(2)],
            embedding: None,
            confidence: None,
            source_confidence: None,
            target_confidence: None,
        },
        Edge {
            id: U64::<LE>::new(101),
            source: NodeRowId::new(2),
            target: NodeRowId::new(3),
            ontology: smallvec![OntologyRowId::new(2)],
            embedding: None,
            confidence: None,
            source_confidence: None,
            target_confidence: None,
        },
    ];

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
            parents: smallvec![OntologyRowId::new(0)],
        },
    ];

    let cards = HashMap::from([
        (0, Card::verbatim("Person entity card".to_owned())),
        (1, Card::verbatim("Company entity card".to_owned())),
        (2, Card::verbatim("Employment link card".to_owned())),
    ]);

    MemoryDataset::new(nodes, edges, ontology, HashMap::new(), cards)
}

/// A deterministic provider deriving each embedding from its text hash.
struct HashEmbedder;

impl CardEmbedder for HashEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        let mut hasher = Sha256::new();
        hasher.update(b"fit test embedder");
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

fn config() -> FitConfig {
    FitConfig {
        seed: 7,
        selection: SelectionOptions {
            maximum_count: NonZero::new(LANDMARKS).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::fit(1.0, 0.1).expect("the reference falloff is well-conditioned"),
        neighbours: NonZero::new(4).expect("the fixture neighbour count is nonzero"),
        ..
    }
}

/// A deterministic classifier fitted from a synthetic corpus: the
/// supplied model input of every fixture fit.
fn fixture_classifier() -> Classifier {
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
    fit_classifier(training, ClassifierFitConfig { folds: 2, .. })
        .expect("the fixture classifier fits")
        .classifier
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn fit_publishes_a_complete_generation() {
    let path = scratch("complete");
    let root = GenerationRoot::new(&path).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_classifier();

    let published = fit(&dataset, &HashEmbedder, &config(), &classifier, None, &root)
        .await
        .expect("the fit should publish");

    // The manifest deserializes and its digests match the published
    // files byte for byte.
    let document =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");
    for entry in repository.files.files() {
        let bytes = fs::read(published.path().join(entry.name.as_str()))
            .expect("a published file should read");
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        assert_eq!(
            hasher.finalize(),
            entry.hash,
            "{} should match its recorded digest",
            entry.name,
        );
    }

    // The snapshot records what the dataset streamed.
    assert_eq!(repository.metadata.snapshot.nodes, NODES as u64);
    assert_eq!(repository.metadata.snapshot.edges, 2);
    assert_eq!(repository.metadata.snapshot.ontology_types, 3);
    assert!(repository.metadata.snapshot.axes.is_none());
    // The document echoes the whole configuration the fit ran under,
    // defaults included: a replay reads its settings from here.
    assert_eq!(repository.metadata.reproducibility.config, config());
    assert!(repository.metadata.reproducibility.prior.is_none());
    assert_eq!(repository.metadata.placement, Placement::LandmarkBaseline);

    // The recorded evidence passed - a published generation implies it.
    assert!(repository.metadata.evidence.norm.passes());
    assert!(repository.metadata.evidence.recall.meets_minimum());
    assert_eq!(repository.metadata.evidence.landmarks.selected, LANDMARKS);

    // Without a prior generation every unique card text embeds fresh.
    assert_eq!(repository.metadata.evidence.cards.reused, 0);
    assert_eq!(repository.metadata.evidence.cards.embedded, 3);

    // The policy stage resolved exactly the edge stream's relation
    // universe: the fixture's single link type, no overrides.
    assert_eq!(repository.metadata.evidence.policy.relations, 1);
    assert_eq!(repository.metadata.evidence.policy.overridden, 0);

    // Every row's baseline coordinate is bit-equal to its assigned
    // landmark's layout coordinate in the published skeleton.
    let coordinates = ArrayFile::open(published.path().join("coordinates.arr"))
        .expect("the coordinates should map");
    let placed = coordinates.points().expect("the coordinates are 2D points");
    assert_eq!(placed.len(), NODES);

    let skeleton = MappedLandmarkSkeleton::new(
        LandmarkFile::open(published.path().join("landmarks.lndm"))
            .expect("the skeleton should map"),
    )
    .expect("the skeleton should validate");
    assert!(
        placed
            .iter()
            .zip(skeleton.assignment())
            .all(|(point, ordinal)| {
                let landmark = skeleton.coordinates()[ordinal.usize()];
                point.x().to_bits() == landmark.x().to_bits()
                    && point.y().to_bits() == landmark.y().to_bits()
            }),
        "every row should sit exactly on its assigned landmark",
    );

    // The identity artifacts translate rows to source ids and back:
    // node ids are the fixture's row numbers, edge ids its 100 and 101.
    let nodes = MappedIdentityTable::<U64<LE>>::new(
        IdentityFile::open(published.path().join("node-identities.idnt"))
            .expect("the node identities should map"),
    )
    .expect("the node identities should validate");
    assert_eq!(nodes.len(), NODES as u64);
    for row in 0..NODES as u64 {
        assert_eq!(nodes.id(row), Some(U64::new(row)), "row {row}");
        assert_eq!(nodes.row_of(U64::new(row)), Some(row), "id {row}");
    }
    assert!(nodes.row_of(U64::new(NODES as u64 + 7)).is_none());

    let edge_ids = MappedIdentityTable::<U64<LE>>::new(
        IdentityFile::open(published.path().join("edge-identities.idnt"))
            .expect("the edge identities should map"),
    )
    .expect("the edge identities should validate");
    assert_eq!(edge_ids.len(), 2);
    assert_eq!(edge_ids.id(0), Some(U64::new(100)));
    assert_eq!(edge_ids.row_of(U64::new(101)), Some(1));

    // No transient state outlives the run: the root holds exactly the
    // generation and nothing dot-prefixed.
    let entries: Vec<_> = fs::read_dir(&path)
        .expect("the root should list")
        .map(|entry| entry.expect("the entry should read").file_name())
        .collect();
    assert_eq!(
        entries.len(),
        1,
        "the root should hold exactly the generation: {entries:?}"
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_policy_artifacts_publish_and_read_back() {
    let root = GenerationRoot::new(scratch("policy")).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_classifier();

    let published = fit(&dataset, &HashEmbedder, &config(), &classifier, None, &root)
        .await
        .expect("the fit should publish");

    // The published classifier reads back to the supplied model.
    let reopened = Classifier::from_artifact(
        &ClassifierFile::open(published.path().join("classifier.clsf"))
            .expect("the classifier should map"),
    )
    .expect("the classifier should validate");
    assert_eq!(reopened, classifier);

    // The policy table holds one policy: the fixture's link type.
    let policies = MappedPolicyTable::new(
        PolicyFile::open(published.path().join("policy.plcy")).expect("the table should map"),
    )
    .expect("the table should validate");
    assert_eq!(policies.len(), 1);
    let policy = policies
        .find(OntologyRowId::new(2))
        .expect("the link type resolves");

    // The resolved values are the classifier's own prediction of the
    // staged card embedding, narrowed at the resolution boundary.
    let cards = ArrayFile::open(published.path().join("card-embeddings.arr"))
        .expect("the card matrix should map");
    let embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>] = cards
        .vectors()
        .expect("the card matrix holds canonical-width rows");
    let prediction = classifier
        .predict(&embeddings[2])
        .expect("the fixture card classifies");
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the resolution boundary narrows probabilities the same way"
    )]
    {
        assert_eq!(
            policy.applicability.to_bits(),
            (prediction.applicability as f32).to_bits(),
        );
    }
    assert_eq!(
        policy.strength.to_bits(),
        1.0_f32.to_bits(),
        "the strength head is disabled",
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_prior_generation_seeds_reuse_and_retention() {
    let root = GenerationRoot::new(scratch("prior")).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_classifier();

    let first = fit(&dataset, &HashEmbedder, &config(), &classifier, None, &root)
        .await
        .expect("the first fit should publish");
    let prior = root
        .open(first.id())
        .expect("the published generation should open");

    let second = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &classifier,
        Some(&prior),
        &root,
    )
    .await
    .expect("the second fit should publish");
    let document = fs::read(second.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");

    // The lineage names the seeding generation.
    assert_eq!(repository.metadata.reproducibility.prior, Some(first.id()),);

    // Every unique card text hashes into the prior table: nothing
    // touches the provider.
    assert_eq!(repository.metadata.evidence.cards.reused, 3);
    assert_eq!(repository.metadata.evidence.cards.embedded, 0);

    // Equal corpus, seed, and config draw equal selection priorities,
    // and retention prefers prior landmarks among equal candidates:
    // the selection reproduces and every selected row is a retained
    // one. The skeleton is then bit-identical, which the recorded
    // digests certify.
    assert_eq!(repository.metadata.evidence.landmarks.retained, LANDMARKS);
    assert_eq!(
        repository.files.landmarks.hash,
        prior.repository().files.landmarks.hash,
    );
    assert_eq!(
        repository.files.node_identities.hash,
        prior.repository().files.node_identities.hash,
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn an_override_supersedes_the_classifier() {
    let root = GenerationRoot::new(scratch("override")).expect("the root should open");
    let dataset = dataset();

    // A human override asserts an exactly representable distribution
    // for the fixture's link type.
    let config = FitConfig {
        policy: PolicyOptions {
            overrides: vec![PolicyOverride {
                relation: OntologyRowId::new(2),
                source: PolicySource::Human,
                distribution: Posterior::new([0.25, 0.5, 0.25])
                    .expect("the asserted distribution sums to one"),
            }],
            ..
        },
        ..config()
    };

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config,
        &fixture_classifier(),
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    let policies = MappedPolicyTable::new(
        PolicyFile::open(published.path().join("policy.plcy")).expect("the table should map"),
    )
    .expect("the table should validate");
    let policy = policies
        .find(OntologyRowId::new(2))
        .expect("the link type resolves");

    // The override's distribution is the selected one, asserted with
    // applicability 1, so the attraction mix passes it through
    // unchanged.
    assert_eq!(policy.selected.coincident.to_bits(), 0.25_f32.to_bits());
    assert_eq!(policy.selected.proximal.to_bits(), 0.5_f32.to_bits());
    assert_eq!(policy.attraction.coincident.to_bits(), 0.25_f32.to_bits());
    assert_eq!(policy.attraction.proximal.to_bits(), 0.5_f32.to_bits());
    assert_eq!(policy.applicability.to_bits(), 1.0_f32.to_bits());

    // The document echoes the overrides and admission verbatim: the
    // record round-trips through the metadata schema.
    let document =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");
    assert_eq!(repository.metadata.reproducibility.config, config);
    assert_eq!(repository.metadata.evidence.policy.overridden, 1);
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn equal_seeds_publish_equal_generations() {
    let first_root = GenerationRoot::new(scratch("repeat-a")).expect("the root should open");
    let second_root = GenerationRoot::new(scratch("repeat-b")).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_classifier();

    let first = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &classifier,
        None,
        &first_root,
    )
    .await
    .expect("the first fit should publish");
    let second = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &classifier,
        None,
        &second_root,
    )
    .await
    .expect("the second fit should publish");

    // The generation id digests the metadata document, which digests
    // every artifact: equal ids certify byte-equal generations. The
    // converse is a property of the wired stage set, every member of
    // which is deterministic by construction - not a pipeline contract;
    // determinism is best effort, and a stage under the training
    // carve-out rescopes this assertion to the deterministic artifacts.
    assert_eq!(first.id(), second.id());
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_defective_corpus_publishes_nothing() {
    let path = scratch("defective");
    let root = GenerationRoot::new(&path).expect("the root should open");

    // One node violates the unit-norm contract badly enough that the
    // exhaustive small-corpus sample must catch it.
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0xBAD);
    let nodes = (0..NODES)
        .map(|row| Node {
            id: U64::<LE>::new(row as u64),
            ontology: smallvec![OntologyRowId::new(0)],
            embedding: if row == 17 {
                BoxedVecN::zero()
            } else {
                representation(&mut rng)
            },
            confidence: None,
        })
        .collect();
    let ontology = vec![Ontology {
        id: U64::<LE>::new(0),
        parents: smallvec![],
    }];
    let cards = HashMap::from([(0, Card::verbatim("Only type card".to_owned()))]);
    let dataset = MemoryDataset::new(nodes, Vec::new(), ontology, HashMap::new(), cards);

    let result = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &fixture_classifier(),
        None,
        &root,
    )
    .await;
    assert!(
        matches!(result, Err(FitError::RepresentationDefects(ref check)) if !check.passes()),
        "the defective corpus should fail the norm check",
    );

    // Failure leaves nothing behind: no generation, no transients.
    let entries: Vec<_> = fs::read_dir(&path)
        .expect("the root should list")
        .map(|entry| entry.expect("the entry should read").file_name())
        .collect();
    assert!(
        entries.is_empty(),
        "a failed fit should leave nothing visible: {entries:?}"
    );
}
