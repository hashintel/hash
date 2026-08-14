use core::{future::ready, num::NonZero};
use std::{collections::HashMap, fs};

use camino::{Utf8Path, Utf8PathBuf};
use hashql_core::id::{Id as _, IdSlice, IdVec};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use type_system::ontology::id::VersionedUrl;
use zerocopy::{LE, TryFromBytes as _, U64};

use super::{
    ClassifierInput, FitConfig, FitError, PlacementOptions, PolicyOptions, ProjectorOptions,
    StageError, SuppliedAnnotations, SuppliedVerdicts, Supplies,
    compute::resolve_supplied,
    error::PlacementError,
    fit,
    prepare::identity::{IdentityTable, IdentityTableArchive},
};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node, Ontology, PROJECTOR_DIMENSIONS,
        auxiliary::{OwnedIcon, OwnedLegend},
        card::Card,
        memory::{MemoryDataset, MemoryEdgeId, MemoryNodeId, MemoryOntologyId},
        postgres::id::ArchivedOntologyTypeUuid,
    },
    file::{
        array::ArrayFile,
        attraction::read::AttractionFile,
        classifier::read::ClassifierFile,
        generation::GenerationRoot,
        identity::{Key, read::IdentityFile},
        landmark::read::LandmarkFile,
        morton::read::MortonFile,
        policy::read::PolicyFile,
        postings::read::PostingsFile,
        quad::read::QuadFile,
        salt::{
            SaltRepository,
            metadata::{ClassifierEvidence, FrozenRadiusEvidence, Placement, RankingOrigin},
        },
        sprs::read::SprsFile,
    },
    identity::{BasePosition, CardRow, EdgeRowId, NodeRowId, OntologyRowId},
    integrity::{Sha256, Update as _},
    math::{
        AffinityCurve, AlignedVecN, BoxedVecN, Positive, Similarity, UnitFraction, Vec2, VecN,
        d_non_negative, d_positive, greater_than_one, non_negative, open_unit_fraction, positive,
        unit_fraction,
    },
    progress::NoProgress,
    salt::{
        adjacency::{AdjacencyArchive, EdgeList},
        embedding::{CardEmbedder, EmbedderFingerprint},
        knn::{artifact::KnnArchive, recall::RecallAdmission, table::KnnView},
        ladder::{
            CanonicalError,
            paired::{Draw, MovementOutcome, RuleIdentity},
        },
        landmark::{
            artifact::LandmarkSkeletonArchive,
            select::{LandmarkOrdinal, SelectionOptions},
        },
        policy::{
            GeometryClass, PolicyOverride, PolicySource, Posterior,
            artifact::PolicyTableArchive,
            classifier::{
                Classifier, FitConfig as ClassifierFitConfig, PreparationSettings, SolverConfig,
                TrainingRow, TrainingSet, fit as fit_classifier,
            },
        },
        postings::artifact::PostingsArchive,
        projector::{
            loss::CoincidentEnergy,
            model::Architecture,
            train::{BatchPlan, RelationLens, TrainError, TrainingSchedule},
            verdict::{PlacementClass, ReviewedVerdicts},
        },
        relation::artifact::{AttractionArchive, ProtectionArchive},
        semantic::artifact::SemanticGraphArchive,
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
    dataset_with_edge_confidences([(None, None, None); 2])
}

/// The base corpus with both edges' `(link, source, target)` confidence readings supplied.
///
/// [`dataset`] is the unscored form the other fit tests share. The readings are a parameter so a
/// corpus that violates the confidence contract differs from the clean one in nothing else.
/// Every row carries display text, so the staged identity artifacts persist real payloads.
fn dataset_with_edge_confidences(
    readings: [(
        Option<UnitFraction>,
        Option<UnitFraction>,
        Option<UnitFraction>,
    ); 2],
) -> MemoryDataset {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0xF17);

    let nodes = (0..NODES)
        .map(|row| Node {
            id: U64::<LE>::new(row as u64),
            ontology: smallvec![OntologyRowId::from_usize(row & 1)],
            embedding: representation(&mut rng),
            confidence: None,
        })
        .collect();

    let edges = [(100_u64, 0_u64, 1_u64), (101, 2, 3)]
        .into_iter()
        .zip(readings)
        .map(|((id, source, target), (link, from, to))| Edge {
            id: U64::<LE>::new(id),
            source: NodeRowId::new(source),
            target: NodeRowId::new(target),
            ontology: smallvec![OntologyRowId::new(2)],
            embedding: None,
            confidence: link,
            source_confidence: from,
            target_confidence: to,
        })
        .collect();

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

    let mut dataset = MemoryDataset::new(nodes, edges, ontology, HashMap::new(), cards);
    dataset.node_legends = (0..NODES)
        .map(|row| OwnedLegend::new(OntologyRowId::from_usize(row & 1), &format!("node {row}")))
        .collect();
    dataset.edge_legends = vec![
        OwnedLegend::new(OntologyRowId::new(2), "employs 100"),
        OwnedLegend::new(OntologyRowId::new(2), "employs 101"),
    ];
    dataset.ontology_icons = vec![
        OwnedIcon::from("person"),
        OwnedIcon::from("company"),
        OwnedIcon::from("\u{3bb}"),
    ];
    dataset
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

