use core::{future::ready, num::NonZero};
use std::{collections::HashMap, fs};

use camino::Utf8PathBuf;
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{LE, U64};

use super::{FitConfig, FitError, fit};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node, NodeRowId, Ontology, OntologyRowId, PROJECTOR_DIMENSIONS,
        card::Card, memory::MemoryDataset,
    },
    file::{
        array::ArrayFile,
        generation::GenerationRoot,
        landmark::read::LandmarkFile,
        salt::{SaltRepository, metadata::Placement},
    },
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, BoxedVecN, VecN},
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        landmark::{artifact::MappedLandmarkSkeleton, select::SelectionOptions},
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

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn fit_publishes_a_complete_generation() {
    let path = scratch("complete");
    let root = GenerationRoot::new(&path).expect("the root should open");
    let dataset = dataset();

    let published = fit(&dataset, &HashEmbedder, &config(), &root)
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
    assert_eq!(repository.metadata.reproducibility.seed, 7);
    assert_eq!(repository.metadata.placement, Placement::LandmarkBaseline);

    // The recorded evidence passed - a published generation implies it.
    assert!(repository.metadata.evidence.norm.passes());
    assert!(repository.metadata.evidence.recall.meets_minimum());
    assert_eq!(repository.metadata.evidence.landmarks.selected, LANDMARKS);

    // Without a prior generation every unique card text embeds fresh.
    assert_eq!(repository.metadata.evidence.cards.reused, 0);
    assert_eq!(repository.metadata.evidence.cards.embedded, 3);

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
async fn equal_seeds_publish_equal_generations() {
    let first_root = GenerationRoot::new(scratch("repeat-a")).expect("the root should open");
    let second_root = GenerationRoot::new(scratch("repeat-b")).expect("the root should open");
    let dataset = dataset();

    let first = fit(&dataset, &HashEmbedder, &config(), &first_root)
        .await
        .expect("the first fit should publish");
    let second = fit(&dataset, &HashEmbedder, &config(), &second_root)
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

    let result = fit(&dataset, &HashEmbedder, &config(), &root).await;
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
