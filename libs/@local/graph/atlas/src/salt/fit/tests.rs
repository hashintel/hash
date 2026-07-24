use core::{future::ready, num::NonZero};
use std::{collections::HashMap, fs};

use camino::{Utf8Path, Utf8PathBuf};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use type_system::ontology::id::{OntologyTypeUuid, VersionedUrl};
use zerocopy::{FromBytes as _, LE, U64};

use super::{
    ClassifierInput, FitConfig, FitError, PlacementOptions, PolicyOptions, ProjectorOptions,
    StageError, SuppliedAnnotations, SuppliedVerdicts,
    compute::{PlacementInner, placement_device, resolve_supplied},
    error::PlacementError,
    fit,
    prepare::identity::{IdentityTable, IdentityTableArchive},
};
use crate::{
    dataset::{
        ArchivedOntologyTypeUuid, CANONICAL_DIMENSIONS, Edge, Node, Ontology, PROJECTOR_DIMENSIONS,
        card::Card, memory::MemoryDataset,
    },
    file::{
        WriteInto as _,
        array::ArrayFile,
        attraction::read::AttractionFile,
        classifier::read::ClassifierFile,
        generation::GenerationRoot,
        identity::read::IdentityFile,
        landmark::read::LandmarkFile,
        morton::read::MortonFile,
        policy::read::PolicyFile,
        postings::read::PostingsFile,
        quad::read::QuadFile,
        region::ByteStable,
        salt::{
            SaltRepository,
            metadata::{ClassifierEvidence, FrozenRadiusEvidence, Placement, RankingOrigin},
        },
        sprs::read::SprsFile,
    },
    identity::{EdgeRowId, Identity as _, NodeRowId, OntologyRowId},
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, Positive, Similarity, UnitFraction, Vec2, VecN},
    salt::{
        adjacency::{AdjacencyArchive, EdgeList},
        embedding::{CardEmbedder, EmbedderFingerprint},
        ladder::CanonicalError,
        landmark::{artifact::LandmarkSkeletonArchive, select::SelectionOptions},
        policy::{
            GeometryClass, PolicyOverride, PolicySource, Posterior,
            artifact::PolicyTableArchive,
            classifier::{
                Classifier, FitConfig as ClassifierFitConfig, TrainingRow, TrainingSet,
                fit as fit_classifier,
            },
        },
        postings::artifact::PostingsArchive,
        projector::{
            artifact,
            loss::CoincidentEnergy,
            model::NodeRole,
            train::{BatchPlan, NodeColumns, RelationLens, TrainError, TrainingSchedule, refresh},
            verdict::{PlacementClass, ReviewedVerdicts},
        },
        relation::artifact::{AttractionArchive, ProtectionArchive},
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
            ontology: smallvec![OntologyRowId::from_index(row & 1)],
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

/// A config echo published before the classifier supply settings existed omits them.
///
/// It deserializes to the compiled defaults, so generations from before the fields stay openable.
#[test]
fn config_echo_without_classifier_supply_settings_still_parses() {
    #[derive(serde::Serialize, serde::Deserialize)]
    struct Echo(#[serde(with = "super::FitConfigDef")] FitConfig);

    let mut document = serde_json::to_value(Echo(config())).expect("the echo serializes");
    let policy = document
        .get_mut("policy")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the echo carries a policy object");
    assert!(policy.remove("assembly").is_some());
    assert!(policy.remove("classifier_fit").is_some());

    let echoed: Echo =
        serde_json::from_value(document).expect("the pre-supply echo still deserializes");
    assert_eq!(echoed.0, config());
}

/// A config echo published before the group budget existed omits it.
///
/// It deserializes to the compiled default, and a tampered budget refuses to parse.
#[test]
fn config_echo_validates_the_group_budget() {
    #[derive(Debug, serde::Serialize, serde::Deserialize)]
    struct Echo(#[serde(with = "super::FitConfigDef")] FitConfig);

    let mut document = serde_json::to_value(Echo(config())).expect("the echo serializes");
    let assembly = document
        .pointer_mut("/policy/assembly")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the echo carries the assembly settings");
    assert!(assembly.remove("maximum_group_fraction").is_some());

    let echoed: Echo =
        serde_json::from_value(document.clone()).expect("the pre-budget echo still deserializes");
    assert_eq!(echoed.0, config());

    document
        .pointer_mut("/policy/assembly")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the echo carries the assembly settings")
        .insert("maximum_group_fraction".to_owned(), serde_json::json!(1.5));
    let error = serde_json::from_value::<Echo>(document)
        .expect_err("an out-of-range budget refuses to parse");
    assert!(error.to_string().contains("fraction in (0, 1]"));
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
        // The fixtures whose subject is not the placement opt out of
        // the default's training run; the projector tests configure
        // their own schedules.
        placement: PlacementOptions::LandmarkBaseline,
        ..
    }
}

/// A deterministic classifier fitted from a synthetic corpus.
///
/// The supplied model input of every fixture fit.
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

/// Wraps a fitted model as the fit's supplied classifier input.
fn supplied(classifier: Classifier) -> ClassifierInput {
    let mut hasher = Sha256::new();
    hasher.update(b"fixture classifier artifact");
    ClassifierInput::Supplied {
        classifier,
        source: hasher.finalize(),
    }
}

/// The fixture classifier as the fit's supplied input.
fn fixture_input() -> ClassifierInput {
    supplied(fixture_classifier())
}

/// Asserts the complete-generation fixture's snapshot counts and its multiplicity histogram.
///
/// The dataset streamed two single-typed edges, so the histogram is a single k = 1 entry.
fn assert_complete_generation_snapshot(repository: &SaltRepository) {
    assert_eq!(repository.metadata.snapshot.nodes, NODES as u64);
    assert_eq!(repository.metadata.snapshot.edges, 2);
    assert_eq!(repository.metadata.snapshot.ontology_types, 3);
    assert!(repository.metadata.snapshot.axes.is_none());
    assert_eq!(
        repository.metadata.evidence.relations.multi_typed_edges,
        vec![2],
    );
}

/// Asserts every file the manifest lists matches its recorded digest byte for byte.
fn assert_digests_match(path: &Utf8Path, repository: &SaltRepository) {
    for entry in repository.files.files() {
        let bytes = fs::read(path.join(entry.name.as_str())).expect("a published file should read");
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        assert_eq!(
            hasher.finalize(),
            entry.hash,
            "{} should match its recorded digest",
            entry.name,
        );
    }
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
#[expect(
    clippy::too_many_lines,
    reason = "the completeness proof walks every published artifact in one pass"
)]
async fn fit_publishes_a_complete_generation() {
    let path = scratch("complete");
    let root = GenerationRoot::new(&path).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_input();

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &classifier,
        None,
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    // The manifest deserializes and its digests match the published
    // files byte for byte.
    let document =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");
    assert_digests_match(published.path(), &repository);

    // No verdicts were supplied: the manifest records the absence.
    assert!(repository.files.reviewed_verdicts.is_none());
    // The classifier was supplied: the manifest records the source
    // digest and stages no annotation artifacts.
    assert!(repository.files.annotation_corpus.is_none());
    assert!(repository.files.annotation_embeddings.is_none());
    assert!(repository.files.annotation_hashes.is_none());
    let mut hasher = Sha256::new();
    hasher.update(b"fixture classifier artifact");
    assert_eq!(
        repository.metadata.evidence.classifier,
        Some(ClassifierEvidence::Supplied {
            source: hasher.finalize(),
        }),
    );
    // The baseline placement trains no model: the manifest records
    // the checkpoint's absence beside the placement identity.
    assert!(repository.files.projector.is_none());
    assert!(repository.metadata.evidence.projector.is_none());

    assert_complete_generation_snapshot(&repository);
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

    let skeleton = LandmarkSkeletonArchive::new(
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
    let nodes = IdentityTableArchive::<U64<LE>, NodeRowId>::new(
        IdentityFile::open(published.path().join("node-identities.idnt"))
            .expect("the node identities should map"),
    )
    .expect("the node identities should validate");
    assert_eq!(nodes.len(), NODES as u64);
    for row in 0..NODES as u64 {
        assert_eq!(
            nodes.id(NodeRowId::new(row)),
            Some(U64::new(row)),
            "row {row}"
        );
        assert_eq!(
            nodes.row_of(U64::new(row)),
            Some(NodeRowId::new(row)),
            "id {row}"
        );
    }
    assert!(nodes.row_of(U64::new(NODES as u64 + 7)).is_none());

    let edge_ids = IdentityTableArchive::<U64<LE>, EdgeRowId>::new(
        IdentityFile::open(published.path().join("edge-identities.idnt"))
            .expect("the edge identities should map"),
    )
    .expect("the edge identities should validate");
    assert_eq!(edge_ids.len(), 2);
    assert_eq!(edge_ids.id(EdgeRowId::new(0)), Some(U64::new(100)));
    assert_eq!(edge_ids.row_of(U64::new(101)), Some(EdgeRowId::new(1)));

    // The postings restate the fixture's memberships and parent graph
    // in base delivery order.
    assert_postings_read_back(published.path(), &repository);

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

/// Asserts the published postings against the fixture by hand.
///
/// Every position carries its row's direct type, only the link type names a parent, and the
/// evidence records the representation split - at 48 points the dense threshold is one member and a
/// dense run costs two words, so both node types go dense and the empty link type stays a list.
fn assert_postings_read_back(published: &Utf8Path, repository: &SaltRepository) {
    let postings = PostingsArchive::new(
        PostingsFile::open(published.join("postings.post")).expect("the postings should map"),
    )
    .expect("the postings should validate");
    assert_eq!(postings.types(), 3);
    assert_eq!(postings.points(), NODES as u64);

    let gather = ArrayFile::open(published.join("row-of-position.arr"))
        .expect("the gather column should map");
    for (position, &row) in gather
        .u32_elements()
        .expect("the gather column holds u32 rows")
        .iter()
        .enumerate()
    {
        let membership = postings
            .membership(OntologyRowId::from_u32(row & 1))
            .expect("the fixture types lie in the type domain");
        assert!(
            membership.contains(u32::try_from(position).expect("the fixture corpus is tiny")),
            "position {position} should carry row {row}'s direct type",
        );
    }
    let members = |type_row: u64| {
        postings
            .membership(OntologyRowId::new(type_row))
            .expect("the fixture types lie in the type domain")
            .count()
    };
    assert_eq!(members(0), members(1), "rows alternate the node types");
    assert_eq!(members(0) + members(1), NODES as u64);
    assert_eq!(members(2), 0, "the link type marks no node");
    assert_eq!(postings.parents(OntologyRowId::new(0)), Some(&[][..]));
    assert_eq!(postings.parents(OntologyRowId::new(2)), Some(&[0_u32][..]));

    let evidence = &repository.metadata.evidence.postings;
    assert_eq!(evidence.types, 3);
    assert_eq!(evidence.dense_types, 2);
    assert_eq!(evidence.membership_entries, 4);
    assert_eq!(evidence.parent_edges, 1);
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn policy_artifacts_publish_and_read_back() {
    let root = GenerationRoot::new(scratch("policy")).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_classifier();

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &supplied(classifier.clone()),
        None,
        None,
        &root,
    )
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
    let policies = PolicyTableArchive::new(
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
async fn lod_columns_publish_in_base_order() {
    let root = GenerationRoot::new(scratch("lod")).expect("the root should open");
    let dataset = dataset();

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &fixture_input(),
        None,
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    let column = |name: &str| -> Vec<u32> {
        let file = ArrayFile::open(published.path().join(name)).expect("the column should map");
        <[u32]>::ref_from_bytes(file.data())
            .expect("the mapped column is aligned and whole")
            .to_vec()
    };
    let position_of_row = column("position-of-row.arr");
    let row_of_position = column("row-of-position.arr");
    let rank_of_position = column("rank-of-position.arr");
    let position_of_rank = column("position-of-rank.arr");

    // The permutations are mutually inverse and total over the rows.
    assert_eq!(position_of_row.len(), NODES);
    assert_eq!(row_of_position.len(), NODES);
    for row in 0..NODES {
        assert_eq!(row_of_position[position_of_row[row] as usize] as usize, row);
    }
    for (position, &rank) in rank_of_position.iter().enumerate() {
        assert_eq!(position_of_rank[rank as usize] as usize, position);
    }

    // The morton column covers every row, bucket-segmented.
    let morton =
        MortonFile::open(published.path().join("morton.mrtn")).expect("the codes should map");
    assert_eq!(morton.count(), NODES as u64);

    // The wire column lies inside the wire frame, and rows the baseline
    // placed on one landmark stay coincident on the wire.
    let wire = ArrayFile::open(published.path().join("wire-coordinates.arr"))
        .expect("the wire column should map");
    let wire = wire.points().expect("the wire column holds 2D points");
    assert_eq!(wire.len(), NODES);
    assert!(
        wire.iter().all(|point| {
            (-1.0..=1.0).contains(&point.x()) && (-1.0..=1.0).contains(&point.y())
        }),
        "wire coordinates stay inside the [-1, 1] frame",
    );

    let canonical = ArrayFile::open(published.path().join("coordinates.arr"))
        .expect("the coordinates should map");
    let canonical = canonical.points().expect("the coordinates are 2D points");
    for (left, right) in (0..NODES).zip(1..NODES) {
        if canonical[left].x().to_bits() == canonical[right].x().to_bits()
            && canonical[left].y().to_bits() == canonical[right].y().to_bits()
        {
            let left = wire[position_of_row[left] as usize];
            let right = wire[position_of_row[right] as usize];
            assert_eq!(left.x().to_bits(), right.x().to_bits());
            assert_eq!(left.y().to_bits(), right.y().to_bits());
        }
    }

    // The metadata records the histogram over every row and the
    // default incident-degree ranking origin.
    let document =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");
    assert_eq!(
        repository
            .metadata
            .evidence
            .lod
            .bucket_histogram
            .iter()
            .sum::<u64>(),
        NODES as u64,
    );
    assert_eq!(repository.metadata.ranking, RankingOrigin::IncidentDegree);
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn supplied_verdicts_publish_verbatim() {
    let root = GenerationRoot::new(scratch("verdicts")).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_input();

    // A document in the canonical exporter's shape: alphabetical keys,
    // one reviewed-Proximal type verdict, one trailing newline.
    let document = concat!(
        r#"{"pair_verdicts":[],"schema":"atlas-reviewed-verdicts/1","#,
        r#""sources":{"cards.jsonl":"2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b"},"#,
        r#""type_verdicts":[{"class":"proximal","relation":"hash:https://hash.ai/@h/types/entity-type/delivers/","#,
        r#""reviewer":"Bilal Mahmoud","versioned_url":"https://hash.ai/@h/types/entity-type/delivers/v/3"}]}"#,
        "\n",
    );
    let supplied = SuppliedVerdicts::from_bytes(document.as_bytes())
        .expect("a contract-conforming document admits");

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &classifier,
        Some(&supplied),
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    // The manifest binds the role to the supplied file's identity.
    let manifest =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&manifest).expect("the document should deserialize");
    let entry = repository
        .files
        .reviewed_verdicts
        .as_ref()
        .expect("the supplied verdicts should be staged");
    assert_eq!(entry.name.as_str(), "reviewed-verdicts.json");
    assert_eq!(entry.hash, supplied.hash());

    // The published bytes are the supplied file verbatim, and they
    // still read back through the verdict reader the trainer uses.
    let bytes = fs::read(published.path().join("reviewed-verdicts.json"))
        .expect("the published file should read");
    assert_eq!(bytes, document.as_bytes());
    let read_back = ReviewedVerdicts::from_slice(&bytes).expect("the published bytes still parse");
    assert_eq!(read_back.type_verdicts().len(), 1);
}

/// Composes one vote with conforming provenance.
fn annotation_vote(verdict: &str) -> serde_json::Value {
    serde_json::json!({
        "card_hash": "2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b",
        "effort": "high",
        "framing": "S1xF1",
        "model_pinned": "gpt-5.2",
        "model_returned": "gpt-5.2-2026-05-01",
        "prompt_pack_hash": "2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b",
        "provider": "amazon-bedrock",
        "quantization": null,
        "repeat_index": 0,
        "rubric_version": "v2",
        "seed": 7,
        "temperature": 0.2,
        "verdict": verdict,
    })
}

/// Composes one hash-identity annotation card.
///
/// A distinct `slug` and `family` per card keeps every card its own fold group.
fn annotation_card(
    slug: &str,
    family: &str,
    holdout: Option<&str>,
    votes: &[serde_json::Value],
) -> serde_json::Value {
    serde_json::json!({
        "axes": {
            "base_url": format!("https://hash.ai/@h/types/entity-type/{slug}/"),
            "family": family,
            "inverse_of": [],
            "publisher": "hash.ai/@h",
        },
        "content": {
            "aliases": [],
            "ancestors": [],
            "constraints": {
                "direction": "source -> target",
                "distinct_values": null,
                "single_value": null,
                "symmetric": null,
                "transitive": null,
            },
            "description": format!("The subject stands in the {slug} relation to the object."),
            "endpoint_constraints": [],
            "examples": [],
            "inverse": null,
            "language": "en",
            "slug": slug,
            "source_types": [{"description": null, "label": "Thing"}],
            "target_types": [{"description": null, "label": "Thing"}],
            "title": slug,
        },
        "flags": {"holdout": holdout, "prescreen_stratum": null, "shot_excluded": false},
        "identity": format!("https://hash.ai/@h/types/entity-type/{slug}/v/1"),
        "retrieved_at": null,
        "source": "hash",
        "source_record_hash": null,
        "votes": votes,
    })
}

/// Composes the six-card fixture corpus: four trained cards in four fold groups.
///
/// One geometry-verdict holdout, one unclear-verdict holdout; cards ascend by identity.
fn annotation_document() -> String {
    serde_json::json!({
        "cards": [
            annotation_card(
                "alpha",
                "f-1",
                None,
                &[annotation_vote("overlay"), annotation_vote("overlay")],
            ),
            annotation_card(
                "beta",
                "f-2",
                None,
                &[annotation_vote("coincident"), annotation_vote("proximal")],
            ),
            annotation_card(
                "delta",
                "f-3",
                None,
                &[annotation_vote("proximal"), annotation_vote("proximal")],
            ),
            annotation_card(
                "gamma",
                "f-4",
                None,
                &[annotation_vote("overlay"), annotation_vote("coincident")],
            ),
            annotation_card(
                "rho",
                "f-5",
                Some("proximal"),
                &[annotation_vote("proximal"), annotation_vote("proximal")],
            ),
            annotation_card(
                "sigma",
                "f-6",
                Some("unclear"),
                &[annotation_vote("unclear")],
            ),
        ],
        "schema": "atlas-annotation-corpus/1",
        "sources": {"cards.jsonl": "2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b"},
    })
    .to_string()
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn annotation_corpus_fits_and_stages_the_classifier() {
    let root = GenerationRoot::new(scratch("annotations")).expect("the root should open");
    let dataset = dataset();

    let document = annotation_document();
    let supplied = SuppliedAnnotations::from_bytes(document.as_bytes())
        .expect("a contract-conforming corpus admits");

    let mut config = config();
    config.policy.classifier_fit = ClassifierFitConfig { folds: 2, .. };

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config,
        &ClassifierInput::Annotations(supplied.clone()),
        None,
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    // The manifest binds the corpus role to the supplied file's
    // identity, and every staged file matches its recorded digest.
    let manifest =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&manifest).expect("the document should deserialize");
    assert_digests_match(published.path(), &repository);
    let corpus_entry = repository
        .files
        .annotation_corpus
        .as_ref()
        .expect("the supplied corpus should be staged");
    assert_eq!(corpus_entry.name.as_str(), "annotation-corpus.json");
    assert_eq!(corpus_entry.hash, supplied.hash());

    // The published corpus bytes are the supplied file verbatim.
    let bytes = fs::read(published.path().join("annotation-corpus.json"))
        .expect("the published corpus should read");
    assert_eq!(bytes, document.as_bytes());

    // The annotation embedding table carries the trained rows first
    // and the holdout rows after them, at the canonical width.
    assert!(repository.files.annotation_embeddings.is_some());
    assert!(repository.files.annotation_hashes.is_some());
    let embeddings = ArrayFile::open(published.path().join("annotation-embeddings.arr"))
        .expect("the annotation matrix should map");
    let rows: &[AlignedVecN<CANONICAL_DIMENSIONS>] = embeddings
        .vectors()
        .expect("the annotation matrix holds canonical-width rows");
    assert_eq!(rows.len(), 6);

    // The staged classifier is the fitted model, reading back valid.
    let reopened = Classifier::from_artifact(
        &ClassifierFile::open(published.path().join("classifier.clsf"))
            .expect("the classifier should map"),
    )
    .expect("the fitted classifier validates");

    // The evidence records the assembly policy, the fit summary, and
    // the holdout evaluation; the unclear verdict asserts no geometry
    // class and stays out of the agreement denominator.
    let Some(ClassifierEvidence::Fitted {
        corpus,
        assembly,
        fit: summary,
        holdout,
    }) = repository.metadata.evidence.classifier
    else {
        panic!("the manifest should record an in-run classifier fit");
    };
    assert_eq!(corpus, supplied.hash());
    assert_eq!(assembly.supplied, 6);
    assert_eq!(assembly.trained, 4);
    assert_eq!(assembly.holdouts_excluded, 2);
    assert_eq!(assembly.zero_weight_dropped, 0);
    assert_eq!(assembly.fold_groups, 4);
    assert_eq!(summary.folds, 2);
    assert!(summary.iterations > 0);
    assert!(summary.raw_cross_entropy.is_finite());

    assert_eq!(holdout.cards.len(), 2);
    assert_eq!(holdout.evaluated, 1);
    let rho = &holdout.cards[0];
    assert_eq!(rho.identity, "https://hash.ai/@h/types/entity-type/rho/v/1",);
    assert_eq!(rho.agree, Some(rho.predicted == GeometryClass::Proximal));
    assert_eq!(holdout.agreements, usize::from(rho.agree == Some(true)));
    let sigma = &holdout.cards[1];
    assert_eq!(
        sigma.identity,
        "https://hash.ai/@h/types/entity-type/sigma/v/1",
    );
    assert_eq!(sigma.agree, None);

    // The recorded prediction is the staged model's own argmax over
    // the holdout card's staged embedding.
    let prediction = reopened
        .predict(&rows[4])
        .expect("the holdout embedding classifies");
    let expected = [
        GeometryClass::Coincident,
        GeometryClass::Proximal,
        GeometryClass::Overlay,
    ]
    .into_iter()
    .max_by(|left, right| {
        prediction
            .calibrated
            .probability(*left)
            .total_cmp(&prediction.calibrated.probability(*right))
    })
    .expect("the class set is nonempty");
    assert_eq!(rho.predicted, expected);
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn prior_generation_seeds_reuse_and_retention() {
    let root = GenerationRoot::new(scratch("prior")).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_input();

    let first = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &classifier,
        None,
        None,
        &root,
    )
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
        None,
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
async fn override_supersedes_the_classifier() {
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
        &fixture_input(),
        None,
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    let policies = PolicyTableArchive::new(
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
    let classifier = fixture_input();

    let first = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        &classifier,
        None,
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
async fn defective_corpus_publishes_nothing() {
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
        &fixture_input(),
        None,
        None,
        &root,
    )
    .await;
    assert!(
        matches!(
            result,
            Err(FitError::Stage(StageError::RepresentationDefects(ref check))) if !check.passes(),
        ),
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

/// The projector fixture's training run.
///
/// Short enough for a test, long enough that the boundary and every rung run.
fn projector_options(asserted_radius: Option<f32>) -> ProjectorOptions {
    let mut options = ProjectorOptions::ratified();
    options.schedule = TrainingSchedule::new(
        NonZero::new(12).expect("the fixture step count is nonzero"),
        6,
        NonZero::new(4).expect("the fixture cadence is nonzero"),
        UnitFraction::new(1.0e-3).expect("the fixture initial rate is a unit fraction"),
        UnitFraction::new(1.0e-5).expect("the fixture minimum rate is a unit fraction"),
    )
    .expect("the fixture schedule is valid");
    options.plan = BatchPlan {
        semantic_pairs: NonZero::new(8).expect("the fixture draw is nonzero"),
        ordinary_pairs: 4,
        relation_types: 1,
        relation_cap: NonZero::new(4).expect("the fixture cap is nonzero"),
        hard_queries: 2,
        landmark_anchors: 2,
        temporal_anchors: 0,
    };
    options.lens = RelationLens::new(
        CoincidentEnergy::new(0.5, 0.5).expect("the fixture energy is valid"),
        Positive::new(0.25).expect("the fixture temperature is positive"),
        Positive::new(1.0e-8).expect("the fixture scale guard is positive"),
        asserted_radius,
    )
    .expect("the fixture lens is valid");
    options.forward_rows = NonZero::new(16).expect("the fixture slice is nonzero");
    options
}

/// Reproduces one corpus forward of a published generation's model.
// The reprojection rides the placement stage's own inference backend:
// the certificate compares the published column against the checkpoint
// bit for bit, and a cross-backend comparison would measure kernel
// flavor instead of publish fidelity.
fn reproject(published: &Utf8Path, options: &ProjectorOptions, eta: f32) -> Vec<Vec2> {
    let checkpoint = fs::read(published.join("projector.mpk")).expect("the checkpoint reads");
    let model = artifact::open_model::<PlacementInner>(
        checkpoint.as_slice(),
        options.architecture,
        &placement_device(),
    )
    .expect("the checkpoint opens on the plain backend");

    let representations =
        ArrayFile::open(published.join("representations.arr")).expect("the matrix maps");
    let rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>] = representations
        .vectors()
        .expect("the matrix holds projector-width rows");
    let roles = vec![NodeRole::KnowledgeEntity; rows.len()];

    refresh::forward(
        &model,
        NodeColumns {
            representations: rows,
            roles: &roles,
        },
        eta,
        options.forward_rows,
        &placement_device(),
    )
    .expect("the published model projects finitely")
}

#[test]
fn default_placement_is_the_trained_projector() {
    // The conditioned projector is the pipeline's architecture; a bare
    // configuration trains it under the reference schedule. The
    // baseline is the configured fallback, never the default.
    let config = FitConfig {
        seed: 0,
        selection: SelectionOptions {
            maximum_count: NonZero::new(LANDMARKS).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::fit(1.0, 0.1).expect("the reference falloff is well-conditioned"),
        ..
    };

    let PlacementOptions::Projector(options) = &config.placement else {
        panic!("the default placement should train the projector");
    };
    assert_eq!(*options, ProjectorOptions::ratified());
    assert_eq!(options.schedule.steps().get(), 20_000);
    assert_eq!(options.schedule.boundary(), 5_000);
    assert_eq!(options.ladder.canonical.to_bits(), 1.0_f32.to_bits());
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn forceless_projector_publishes_the_baseline_rung() {
    let root = GenerationRoot::new(scratch("projector-vacuous")).expect("the root should open");
    let dataset = dataset();

    // An Overlay override strips the fixture's link type of force: the
    // boundary freezes nothing, the lens provably never trains, and the
    // ladder is skipped whole.
    let options = projector_options(None);
    let config = FitConfig {
        placement: PlacementOptions::Projector(options.clone()),
        policy: PolicyOptions {
            overrides: vec![PolicyOverride {
                relation: OntologyRowId::new(2),
                source: PolicySource::Human,
                distribution: Posterior::new([0.0, 0.0, 1.0])
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
        &fixture_input(),
        None,
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    let document =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");

    assert_eq!(repository.metadata.placement, Placement::Projector);
    assert_eq!(repository.metadata.reproducibility.config, config);
    let evidence = repository
        .metadata
        .evidence
        .projector
        .as_ref()
        .expect("a trained placement records projector evidence");
    assert_eq!(evidence.steps, 12);
    assert_eq!(
        evidence.boundary,
        Some(FrozenRadiusEvidence::Vacuous),
        "a forceless index freezes nothing"
    );
    assert!(
        evidence.ladder.is_none(),
        "a forceless run measures no ladder"
    );

    // The published checkpoint reproduces the published coordinates:
    // reopening the model on a plain backend and projecting the
    // published representations at the baseline rung is bit-identical
    // to the staged column.
    let projected = reproject(published.path(), &options, 0.0);
    let coordinates =
        ArrayFile::open(published.path().join("coordinates.arr")).expect("the column maps");
    let placed = coordinates.points().expect("the column holds 2D points");
    assert_eq!(placed.len(), projected.len());
    assert!(
        placed
            .iter()
            .zip(&projected)
            .all(
                |(persisted, fresh)| persisted.x().to_bits() == fresh.x().to_bits()
                    && persisted.y().to_bits() == fresh.y().to_bits()
            ),
        "the published column should be the model's own projection",
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn trained_lens_publishes_the_canonical_rung_aligned() {
    let root = GenerationRoot::new(scratch("projector-ladder")).expect("the root should open");
    let dataset = dataset();

    // A Proximal override gives the link type full force; the memory
    // dataset's ids carry no store identity, so the radius must be
    // asserted for the boundary to freeze.
    let options = projector_options(Some(1.0));
    let config = FitConfig {
        placement: PlacementOptions::Projector(options.clone()),
        policy: PolicyOptions {
            overrides: vec![PolicyOverride {
                relation: OntologyRowId::new(2),
                source: PolicySource::Human,
                distribution: Posterior::new([0.0, 1.0, 0.0])
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
        &fixture_input(),
        None,
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    let document =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");

    assert_eq!(repository.metadata.placement, Placement::Projector);
    let evidence = repository
        .metadata
        .evidence
        .projector
        .as_ref()
        .expect("a trained placement records projector evidence");
    assert_eq!(
        evidence.boundary,
        Some(FrozenRadiusEvidence::Asserted { radius: 1.0 }),
        "the configured radius supersedes the empty review set"
    );

    let ladder = evidence
        .ladder
        .as_ref()
        .expect("a trained lens measures the ladder");
    assert_eq!(ladder.rungs.len(), options.ladder.conditions.len());
    assert_eq!(ladder.canonical.to_bits(), 1.0_f32.to_bits());
    assert_eq!(ladder.canonical_index, ladder.rungs.len() - 1);
    assert!(ladder.persisted_relation_loss.is_finite());

    // The baseline rung is its own frame; every recorded loss is a
    // real measurement.
    assert_eq!(ladder.rungs[0].alignment, Similarity::IDENTITY);
    assert_eq!(
        ladder.rungs[0].baseline_movement.to_bits(),
        0.0_f64.to_bits()
    );
    assert!(
        ladder
            .rungs
            .iter()
            .all(|rung| rung.relation_loss.is_finite()),
    );
    // The lens is trained: the canonical rung moved measurably against
    // its predecessor.
    let canonical = &ladder.rungs[ladder.canonical_index];
    assert!(canonical.distinguishable && canonical.monotonic);
    assert!(canonical.adjacent_movement > 0.0);

    // The published column is the canonical rung's projection under
    // the recorded alignment, bit for bit: checkpoint, evidence, and
    // column describe one field.
    let projected = reproject(published.path(), &options, ladder.canonical);
    let coordinates =
        ArrayFile::open(published.path().join("coordinates.arr")).expect("the column maps");
    let placed = coordinates.points().expect("the column holds 2D points");
    assert_eq!(placed.len(), projected.len());
    assert!(
        placed.iter().zip(&projected).all(|(persisted, fresh)| {
            let aligned = canonical.alignment.apply(*fresh);
            persisted.x().to_bits() == aligned.x().to_bits()
                && persisted.y().to_bits() == aligned.y().to_bits()
        }),
        "the published column should be the aligned canonical projection",
    );
}

/// The vacuous placement unblocks a Proximal corpus lacking reviewed coverage.
///
/// A corpus whose relations carry Proximal force refuses to train without reviewed coverage or an
/// assertion - and the vacuous placement is exactly what unblocks it: the same configuration trains
/// and publishes with the relation evidence withheld.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn vacuous_placement_trains_without_reviews() {
    let dataset = dataset();
    // The Proximal override gives the link type full force, and
    // nothing supplies reviewed pairs or a radius.
    let policy = PolicyOptions {
        overrides: vec![PolicyOverride {
            relation: OntologyRowId::new(2),
            source: PolicySource::Human,
            distribution: Posterior::new([0.0, 1.0, 0.0])
                .expect("the asserted distribution sums to one"),
        }],
        ..
    };

    let refused = GenerationRoot::new(scratch("vacuous-refused")).expect("the root should open");
    let refused_config = FitConfig {
        placement: PlacementOptions::Projector(projector_options(None)),
        policy: policy.clone(),
        ..config()
    };
    let result = fit(
        &dataset,
        &HashEmbedder,
        &refused_config,
        &fixture_input(),
        None,
        None,
        &refused,
    )
    .await;
    assert!(
        matches!(
            result,
            Err(FitError::Stage(StageError::Placement(
                PlacementError::Train(TrainError::MissingProximalReviews)
            ))),
        ),
        "proximal force without reviews or an assertion should refuse",
    );

    let root = GenerationRoot::new(scratch("vacuous-trains")).expect("the root should open");
    let mut options = projector_options(None);
    options.vacuous = true;
    let vacuous_config = FitConfig {
        placement: PlacementOptions::Projector(options),
        policy,
        ..config()
    };
    let published = fit(
        &dataset,
        &HashEmbedder,
        &vacuous_config,
        &fixture_input(),
        None,
        None,
        &root,
    )
    .await
    .expect("the vacuous placement should publish");

    let document =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");

    // The placement trained, no radius froze, and the untrained lens
    // publishes the baseline rung directly - no ladder to measure.
    assert_eq!(repository.metadata.placement, Placement::Projector);
    let evidence = repository
        .metadata
        .evidence
        .projector
        .as_ref()
        .expect("a trained placement records projector evidence");
    assert_eq!(
        evidence.boundary,
        Some(FrozenRadiusEvidence::Vacuous),
        "the evidence records the vacuous run in place of a radius",
    );
    assert!(
        evidence.ladder.is_none(),
        "an untrained lens has no ladder to measure",
    );

    // The relation artifacts publish real force regardless: only the
    // trainer's view was vacuous.
    let attraction = AttractionArchive::new(
        AttractionFile::open(published.path().join("attraction.atrc"))
            .expect("the attraction artifact should open"),
    )
    .expect("the attraction artifact should validate");
    assert!(
        attraction.group_count() > 0,
        "the published attraction index still carries the corpus's force",
    );

    let coordinates = ArrayFile::open(published.path().join("coordinates.arr"))
        .expect("the coordinate column should open");
    assert_eq!(
        coordinates
            .points()
            .expect("the column holds 2D points")
            .len(),
        NODES,
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn canonical_condition_outside_the_schedule_publishes_nothing() {
    let path = scratch("projector-unknown-rung");
    let root = GenerationRoot::new(&path).expect("the root should open");
    let dataset = dataset();

    // 0.3 names no rung of the measured schedule: the configuration
    // contradicts itself and the fit must refuse to publish.
    let mut options = projector_options(Some(1.0));
    options.ladder.canonical = 0.3;
    let config = FitConfig {
        placement: PlacementOptions::Projector(options),
        policy: PolicyOptions {
            overrides: vec![PolicyOverride {
                relation: OntologyRowId::new(2),
                source: PolicySource::Human,
                distribution: Posterior::new([0.0, 1.0, 0.0])
                    .expect("the asserted distribution sums to one"),
            }],
            ..
        },
        ..config()
    };

    let result = fit(
        &dataset,
        &HashEmbedder,
        &config,
        &fixture_input(),
        None,
        None,
        &root,
    )
    .await;
    assert!(
        matches!(
            result,
            Err(FitError::Stage(StageError::Placement(
                PlacementError::Canonical(CanonicalError::UnknownRung { .. })
            ))),
        ),
        "an off-schedule canonical condition should abort the fit",
    );

    let entries: Vec<_> = fs::read_dir(&path)
        .expect("the root should list")
        .map(|entry| entry.expect("the entry should read").file_name())
        .collect();
    assert!(
        entries.is_empty(),
        "a failed fit should leave nothing visible: {entries:?}"
    );
}

/// A corpus exercising the edge artifacts.
///
/// Two relation types, a parallel pair, a self-loop, scored and unscored confidences.
///
/// Edge rows: 0 and 3 both `0 → 1` under relation 2 (row 0 scored), 1 is `2 → 3` under relations
/// 2 and 3, 2 is the self-loop `3 → 3` under relation 3.
fn relation_dataset() -> MemoryDataset {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0xED6E);

    let nodes = (0..NODES)
        .map(|row| Node {
            id: U64::<LE>::new(row as u64),
            ontology: smallvec![OntologyRowId::from_index(row & 1)],
            embedding: representation(&mut rng),
            confidence: None,
        })
        .collect();

    let unscored = |id: u64, source: u64, target: u64, ontology| Edge {
        id: U64::<LE>::new(id),
        source: NodeRowId::new(source),
        target: NodeRowId::new(target),
        ontology,
        embedding: None,
        confidence: None,
        source_confidence: None,
        target_confidence: None,
    };
    let edges = vec![
        Edge {
            confidence: Some(0.5),
            ..unscored(200, 0, 1, smallvec![OntologyRowId::new(2)])
        },
        unscored(
            201,
            2,
            3,
            smallvec![OntologyRowId::new(2), OntologyRowId::new(3)],
        ),
        Edge {
            confidence: Some(0.75),
            source_confidence: Some(0.5),
            ..unscored(202, 3, 3, smallvec![OntologyRowId::new(3)])
        },
        unscored(203, 0, 1, smallvec![OntologyRowId::new(2)]),
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
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(3),
            parents: smallvec![],
        },
    ];

    let cards = HashMap::from([
        (0, Card::verbatim("Person entity card".to_owned())),
        (1, Card::verbatim("Company entity card".to_owned())),
        (2, Card::verbatim("Employment link card".to_owned())),
        (3, Card::verbatim("Membership link card".to_owned())),
    ]);

    MemoryDataset::new(nodes, edges, ontology, HashMap::new(), cards)
}

/// Collects a mapped adjacency list into its edge row numbers.
fn edge_rows(list: Option<EdgeList<'_>>) -> Vec<u64> {
    list.expect("the queried node row is in domain")
        .iter()
        .map(EdgeRowId::get)
        .collect()
}

/// Asserts the published adjacency matches a by-hand pass over the fixture edges.
///
/// The parallel pair leaves node 0, the self-loop occupies both slots of node 3, and untouched
/// nodes hold empty runs.
fn assert_adjacency_reads_back(published: &Utf8Path) {
    let adjacency = AdjacencyArchive::new(
        SprsFile::open(published.join("adjacency.sprs")).expect("the adjacency should map"),
    )
    .expect("the adjacency should validate");
    assert_eq!(adjacency.rows(), NODES as u64);
    assert_eq!(adjacency.edges(), 4);

    assert_eq!(edge_rows(adjacency.outgoing(NodeRowId::new(0))), [0, 3]);
    assert_eq!(edge_rows(adjacency.incoming(NodeRowId::new(1))), [0, 3]);
    assert_eq!(edge_rows(adjacency.outgoing(NodeRowId::new(3))), [2]);
    assert_eq!(edge_rows(adjacency.incoming(NodeRowId::new(3))), [1, 2]);
    assert_eq!(edge_rows(adjacency.incident(NodeRowId::new(3))), [2, 1, 2]);
    assert!(
        edge_rows(adjacency.incident(NodeRowId::new(7))).is_empty(),
        "an untouched node holds empty runs",
    );
}

/// Asserts the published attraction index against the [`relation_dataset`] readings.
///
/// Three retained instances under relation 2, one under relation 3 (the self-loop reading carries
/// no force and is dropped), with the overridden weights and confidence provenance intact.
fn assert_attraction_reads_back(attraction: &AttractionArchive) {
    assert_eq!(attraction.rows(), NODES as u64);
    assert_eq!(attraction.group_count(), 2);
    assert_eq!(attraction.edge_count(), 4);

    let employment = attraction.group(0);
    assert_eq!(employment.relation(), OntologyRowId::new(2));
    assert_eq!(employment.len(), 3);
    let membership = attraction.group(1);
    assert_eq!(membership.relation(), OntologyRowId::new(3));
    assert_eq!(membership.len(), 1);

    // The group weights are the overridden distribution: the Proximal
    // weight is p*_P = 1 · 0.5, and the Coincident weight vanishes
    // under the default kappa_C = 0.
    let weights = employment.weights();
    assert_eq!(weights.proximal.to_bits(), 0.5_f32.to_bits());
    assert_eq!(weights.coincident.to_bits(), 0.0_f32.to_bits());

    // Confidence values and provenance survive the drain, the spool,
    // and the published index: edge row 0's lone link score combines
    // with two neutral factors.
    let scored = employment
        .edges()
        .find(|edge| edge.edge.get() == 0)
        .expect("edge row 0 is retained under relation 2");
    assert_eq!(scored.confidence.value().to_bits(), 0.5_f32.to_bits());
    assert!(scored.confidence.scored().link());
    assert!(!scored.confidence.scored().source());
    assert!(!scored.confidence.scored().target());

    let neutral = membership.edge(0);
    assert_eq!(neutral.edge.get(), 1);
    assert_eq!(neutral.confidence.value().to_bits(), 1.0_f32.to_bits());
    assert!(!neutral.confidence.scored().link());
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edge_artifacts_publish_and_read_back() {
    let root = GenerationRoot::new(scratch("edge-artifacts")).expect("the root should open");
    let dataset = relation_dataset();
    let classifier = fixture_input();

    // Human overrides pin both relations to an exact distribution
    // (applicability 1), so every attraction weight and force mass
    // below is a hand-computable power of two instead of a classifier
    // prediction.
    let mut config = config();
    config.policy.overrides = [2, 3]
        .into_iter()
        .map(|relation| PolicyOverride {
            relation: OntologyRowId::new(relation),
            source: PolicySource::Human,
            distribution: Posterior::new([0.25, 0.5, 0.25])
                .expect("the fixture distribution sums to one"),
        })
        .collect();

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config,
        &classifier,
        None,
        None,
        &root,
    )
    .await
    .expect("the fit should publish");

    // The endpoint column is the edge stream's (source, target) pairs
    // in row order, little-endian by variant.
    let endpoints = ArrayFile::open(published.path().join("edge-endpoints.arr"))
        .expect("the endpoint column should map");
    assert_eq!(
        endpoints
            .u64_le_pairs()
            .expect("the endpoint column holds little-endian u64 pairs"),
        [[0, 1], [2, 3], [3, 3], [0, 1]].map(|pair| pair.map(U64::<LE>::new)),
    );

    assert_adjacency_reads_back(published.path());

    // The delivery ranking runs on incident degree by default: node
    // row 3 (three incident slots) outranks every other row, so it
    // holds base rank 0 regardless of the seed.
    let position_of_rank = ArrayFile::open(published.path().join("position-of-rank.arr"))
        .expect("the rank column should map");
    let row_of_position = ArrayFile::open(published.path().join("row-of-position.arr"))
        .expect("the gather column should map");
    let first_position = position_of_rank
        .u32_elements()
        .expect("the rank column holds u32 positions")[0];
    assert_eq!(
        row_of_position
            .u32_elements()
            .expect("the gather column holds u32 rows")[first_position as usize],
        3,
        "the highest-degree row delivers first",
    );

    // The attraction index groups the retained instances by relation,
    // asserted against the fixture readings by hand.
    let attraction = AttractionArchive::new(
        AttractionFile::open(published.path().join("attraction.atrc"))
            .expect("the attraction index should map"),
    )
    .expect("the attraction index should validate");
    assert_attraction_reads_back(&attraction);

    // The protection index and the quadtree publish beside them.
    let _protection = ProtectionArchive::new(
        SprsFile::open(published.path().join("protection.sprs"))
            .expect("the protection index should map"),
    )
    .expect("the protection index should validate");
    let _quad =
        QuadFile::open(published.path().join("quadtree.quad")).expect("the quadtree should map");

    // The ontology identities translate type rows to source ids and
    // back: the fixture's type ids are its row numbers.
    let ontology_ids = IdentityTableArchive::<U64<LE>, OntologyRowId>::new(
        IdentityFile::open(published.path().join("ontology-identities.idnt"))
            .expect("the ontology identities should map"),
    )
    .expect("the ontology identities should validate");
    assert_eq!(ontology_ids.len(), 4);
    assert_eq!(ontology_ids.id(OntologyRowId::new(2)), Some(U64::new(2)));
    assert_eq!(
        ontology_ids.row_of(U64::new(3)),
        Some(OntologyRowId::new(3))
    );

    // The metadata document accounts for every reading: four retained
    // instances, nothing pruned at the zero threshold, one
    // self-reference dropped.
    let document =
        fs::read(published.path().join("metadata.json")).expect("the document should read");
    let repository: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");
    assert_eq!(repository.metadata.snapshot.edges, 4);
    assert_eq!(repository.metadata.evidence.policy.relations, 2);
    assert_eq!(repository.metadata.evidence.policy.overridden, 2);

    // Force masses by hand: each retained instance weighs c · s+ · s
    // with s+ = 0.5 and the reading share s = 1/multiplicity. The
    // scored single-typed edge gives 0.5 · 0.5, the two-typed edge's
    // readings give two 1.0 · 0.5 · 0.5, and the unscored single-typed
    // edge gives 1.0 · 0.5: total 1.25. Every factor is a power of
    // two, so the sum is exact.
    let relations = &repository.metadata.evidence.relations;
    assert_eq!(relations.retained_edges, 4);
    assert_eq!(relations.pruned_edges, 0);
    assert_eq!(relations.self_references, 1);
    assert_eq!(relations.retained_mass.to_bits(), 1.25_f64.to_bits());
    assert_eq!(relations.pruned_mass.to_bits(), 0.0_f64.to_bits());
    // Three edges carry one relation reading (the self-loop counts at
    // the drain), one carries two.
    assert_eq!(relations.multi_typed_edges, vec![3, 1]);

    let quad = &repository.metadata.evidence.quad;
    assert!(quad.nodes >= 1);
    assert!(quad.leaves <= quad.nodes);
    assert!(
        quad.type_entries >= 1,
        "placed rows carry their direct types into the tile sets",
    );
}

/// Writes an ontology identity column of `I` ids into `dir`.
fn write_ontology_identities<I>(dir: &Utf8Path, ids: impl IntoIterator<Item = I>) -> Utf8PathBuf
where
    I: ByteStable,
{
    fs::create_dir_all(dir).expect("the scratch directory is writable");
    let path = dir.join("ontology-identities.idnt");
    let mut table = IdentityTable::<I>::new();
    for id in ids {
        table.push(id);
    }
    let file = fs::File::create(path.as_std_path()).expect("the scratch file is writable");
    table
        .write_into(std::io::BufWriter::new(file))
        .expect("the fixture table writes");
    path
}

/// Derives the store identity of one versioned type URL.
fn store_identity(url: &str) -> ArchivedOntologyTypeUuid {
    let url: VersionedUrl = url.parse().expect("the fixture url parses");
    ArchivedOntologyTypeUuid::from(OntologyTypeUuid::from_url(&url).into_uuid())
}

#[test]
fn store_identity_verdicts_resolve_by_reviewed_version() {
    // The staged column holds the generation's own type versions.
    let path = write_ontology_identities(
        &scratch("resolve"),
        [
            store_identity("https://hash.ai/@h/types/entity-type/arrives-at/v/2"),
            store_identity("https://hash.ai/@h/types/entity-type/located-at/v/1"),
            store_identity("https://hash.ai/@h/types/entity-type/delivers/v/3"),
        ],
    );

    // Three verdicts: one from a foreign store, one reviewed at a
    // version the column does not hold, one reviewed at a version it
    // does. Only the exact reviewed version resolves - versions are
    // immutable and distinct, so a verdict for another version of the
    // same base URL is evidence about a different card.
    let document = concat!(
        r#"{"pair_verdicts":[],"schema":"atlas-reviewed-verdicts/1","sources":{},"#,
        r#""type_verdicts":["#,
        r#"{"class":"overlay","relation":"hash:http://localhost:3000/@linktest/types/entity-type/acquaintance/","#,
        r#""reviewer":"Bilal Mahmoud","versioned_url":"http://localhost:3000/@linktest/types/entity-type/acquaintance/v/1"},"#,
        r#"{"class":"coincident","relation":"hash:https://hash.ai/@h/types/entity-type/arrives-at/","#,
        r#""reviewer":"Bilal Mahmoud","versioned_url":"https://hash.ai/@h/types/entity-type/arrives-at/v/1"},"#,
        r#"{"class":"proximal","relation":"hash:https://hash.ai/@h/types/entity-type/located-at/","#,
        r#""reviewer":"Bilal Mahmoud","versioned_url":"https://hash.ai/@h/types/entity-type/located-at/v/1"}"#,
        r#"]}"#,
        "\n",
    );
    let supplied = SuppliedVerdicts::from_bytes(document.as_bytes())
        .expect("a contract-conforming document admits");

    let resolution = resolve_supplied::<ArchivedOntologyTypeUuid>(&path, &supplied)
        .expect("a store-identity column resolves");

    assert_eq!(resolution.unresolved, 2);
    assert_eq!(resolution.resolved.len(), 1);
    assert_eq!(resolution.resolved[0].relation, OntologyRowId::new(1));
    assert_eq!(resolution.resolved[0].placement, PlacementClass::Proximal);
}

#[test]
fn non_identity_corpus_resolves_no_verdict() {
    // A memory-corpus column keys rows by position, not store
    // identity: its id type offers no identity a verdict could name,
    // so every verdict records as unresolved by construction.
    let path = write_ontology_identities(&scratch("resolve-width"), (0..4_u64).map(U64::<LE>::new));

    let document = concat!(
        r#"{"pair_verdicts":[],"schema":"atlas-reviewed-verdicts/1","sources":{},"#,
        r#""type_verdicts":[{"class":"proximal","relation":"hash:https://hash.ai/@h/types/entity-type/delivers/","#,
        r#""reviewer":"Bilal Mahmoud","versioned_url":"https://hash.ai/@h/types/entity-type/delivers/v/3"}]}"#,
        "\n",
    );
    let supplied = SuppliedVerdicts::from_bytes(document.as_bytes())
        .expect("a contract-conforming document admits");

    let resolution = resolve_supplied::<U64<LE>>(&path, &supplied)
        .expect("a positional corpus resolves nothing without failing the stage");

    assert!(resolution.resolved.is_empty());
    assert_eq!(resolution.unresolved, 1);
}