/// The classifier fit echo round-trips every solver knob.
#[test]
fn classifier_fit_echo_round_trips_every_knob() {
    #[derive(Debug, serde::Serialize, serde::Deserialize)]
    struct Echo(#[serde(with = "super::FitConfigDef")] FitConfig);

    // Every knob differs from its default and from every sibling, so the round-trip equality
    // certifies each field's wire path individually.
    let distinct = ClassifierFitConfig {
        solver: SolverConfig {
            preparation: PreparationSettings {
                regularization: d_positive!(0.625),
                target_sum_tolerance_ulps: NonZero::new(24).expect("twenty-four is nonzero"),
                curvature_relative_floor: d_positive!(1.0e-11),
            },
            radius_minimum: d_positive!(3.0e-8),
            radius_initial: d_positive!(0.5),
            radius_maximum: d_positive!(2.0e4),
            shrink_factor: open_unit_fraction!(0.3),
            expansion_factor: greater_than_one!(2.5),
            eta_accept: open_unit_fraction!(0.05),
            eta_expand: open_unit_fraction!(0.8),
            relative_scaled_gradient_tolerance: open_unit_fraction!(2.0e-6),
            absolute_scaled_gradient_tolerance: d_non_negative!(1.0e-9),
            objective_resolution_ulps: NonZero::new(5).expect("five is nonzero"),
            curvature_guard_ulps: NonZero::new(17).expect("seventeen is nonzero"),
            maximum_outer_iterations: NonZero::new(501).expect("the budget is nonzero"),
        },
        folds: 3,
        seed: 11,
    };

    let mut config = config();
    config.policy.classifier_fit = distinct;

    let document = serde_json::to_value(Echo(config.clone())).expect("the echo serializes");
    let echoed: Echo = serde_json::from_value(document).expect("the echo deserializes");
    assert_eq!(echoed.0, config);
}

/// An echo carrying the retired solver knob names decodes.
///
/// The fixture inserts `relative_cg_residual_tolerance`, `maximum_cg_iterations`,
/// `maximum_consecutive_rejections`, `maximum_hvp_requests`, `maximum_objective_requests`,
/// `maximum_gradient_requests` and `maximum_row_traversals` verbatim into an otherwise-default
/// solver echo, so the decode pins unknown-field tolerance for the current record shape. The
/// decoder ignores an unknown solver field instead of rejecting the record. The first two retired
/// with the inner CG recurrence, the third with the rejection budget radius underflow always
/// preceded, and the last four with the work budgets the iteration structure already bounds.
#[test]
fn config_echo_decodes_the_retired_solver_knobs() {
    #[derive(Debug, serde::Serialize, serde::Deserialize)]
    struct Echo(#[serde(with = "super::FitConfigDef")] FitConfig);

    let mut document = serde_json::to_value(Echo(config())).expect("the echo serializes");
    let solver = document
        .pointer_mut("/policy/classifier_fit/solver")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the echo carries the solver object");
    solver.insert(
        "relative_cg_residual_tolerance".to_owned(),
        serde_json::json!(0.1),
    );
    solver.insert("maximum_cg_iterations".to_owned(), serde_json::json!(100));
    solver.insert(
        "maximum_consecutive_rejections".to_owned(),
        serde_json::json!(30),
    );
    solver.insert("maximum_hvp_requests".to_owned(), serde_json::json!(50_000));
    solver.insert(
        "maximum_objective_requests".to_owned(),
        serde_json::json!(2_000),
    );
    solver.insert(
        "maximum_gradient_requests".to_owned(),
        serde_json::json!(2_000),
    );
    solver.insert(
        "maximum_row_traversals".to_owned(),
        serde_json::json!(500_000),
    );

    let echoed: Echo =
        serde_json::from_value(document).expect("the echo decodes with unknown solver fields");
    assert_eq!(echoed.0, config());
}

/// A config echo names every setting, and a missing setting fails the parse.
#[test]
fn config_echo_requires_every_setting() {
    #[derive(Debug, serde::Serialize, serde::Deserialize)]
    struct Echo(#[serde(with = "super::FitConfigDef")] FitConfig);

    for path in [
        "/selection/parallel_chunk",
        "/policy/assembly/maximum_group_fraction",
        "/policy/assembly",
        "/policy/classifier_fit",
        "/construction",
    ] {
        let mut document = serde_json::to_value(Echo(config())).expect("the echo serializes");
        let (parent, field) = path.rsplit_once('/').expect("every path names a field");
        let object = document
            .pointer_mut(parent)
            .and_then(serde_json::Value::as_object_mut)
            .expect("the echo carries the field's parent object");
        assert!(object.remove(field).is_some(), "{path} rides the echo");

        assert!(
            serde_json::from_value::<Echo>(document).is_err(),
            "an echo without {path} does not parse"
        );
    }
}

/// The budget echoes as its floor object, and the retired clamp's bare array still decodes.
///
/// The bare four-constant array `[positive, total, floor, epsilon]` is the exact shape every
/// generation published under the enforcing clamp carries. The fixture pins the ratified constants
/// verbatim, so this decode is the standing witness that those manifests parse under the current
/// binary. The decode keeps the floor and discards the retired clamp coefficients.
#[test]
fn budget_echo_writes_the_floor_and_decodes_the_retired_clamp_array() {
    #[derive(Debug, serde::Serialize, serde::Deserialize)]
    struct Echo(#[serde(with = "super::FitConfigDef")] FitConfig);

    let config = FitConfig {
        placement: PlacementOptions::Projector(projector_options()),
        ..config()
    };
    let document = serde_json::to_value(Echo(config.clone())).expect("the echo serializes");
    assert_eq!(
        document
            .pointer("/placement/projector/budget")
            .expect("the echo carries the budget"),
        &serde_json::json!({ "floor": 2.0e-4_f32 }),
        "the budget echoes as the bare floor object",
    );
    let echoed: Echo = serde_json::from_value(document.clone()).expect("the echo deserializes");
    assert_eq!(echoed.0, config);

    let mut document = document;
    *document
        .pointer_mut("/placement/projector/budget")
        .expect("the echo carries the budget") =
        serde_json::json!([0.1_f32, 0.1_f32, 2.0e-4_f32, 1.0e-12_f32]);
    let echoed: Echo = serde_json::from_value(document).expect("the retired clamp form decodes");
    assert_eq!(echoed.0, config);
}

/// A config echo revalidates the group budget's domain.
#[test]
fn config_echo_validates_the_group_budget() {
    #[derive(Debug, serde::Serialize, serde::Deserialize)]
    struct Echo(#[serde(with = "super::FitConfigDef")] FitConfig);

    let mut document = serde_json::to_value(Echo(config())).expect("the echo serializes");
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
    fit_classifier(training, ClassifierFitConfig { folds: 2, .. }, &NoProgress)
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
async fn fit_publishes_a_complete_generation() {
    let path = scratch("complete");
    let root = GenerationRoot::new(&path).expect("the root should open");
    let dataset = dataset();
    let classifier = fixture_input();

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        Supplies {
            classifier: &classifier,
            ..
        },
        &root,
        &NoProgress,
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

    // The call supplied no verdicts, so the manifest records the absence.
    assert!(repository.files.reviewed_verdicts.is_none());
    // The call supplied the classifier, so the manifest records the source digest and stages no
    // annotation artifacts.
    assert!(repository.files.annotation_corpus.is_none());
    assert!(repository.files.annotation_embeddings.is_none());
    assert!(repository.files.annotation_hashes.is_none());
    let mut hasher = Sha256::new();
    hasher.update(b"fixture classifier artifact");
    assert_eq!(
        repository.metadata.evidence.classifier,
        ClassifierEvidence::Supplied {
            source: hasher.finalize(),
        },
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
    assert_eq!(
        repository.metadata.evidence.recall.admission(),
        RecallAdmission::Admitted,
    );
    assert_eq!(repository.metadata.evidence.landmarks.selected, LANDMARKS);

    // Without a prior generation every unique card text embeds fresh.
    assert_eq!(repository.metadata.evidence.cards.reused, 0);
    assert_eq!(repository.metadata.evidence.cards.embedded, 3);

    // The policy stage resolved the edge stream's relation universe to the fixture's single link
    // type and applied zero overrides.
    assert_eq!(repository.metadata.evidence.policy.relations, 1);
    assert_eq!(repository.metadata.evidence.policy.overridden, 0);

    assert_rows_sit_on_landmarks(published.path());
    assert_identities_translate(published.path());

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

/// Asserts every row's baseline coordinate is bit-equal to its assigned landmark's layout
/// coordinate in the published skeleton.
fn assert_rows_sit_on_landmarks(published: &Utf8Path) {
    let coordinates =
        ArrayFile::open(published.join("coordinates.arr")).expect("the coordinates should map");
    let placed = coordinates.points().expect("the coordinates are 2D points");
    assert_eq!(placed.len(), NODES);

    let skeleton = LandmarkSkeletonArchive::new(
        LandmarkFile::open(published.join("landmarks.lndm")).expect("the skeleton should map"),
    )
    .expect("the skeleton should validate");
    assert!(
        placed
            .iter()
            .zip(skeleton.assignment())
            .all(|(point, ordinal)| {
                let landmark = skeleton.coordinates()[*ordinal];
                point.x().to_bits() == landmark.x().to_bits()
                    && point.y().to_bits() == landmark.y().to_bits()
            }),
        "every row should sit exactly on its assigned landmark",
    );
}

/// Asserts the identity artifacts translate rows to source ids and back.
///
/// Node ids are the fixture's row numbers and edge ids its 100 and 101. Every row's display
/// payload reads back as the fixture's text.
fn assert_identities_translate(published: &Utf8Path) {
    let nodes = IdentityTableArchive::<MemoryNodeId, NodeRowId>::new(
        IdentityFile::open(published.join("node-identities.idnt"))
            .expect("the node identities should map"),
    )
    .expect("the node identities should validate");
    assert_eq!(nodes.len(), NODES as u64);
    for row in 0..NODES as u64 {
        assert_eq!(
            nodes.id(NodeRowId::new(row)),
            Some(MemoryNodeId::new(row)),
            "row {row}"
        );
        assert_eq!(
            nodes.row_of(MemoryNodeId::new(row)),
            Some(NodeRowId::new(row)),
            "id {row}"
        );
        let legend = OwnedLegend::new(OntologyRowId::new(row & 1), &format!("node {row}"));
        assert_eq!(
            nodes.payload_of(NodeRowId::new(row)),
            Some(&*legend),
            "payload of row {row}"
        );
    }
    assert!(nodes.row_of(MemoryNodeId::new(NODES as u64 + 7)).is_none());

    let edge_ids = IdentityTableArchive::<MemoryEdgeId, EdgeRowId>::new(
        IdentityFile::open(published.join("edge-identities.idnt"))
            .expect("the edge identities should map"),
    )
    .expect("the edge identities should validate");
    assert_eq!(edge_ids.len(), 2);
    assert_eq!(edge_ids.id(EdgeRowId::new(0)), Some(MemoryEdgeId::new(100)));
    assert_eq!(
        edge_ids.row_of(MemoryEdgeId::new(101)),
        Some(EdgeRowId::new(1))
    );
    let employs_100 = OwnedLegend::new(OntologyRowId::new(2), "employs 100");
    assert_eq!(edge_ids.payload_of(EdgeRowId::new(0)), Some(&*employs_100));
    let employs_101 = OwnedLegend::new(OntologyRowId::new(2), "employs 101");
    assert_eq!(edge_ids.payload_of(EdgeRowId::new(1)), Some(&*employs_101));

    let ontology_ids = IdentityTableArchive::<MemoryOntologyId, OntologyRowId>::new(
        IdentityFile::open(published.join("ontology-identities.idnt"))
            .expect("the ontology identities should map"),
    )
    .expect("the ontology identities should validate");
    assert_eq!(ontology_ids.len(), 3);
    for (row, icon) in ["person", "company", "\u{3bb}"].into_iter().enumerate() {
        let expected = OwnedIcon::from(icon);
        assert_eq!(
            ontology_ids.payload_of(OntologyRowId::new(row as u64)),
            Some(&*expected),
            "ontology row {row}"
        );
    }
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
    for (position, row) in gather
        .u64_le_elements()
        .expect("the gather column holds little-endian u64 rows")
        .iter()
        .enumerate()
    {
        let row = row.get();
        let membership = postings
            .membership(OntologyRowId::new(row & 1))
            .expect("the fixture types lie in the type domain");
        assert!(
            membership.contains(BasePosition::from_usize(position)),
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
    assert_eq!(
        postings.parents(OntologyRowId::new(2)),
        Some(&[OntologyRowId::new(0)][..]),
    );

    let evidence = &repository.metadata.evidence.postings;
    assert_eq!(evidence.types, 3);
    assert_eq!(evidence.dense_types, 2);
    assert_eq!(evidence.list_entries, 0, "both node types went dense");
    assert_eq!(evidence.parent_edges, 1);
    assert_eq!(
        evidence.direct_entries, NODES as u64,
        "each row carries one direct type"
    );
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
        Supplies {
            classifier: &supplied(classifier.clone()),
            ..
        },
        &root,
        &NoProgress,
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
    assert_eq!(policy.applicability, prediction.applicability);
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
        Supplies {
            classifier: &fixture_input(),
            ..
        },
        &root,
        &NoProgress,
    )
    .await
    .expect("the fit should publish");

    let column = |name: &str| -> Vec<u32> {
        let file = ArrayFile::open(published.path().join(name)).expect("the column should map");
        file.u32_le_elements()
            .expect("the column holds little-endian u32 elements")
            .iter()
            .map(|element| element.get())
            .collect()
    };
    let position_of_row = column("position-of-row.arr");
    let row_of_position: Vec<u64> = {
        let file = ArrayFile::open(published.path().join("row-of-position.arr"))
            .expect("the gather column should map");
        file.u64_le_elements()
            .expect("the gather column holds little-endian u64 rows")
            .iter()
            .map(|row| row.get())
            .collect()
    };
    let rank_of_position = column("rank-of-position.arr");
    let position_of_rank = column("position-of-rank.arr");

    // The permutations are mutually inverse and total over the rows.
    assert_eq!(position_of_row.len(), NODES);
    assert_eq!(row_of_position.len(), NODES);
    for row in 0..NODES {
        assert_eq!(row_of_position[position_of_row[row] as usize], row as u64);
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
        Supplies {
            classifier: &classifier,
            verdicts: Some(&supplied),
            ..
        },
        &root,
        &NoProgress,
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
/// The remaining two cards are a geometry-verdict holdout and an unclear-verdict holdout, and every
/// card ascends by identity.
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
        Supplies {
            classifier: &ClassifierInput::Annotations(supplied.clone()),
            ..
        },
        &root,
        &NoProgress,
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
    let ClassifierEvidence::Fitted {
        corpus,
        assembly,
        fit: summary,
        holdout,
    } = repository.metadata.evidence.classifier
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
            .cmp(&prediction.calibrated.probability(*right))
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
        Supplies {
            classifier: &classifier,
            ..
        },
        &root,
        &NoProgress,
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
        Supplies {
            classifier: &classifier,
            prior: Some(&prior),
            ..
        },
        &root,
        &NoProgress,
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
        Supplies {
            classifier: &fixture_input(),
            ..
        },
        &root,
        &NoProgress,
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
    assert_eq!(policy.selected.coincident.to_bits(), 0.25_f64.to_bits());
    assert_eq!(policy.selected.proximal.to_bits(), 0.5_f64.to_bits());
    assert_eq!(policy.attraction.coincident.to_bits(), 0.25_f64.to_bits());
    assert_eq!(policy.attraction.proximal.to_bits(), 0.5_f64.to_bits());
    assert_eq!(policy.applicability.to_bits(), 1.0_f64.to_bits());

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
        Supplies {
            classifier: &classifier,
            ..
        },
        &first_root,
        &NoProgress,
    )
    .await
    .expect("the first fit should publish");
    let second = fit(
        &dataset,
        &HashEmbedder,
        &config(),
        Supplies {
            classifier: &classifier,
            ..
        },
        &second_root,
        &NoProgress,
    )
    .await
    .expect("the second fit should publish");

    // The generation id digests the metadata document, which in turn digests every artifact, so
    // equal ids certify byte-equal generations. The converse follows from the wired stage set,
    // whose every member is deterministic by construction. The pipeline promises no such contract
    // of its own. Determinism is best effort, and a stage under the training carve-out rescopes
    // this assertion to the deterministic artifacts.
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
        Supplies {
            classifier: &fixture_input(),
            ..
        },
        &root,
        &NoProgress,
    )
    .await;
    assert!(
        matches!(
            result,
            Err(FitError::Stage(StageError::RepresentationDefects(ref check))) if !check.passes(),
        ),
        "the defective corpus should fail the norm check",
    );

    // Failure leaves the root empty: the fit clears its transients and publishes no generation.
    let entries: Vec<_> = fs::read_dir(&path)
        .expect("the root should list")
        .map(|entry| entry.expect("the entry should read").file_name())
        .collect();
    assert!(
        entries.is_empty(),
        "a failed fit should leave nothing visible: {entries:?}"
    );
}

/// A one-step schedule with the boundary at step zero.
///
/// For orchestration certificates whose asserted behaviour does not depend on trained movement: a
/// vacuous or forceless run still reaches the boundary at the minimum cost a valid schedule allows.
fn minimal_schedule() -> TrainingSchedule {
    TrainingSchedule::new(
        NonZero::new(1).expect("the fixture step count is nonzero"),
        0,
        NonZero::new(1).expect("the fixture cadence is nonzero"),
        UnitFraction::new(1.0e-3).expect("the fixture initial rate is a unit fraction"),
        UnitFraction::new(1.0e-5).expect("the fixture minimum rate is a unit fraction"),
    )
    .expect("the fixture schedule is valid")
}

/// The projector fixture's training run.
///
/// Short enough for a test, long enough that the boundary and every rung run. The hidden
/// architecture shrinks while the representation width keeps the pipeline's contract, so a
/// forward or training step costs a fraction of the ratified model's; the publish seam's own
/// certificates (`compute::projector::tests`) pin the bit-exact publish contracts, and these
/// fixtures certify the fit's composition.
fn projector_options() -> ProjectorOptions {
    let mut options = ProjectorOptions::ratified();
    options.architecture = Architecture {
        width: NonZero::new(8).expect("the fixture width is nonzero"),
        residual_blocks: NonZero::new(1).expect("the fixture depth is nonzero"),
        representation_dimensions: NonZero::new(PROJECTOR_DIMENSIONS)
            .expect("the projector width is nonzero"),
        role_dimensions: NonZero::new(4).expect("the fixture role width is nonzero"),
        condition_dimensions: NonZero::new(1).expect("the fixture condition width is nonzero"),
    };
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
        CoincidentEnergy::new(non_negative!(0.5), positive!(0.5)),
        Positive::new(0.25).expect("the fixture temperature is positive"),
        Positive::new(1.0e-8).expect("the fixture scale guard is positive"),
    );
    options.forward_rows = NonZero::new(16).expect("the fixture slice is nonzero");
    options
}

/// A reviewed-Proximal verdict covering the fixture link row.
///
/// The versioned URL names ontology id 2 in the memory corpus's own id space (`memory://2/`), so
/// the resolution reaches the link row carrying the Proximal force and the boundary measures its
/// radius from reviewed pairs.
fn proximal_link_verdicts() -> SuppliedVerdicts {
    let document = concat!(
        r#"{"pair_verdicts":[],"schema":"atlas-reviewed-verdicts/1","sources":{},"#,
        r#""type_verdicts":[{"class":"proximal","relation":"memory:employment-link","#,
        r#""reviewer":"Bilal Mahmoud","versioned_url":"memory://2/v/1"}]}"#,
        "\n",
    );
    SuppliedVerdicts::from_bytes(document.as_bytes()).expect("the fixture document admits")
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

    // An Overlay override strips the fixture's link type of force. The boundary then freezes
    // nothing, the lens provably never trains, and the run skips the ladder whole.
    // The zero force makes the run vacuous by construction (`admit` sees no force at all), so the
    // schedule trains nothing and one step certifies the same orchestration a longer run would.
    let mut options = projector_options();
    options.schedule = minimal_schedule();
    let config = FitConfig {
        placement: PlacementOptions::Projector(options),
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
        Supplies {
            classifier: &fixture_input(),
            ..
        },
        &root,
        &NoProgress,
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
    assert_eq!(evidence.steps, 1);
    assert_eq!(
        evidence.boundary,
        Some(FrozenRadiusEvidence::Vacuous),
        "a forceless index freezes nothing"
    );
    assert!(
        evidence.ladder.is_none(),
        "a forceless run measures no ladder"
    );

    // The publish seam's certificates (`compute::projector::tests`) pin
    // the column's bit-exact relationship to the checkpoint; here the
    // column covers the corpus rows.
    let coordinates =
        ArrayFile::open(published.path().join("coordinates.arr")).expect("the column maps");
    assert_eq!(
        coordinates
            .points()
            .expect("the column holds 2D points")
            .len(),
        NODES,
    );
}

/// Certifies the paired-movement readout of one published trained document.
///
/// The recorded salt re-derives from the document's own input sections, the draw counts replay
/// over the published attraction index, and the measured body's strata census the whole
/// candidate pool. The trained fixture holds 48 rows and the two full-force edges (0, 1) and
/// (2, 3), so the pair domain censuses 2 oriented pairs and both draw, while the 44 rows
/// outside the edges form the control pool and `m = n = 2` controls draw from it.
fn assert_paired_replay(published: &Utf8Path, repository: &SaltRepository) {
    let paired = repository
        .metadata
        .evidence
        .projector
        .as_ref()
        .expect("a trained placement records projector evidence")
        .ladder
        .as_ref()
        .expect("a trained lens measures the ladder")
        .paired_movement
        .as_ref()
        .expect("a ladder written with the readout carries a present body");
    assert_eq!(paired.rule, RuleIdentity::INITIAL);
    let rule = RuleIdentity::INITIAL
        .recognize()
        .expect("the initial identity recognizes");
    let salt = rule
        .derive_salt(
            &repository.metadata.snapshot,
            &repository.metadata.reproducibility,
        )
        .expect("the published sections serialize");
    assert_eq!(
        paired.salt, salt,
        "the recorded salt derives from the document's input sections alone"
    );
    assert_eq!(paired.rank_window, 256);

    let index =
        AttractionFile::open(published.join("attraction.atrc")).expect("the published index maps");
    let draw = Draw::over(rule, salt, index.rows(), index.groups(), index.edges())
        .expect("the published index censuses");
    assert_eq!(paired.pair_candidates, 2);
    assert_eq!(paired.pairs_selected, 2);
    assert_eq!(paired.control_candidates, 44);
    assert_eq!(paired.controls_selected, 2);
    assert_eq!(paired.pair_candidates, draw.pair_candidates());
    assert_eq!(paired.pairs_selected, draw.pairs().len() as u64);
    assert_eq!(paired.control_candidates, draw.control_candidates());
    assert_eq!(paired.controls_selected, draw.controls().len() as u64);

    let MovementOutcome::Measured { pairs, deciles } = &paired.outcome else {
        panic!(
            "a force-bearing corpus measures, where the outcome was {:?}",
            paired.outcome
        );
    };
    assert_eq!(pairs.count, 2);
    assert_eq!(
        deciles.len(),
        10,
        "a nonempty candidate pool builds every stratum"
    );
    assert_eq!(
        deciles
            .iter()
            .map(|stratum| stratum.candidates)
            .sum::<u64>(),
        44,
        "the strata census the whole candidate pool"
    );
    assert_eq!(
        deciles.iter().map(|stratum| stratum.selected).sum::<u64>(),
        2,
        "every drawn control lands in a stratum"
    );
    for stratum in deciles {
        assert_eq!(stratum.displacement.is_some(), stratum.selected > 0);
    }
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn trained_lens_publishes_the_canonical_rung_aligned() {
    let root = GenerationRoot::new(scratch("projector-ladder")).expect("the root should open");
    let dataset = dataset();

    // A Proximal override gives the link type full force, and the reviewed verdict names the
    // link row in the corpus's own id space, so the boundary measures its radius from the
    // reviewed pairs.
    let options = projector_options();
    let verdicts = proximal_link_verdicts();
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
        Supplies {
            classifier: &fixture_input(),
            verdicts: Some(&verdicts),
            ..
        },
        &root,
        &NoProgress,
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
    assert!(
        matches!(
            evidence.boundary,
            Some(FrozenRadiusEvidence::Measured { .. })
        ),
        "the boundary freezes the radius measured from the reviewed pairs"
    );

    let ladder = evidence
        .ladder
        .as_ref()
        .expect("a trained lens measures the ladder");
    assert_eq!(ladder.rungs.len(), options.ladder.conditions.len());
    assert_eq!(ladder.canonical.get().to_bits(), 1.0_f32.to_bits());
    assert_eq!(ladder.canonical_index, ladder.rungs.len() - 1);

    // The baseline rung is its own frame; every recorded loss is a
    // real measurement.
    assert_eq!(ladder.rungs[0].alignment, Similarity::IDENTITY);
    assert_eq!(
        ladder.rungs[0].baseline_movement.get().to_bits(),
        0.0_f64.to_bits()
    );
    // The run trained the lens, and the canonical rung moved measurably against its predecessor.
    let canonical = &ladder.rungs[ladder.canonical_index];
    assert!(canonical.adjacent_movement > d_non_negative!(0.0));

    // The paired-movement readout lands beside the rungs, and its salt and draw replay from
    // the published document alone.
    assert_paired_replay(published.path(), &repository);

    // The publish seam's certificates (`compute::projector::tests`) pin the column's bit-exact
    // relationship to the checkpoint and the recorded alignment; here the column covers the
    // corpus rows.
    let coordinates =
        ArrayFile::open(published.path().join("coordinates.arr")).expect("the column maps");
    assert_eq!(
        coordinates
            .points()
            .expect("the column holds 2D points")
            .len(),
        NODES,
    );
}

/// A corpus whose representation stream carries byte-identical copies.
///
/// Rows 1 and 40..=43 carry row 0's representation, rows 44..=46 carry row 2's, and row 47 carries
/// row 3's. That gives 39 distinct representations over 48 rows, with copies both beside their
/// first row and at the far end of the stream.
///
/// Edge 100 relates two distinct representations. Edge 101 relates two rows of one representation,
/// and edge 102 restates edge 100's representation pair through a copy. The collapsed trainer view
/// keeps one reading of the pair and drops the self-reading, while the published index keeps all
/// three edges.
fn duplicate_dataset() -> MemoryDataset {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0xD0B1);

    let mut embeddings: Vec<BoxedVecN<PROJECTOR_DIMENSIONS>> = Vec::with_capacity(NODES);
    for row in 0..NODES {
        let embedding = match row {
            1 | 40..=43 => embeddings[0].clone(),
            44..=46 => embeddings[2].clone(),
            47 => embeddings[3].clone(),
            _ => representation(&mut rng),
        };
        embeddings.push(embedding);
    }

    let nodes = embeddings
        .into_iter()
        .enumerate()
        .map(|(row, embedding)| Node {
            id: U64::<LE>::new(row as u64),
            ontology: smallvec![OntologyRowId::from_usize(row & 1)],
            embedding,
            confidence: None,
        })
        .collect();

    let edge = |id: u64, source: u64, target: u64| Edge {
        id: U64::<LE>::new(id),
        source: NodeRowId::new(source),
        target: NodeRowId::new(target),
        ontology: smallvec![OntologyRowId::new(2)],
        embedding: None,
        confidence: None,
        source_confidence: None,
        target_confidence: None,
    };
    let edges = vec![
        edge(100, 0, 4),
        edge(101, 0, 1),
        Edge {
            confidence: Some(unit_fraction!(0.75)),
            ..edge(102, 1, 4)
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

/// Asserts the rows of one duplicate cluster publish as one point of the quotient.
///
/// The cluster's first entry is its representation's first occurrence. Every other member shares
/// that entry's neighbour list, landmark ordinal, and published coordinate bit for bit.
fn assert_cluster_shares_one_point(
    table: &KnnView<'_, NodeRowId>,
    assignment: &IdSlice<NodeRowId, LandmarkOrdinal>,
    placed: &IdSlice<NodeRowId, Vec2>,
    cluster: &[usize],
) {
    let first = cluster[0];
    let reference: Vec<(NodeRowId, u32)> = table
        .row(NodeRowId::from_usize(first))
        .map(|neighbour| (neighbour.id, neighbour.distance.to_bits()))
        .collect();
    for &row in &cluster[1..] {
        let list: Vec<(NodeRowId, u32)> = table
            .row(NodeRowId::from_usize(row))
            .map(|neighbour| (neighbour.id, neighbour.distance.to_bits()))
            .collect();
        assert_eq!(
            list, reference,
            "rows {first} and {row} should share one neighbour list",
        );
        assert_eq!(
            assignment[NodeRowId::from_usize(row)],
            assignment[NodeRowId::from_usize(first)],
            "rows {first} and {row} should share one landmark ordinal",
        );
        assert_eq!(
            placed[NodeRowId::from_usize(row)].x().to_bits(),
            placed[NodeRowId::from_usize(first)].x().to_bits(),
            "rows {first} and {row} should share one x coordinate",
        );
        assert_eq!(
            placed[NodeRowId::from_usize(row)].y().to_bits(),
            placed[NodeRowId::from_usize(first)].y().to_bits(),
            "rows {first} and {row} should share one y coordinate",
        );
    }
}

/// Byte-identical rows share one training seat and publish over the full row domain.
///
/// The placement trains over the corpus's 39 distinct representations, and publication expands back
/// over all 48 rows.
///
/// Every published artifact covers the row domain, and every published neighbour and selected
/// landmark is a representation's first row. The rows of one duplicate cluster share one neighbour
/// list, one landmark ordinal, and one published coordinate bit for bit, so the distinct-domain
/// training evidence and the full-domain column describe one field.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn duplicate_rows_train_distinct_and_publish_the_row_domain() {
    let root = GenerationRoot::new(scratch("duplicates")).expect("the root should open");
    let dataset = duplicate_dataset();

    // The Proximal override gives the link type full force and the
    // reviewed verdict freezes a measured boundary radius: the whole
    // trained path runs over the quotient's distinct domain. The
    // byte-identical reviewed pairs measure a small Proximal quantile,
    // so this corpus wants a Coincident radius below that measurement,
    // the same ordering the composed energy demands of production.
    let verdicts = proximal_link_verdicts();
    let mut options = projector_options();
    options.lens = RelationLens::new(
        CoincidentEnergy::new(non_negative!(0.01), positive!(0.5)),
        Positive::new(0.25).expect("the fixture temperature is positive"),
        Positive::new(1.0e-8).expect("the fixture scale guard is positive"),
    );
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

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config,
        Supplies {
            classifier: &fixture_input(),
            verdicts: Some(&verdicts),
            ..
        },
        &root,
        &NoProgress,
    )
    .await
    .expect("a corpus with byte-identical rows should publish");

    // The fixture's clusters; a row outside every copy list is its own
    // representation's first row.
    let clusters: [&[usize]; 3] = [&[0, 1, 40, 41, 42, 43], &[2, 44, 45, 46], &[3, 47]];
    let is_first_row = |row: usize| !clusters.iter().any(|cluster| cluster[1..].contains(&row));

    // Every published artifact covers the full row domain.
    let knn = KnnArchive::new(
        SprsFile::open(published.path().join("knn.sprs")).expect("the table should map"),
    )
    .expect("the table should validate");
    let table = knn.view();
    assert_eq!(table.rows(), NODES);

    let semantic = SemanticGraphArchive::<NodeRowId>::new(
        SprsFile::open(published.path().join("semantic.sprs")).expect("the graph should map"),
    )
    .expect("the graph should validate");
    assert_eq!(semantic.view().rows(), NODES);

    let coordinates = ArrayFile::open(published.path().join("coordinates.arr"))
        .expect("the coordinates should map");
    let placed = coordinates.points().expect("the coordinates are 2D points");
    assert_eq!(placed.len(), NODES);

    let skeleton = LandmarkSkeletonArchive::new(
        LandmarkFile::open(published.path().join("landmarks.lndm"))
            .expect("the skeleton should map"),
    )
    .expect("the skeleton should validate");
    assert_eq!(skeleton.rows(), NODES as u64);
    assert_eq!(skeleton.landmarks(), u64::from(LANDMARKS));
    let assignment = skeleton.assignment();
    assert_eq!(assignment.len(), NODES);

    // Publication names rows by their representation's first
    // occurrence: every neighbour and every selected landmark is a
    // first row.
    for row in 0..NODES {
        for neighbour in table.row(NodeRowId::from_usize(row)) {
            let neighbour_row = neighbour.id.as_usize();
            assert!(
                is_first_row(neighbour_row),
                "row {row}'s neighbour {neighbour_row} should be a first row",
            );
        }
    }
    assert!(
        skeleton
            .selected_rows()
            .iter()
            .all(|&row| is_first_row(row.as_usize())),
        "every selected landmark should be a first row",
    );

    // The rows of one cluster are one point of the quotient: one
    // neighbour list, one landmark ordinal, one published coordinate.
    for cluster in clusters {
        assert_cluster_shares_one_point(&table, assignment, IdSlice::from_raw(placed), cluster);
    }
}

/// The vacuous placement unblocks a Proximal corpus lacking reviewed coverage.
///
/// A corpus whose relations carry Proximal force refuses to train without reviewed coverage - and
/// the vacuous placement is exactly what unblocks it: the same configuration trains and publishes
/// with the relation evidence withheld.
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
        placement: PlacementOptions::Projector(projector_options()),
        policy: policy.clone(),
        ..config()
    };
    let result = fit(
        &dataset,
        &HashEmbedder,
        &refused_config,
        Supplies {
            classifier: &fixture_input(),
            ..
        },
        &refused,
        &NoProgress,
    )
    .await;
    assert!(
        matches!(
            result,
            Err(FitError::Stage(StageError::Placement(
                PlacementError::Train(TrainError::MissingProximalReviews)
            ))),
        ),
        "proximal force without reviews should refuse",
    );

    let root = GenerationRoot::new(scratch("vacuous-trains")).expect("the root should open");
    let mut options = projector_options();
    options.vacuous = true;
    // The vacuous flag empties the attraction index before admission, so
    // the run is vacuous by construction regardless of the schedule: one
    // step certifies the same orchestration a longer run would.
    options.schedule = minimal_schedule();
    let vacuous_config = FitConfig {
        placement: PlacementOptions::Projector(options),
        policy,
        ..config()
    };
    let published = fit(
        &dataset,
        &HashEmbedder,
        &vacuous_config,
        Supplies {
            classifier: &fixture_input(),
            ..
        },
        &root,
        &NoProgress,
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
        AttractionFile::<NodeRowId, EdgeRowId>::open(published.path().join("attraction.atrc"))
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

    // 0.3 names no rung of the schedule, so the configuration
    // contradicts itself and the fit must refuse to publish. The
    // membership is decidable from the options alone, so the refusal
    // lands before a single training step: the run's cost is the
    // stages ahead of the placement. The reviewed verdict keeps the
    // canonical mismatch as the configuration's only defect.
    let mut options = projector_options();
    options.ladder.canonical = non_negative!(0.3);
    let verdicts = proximal_link_verdicts();
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
        Supplies {
            classifier: &fixture_input(),
            verdicts: Some(&verdicts),
            ..
        },
        &root,
        &NoProgress,
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
/// This corpus has two relation types, a parallel pair, a self-loop, and both scored and unscored
/// confidences.
///
/// Rows 0 and 3 both relate `0 → 1` under relation 2, with row 0 scored. Row 1 relates `2 → 3`
/// under relations 2 and 3, and row 2 is the self-loop `3 → 3` under relation 3.
fn relation_dataset() -> MemoryDataset {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0xED6E);

    let nodes = (0..NODES)
        .map(|row| Node {
            id: U64::<LE>::new(row as u64),
            ontology: smallvec![OntologyRowId::from_usize(row & 1)],
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
            confidence: Some(unit_fraction!(0.5)),
            ..unscored(200, 0, 1, smallvec![OntologyRowId::new(2)])
        },
        unscored(
            201,
            2,
            3,
            smallvec![OntologyRowId::new(2), OntologyRowId::new(3)],
        ),
        Edge {
            confidence: Some(unit_fraction!(0.75)),
            source_confidence: Some(unit_fraction!(0.5)),
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
        .map(EdgeRowId::as_u64)
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
/// Relation 2 retains three instances and relation 3 retains one, since the self-loop reading
/// carries no force and the drain discards it. The overridden weights and confidence provenance
/// stay intact.
fn assert_attraction_reads_back(attraction: &AttractionArchive<NodeRowId, EdgeRowId>) {
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
        .find(|edge| edge.edge.as_u64() == 0)
        .expect("edge row 0 is retained under relation 2");
    assert_eq!(scored.confidence.value(), unit_fraction!(0.5));
    assert!(scored.confidence.scored().link());
    assert!(!scored.confidence.scored().source());
    assert!(!scored.confidence.scored().target());

    let neutral = membership.edge(0);
    assert_eq!(neutral.edge.as_u64(), 1);
    assert_eq!(neutral.confidence.value(), unit_fraction!(1.0));
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
        Supplies {
            classifier: &classifier,
            ..
        },
        &root,
        &NoProgress,
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
        .u32_le_elements()
        .expect("the rank column holds little-endian u32 positions")[0]
        .get();
    assert_eq!(
        row_of_position
            .u64_le_elements()
            .expect("the gather column holds little-endian u64 rows")[first_position as usize]
            .get(),
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
    let _protection = ProtectionArchive::<NodeRowId>::new(
        SprsFile::open(published.path().join("protection.sprs"))
            .expect("the protection index should map"),
    )
    .expect("the protection index should validate");
    let _quad =
        QuadFile::open(published.path().join("quadtree.quad")).expect("the quadtree should map");

    // The ontology identities translate type rows to source ids and
    // back: the fixture's type ids are its row numbers.
    let ontology_ids = IdentityTableArchive::<MemoryOntologyId, OntologyRowId>::new(
        IdentityFile::open(published.path().join("ontology-identities.idnt"))
            .expect("the ontology identities should map"),
    )
    .expect("the ontology identities should validate");
    assert_eq!(ontology_ids.len(), 4);
    assert_eq!(
        ontology_ids.id(OntologyRowId::new(2)),
        Some(MemoryOntologyId::new(2))
    );
    assert_eq!(
        ontology_ids.row_of(MemoryOntologyId::new(3)),
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

    // Each retained instance weighs c · s+ · s with s+ = 0.5 and the reading share s =
    // 1/multiplicity. By hand, the scored single-typed edge gives 0.5 · 0.5, the two-typed edge's
    // readings give two 1.0 · 0.5 · 0.5, and the unscored single-typed edge gives 1.0 · 0.5, which
    // totals 1.25. Every factor is a power of two, so the sum is exact.
    let relations = &repository.metadata.evidence.relations;
    assert_eq!(relations.retained_edges, 4);
    assert_eq!(relations.pruned_edges, 0);
    assert_eq!(relations.self_references, 1);
    assert_eq!(relations.retained_mass, d_non_negative!(1.25));
    assert_eq!(relations.pruned_mass, d_non_negative!(0.0));
    // Of the four edges, three carry one relation reading each (the self-loop counts at the drain)
    // and one carries two.
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
    I: Key,
{
    fs::create_dir_all(dir).expect("the scratch directory is writable");
    let path = dir.join("ontology-identities.idnt");
    let mut table = IdentityTable::<OntologyRowId, I>::new();
    for id in ids {
        table.push(id);
    }
    let rows = usize::try_from(table.len()).expect("rows fit the address space");
    let file = fs::File::create(path.as_std_path()).expect("the scratch file is writable");
    let empty = <I::Payload>::try_ref_from_bytes(&[])
        .expect("every payload type admits the empty byte string");
    table
        .write_into(
            core::iter::repeat_n(empty, rows),
            std::io::BufWriter::new(file),
        )
        .expect("the fixture table writes");
    path
}

/// Derives the store identity of one versioned type URL.
fn store_identity(url: &str) -> ArchivedOntologyTypeUuid {
    let url: VersionedUrl = url.parse().expect("the fixture url parses");
    ArchivedOntologyTypeUuid::from_url(&url)
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

    // The fixture supplies one verdict from a foreign store, one reviewed at a version the column
    // does not hold, and one reviewed at a version it does. Only the exact reviewed version
    // resolves, because versions are immutable and distinct, so a verdict for another version of
    // the same base URL is evidence about a different card.
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
fn plain_number_corpus_resolves_the_memory_scheme() {
    // A plain-number column derives ids from the memory scheme alone:
    // the store-identity URL records as unresolved (the control), and
    // the memory URL reaches the row whose id its authority names.
    let path = write_ontology_identities(
        &scratch("resolve-width"),
        (0..4_u64).map(MemoryOntologyId::new),
    );

    let document = concat!(
        r#"{"pair_verdicts":[],"schema":"atlas-reviewed-verdicts/1","sources":{},"#,
        r#""type_verdicts":["#,
        r#"{"class":"proximal","relation":"hash:https://hash.ai/@h/types/entity-type/delivers/","#,
        r#""reviewer":"Bilal Mahmoud","versioned_url":"https://hash.ai/@h/types/entity-type/delivers/v/3"},"#,
        r#"{"class":"proximal","relation":"memory:employment-link","#,
        r#""reviewer":"Bilal Mahmoud","versioned_url":"memory://2/v/1"}"#,
        r#"]}"#,
        "\n",
    );
    let supplied = SuppliedVerdicts::from_bytes(document.as_bytes())
        .expect("a contract-conforming document admits");

    let resolution = resolve_supplied::<MemoryOntologyId>(&path, &supplied)
        .expect("a plain-number corpus resolves the memory scheme");

    assert_eq!(resolution.resolved.len(), 1);
    assert_eq!(resolution.resolved[0].relation, OntologyRowId::new(2));
    assert_eq!(resolution.resolved[0].placement, PlacementClass::Proximal);
    assert_eq!(resolution.unresolved, 1);
}
