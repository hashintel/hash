//! A synthetic generation for the serving tests.
//!
//! The default corpus contains the nodes in [`COORDINATES`], the edges in [`ENDPOINTS`] and the
//! ontology rows in [`TYPES`]. Its delivery artifacts are built with the same writers as a fit:
//! [`Lod::build`] for the base order and four permutation columns, [`QuadTree::build`],
//! [`Postings::build`], [`Adjacency::build`] and [`IdentityTable::write_into`] for the three
//! identity tables. This stages eight chosen points through the artifact writers without running
//! the fit's ingest, embedding or placement stages. Every artifact opened by serving therefore has
//! the format produced by a fit. Artifacts that serving never opens are placeholders bound to the
//! digest of their own bytes. The seal requires every manifest name, while open verifies each file
//! it reads against its digest.
//!
//! Tampered fixtures republish the generation with one file rewritten and re-bound to the digest of
//! its new bytes. This isolates structural validation from digest verification. A file edited in
//! place fails the digest check first.
//!
//! Larger edgeless corpora support checks whose samples exhaust the default fixture.

use core::borrow::Borrow;
use std::io::Write as _;

// serving unit tests edit individual fixture artifacts.
#[cfg(test)]
use camino::Utf8Path;
use camino::Utf8PathBuf;
use hashql_core::id::{IdSlice, IdVec};
use smallvec::SmallVec;
use type_system::ontology::id::VersionedUrl;
use uuid::Uuid;

use super::super::secret::ServeSecret;
// serving unit tests rebind edited artifacts to their metadata.
#[cfg(test)]
use crate::file::{digest_file, repository::FileName};
use crate::{
    dataset::{
        DatasetOrigin,
        auxiliary::{Icon, Label, OwnedLegend},
    },
    file::{
        WriteInto as _,
        array::SizedColumn,
        generation::{Generation, GenerationRoot, StagedGeneration},
        identity::Row,
        repository::{Artifact, Binding, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository, artifact,
            metadata::{
                ClassifierEvidence, Evidence, LandmarkEvidence, Placement, PolicyEvidence,
                RankingOrigin, Reproducibility, SaltMetadata, Snapshot,
            },
        },
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    integrity::{SecretHexBytes, Sha256Digest},
    math::{
        AffinityCurve, DNonNegative, FinitePointField, Vec2, d_positive, non_negative, nz,
        open_unit_fraction, positive, unit_fraction,
    },
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    salt::{
        adjacency::Adjacency,
        embedding::{CardEmbeddingStats, EmbedderFingerprint},
        fit::{
            FitConfig, PlacementOptions,
            prepare::{identity::IdentityTable, norm::NormSpotCheck},
        },
        importance::{ConstantImportance, ImportanceSignal as _, RankingConfig},
        knn::recall::RecallSpotCheck,
        landmark::select::SelectionOptions,
        lod::{
            quad::QuadTree,
            rank::RankInputs,
            stage::{Lod, MortonColumn},
        },
        postings::build::Postings,
        relation::BuildMeasurements,
    },
};

/// The canonical coordinates, one per node row.
///
/// Distinct points with extent on both axes. The extent fits a world frame, and the distinct points
/// give the base order a spatial order the cases can check.
const COORDINATES: [Vec2; 8] = [
    Vec2::new(-2.0, -1.0),
    Vec2::new(-1.0, 2.0),
    Vec2::new(0.0, 0.0),
    Vec2::new(1.0, -2.0),
    Vec2::new(2.0, 1.0),
    Vec2::new(3.0, 3.0),
    Vec2::new(-3.0, 0.5),
    Vec2::new(0.5, -3.0),
];

/// The node rows of the corpus.
// document, schedule, delta and world unit tests construct row domains from this count.
#[cfg(test)]
pub(crate) const NODES: u64 = COORDINATES.len() as u64;

/// The edge list, `[source row, target row]` in edge row order.
///
/// Row 2 is a self-loop. Rows 3 and 4 are a reciprocal pair over the same two nodes.
pub(crate) const ENDPOINTS: [[NodeRowId; 2]; 6] = [
    [NodeRowId::new(0), NodeRowId::new(1)],
    [NodeRowId::new(1), NodeRowId::new(2)],
    [NodeRowId::new(2), NodeRowId::new(2)],
    [NodeRowId::new(5), NodeRowId::new(7)],
    [NodeRowId::new(7), NodeRowId::new(5)],
    [NodeRowId::new(3), NodeRowId::new(6)],
];

/// The edge rows of the corpus.
// document, delta and world unit tests construct row domains from this count.
#[cfg(test)]
pub(crate) const EDGES: u64 = ENDPOINTS.len() as u64;

/// Each ontology row's direct parents, in ontology row order.
///
/// Rows 0 and 1 are the node types, row 1 a child of row 0. Row 2 is the link type.
const PARENTS: [&[OntologyRowId]; 3] = [&[], &[OntologyRowId::new(0)], &[]];

/// The ontology rows of the corpus.
pub(crate) const TYPES: u64 = PARENTS.len() as u64;

/// The link type, the representative of every edge row.
const LINK_TYPE: OntologyRowId = OntologyRowId::new(2);

/// The reproducibility seed of the base order.
const SEED: u64 = 0x5E4E;

/// The edge-domain seed offset.
///
/// Link entities own ids disjoint from node ids, as the store's are.
pub(crate) const EDGE_SEED: u8 = 64;

/// The suite's serving secret, an arbitrary value of the secret's width.
const SECRET: &[u8] = b"61746c61732d746573742d73657276652d7365637265742d33322d6279746573";

/// Returns the serving secret every suite open uses.
pub(crate) fn secret() -> ServeSecret {
    ServeSecret::from(
        SecretHexBytes::from_encoded_bytes(SECRET).expect("should decode the fixture secret"),
    )
}

/// Removes any existing fixture directory and returns its path.
///
/// # Panics
///
/// Panics if the temporary directory path is not UTF-8 or an existing fixture directory cannot be
/// removed.
fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-serve-{}-{name}",
            std::process::id()
        ));
    if let Err(error) = std::fs::remove_dir_all(&dir)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        panic!("should remove the existing fixture directory: {error}");
    }
    dir
}

/// Derives one synthetic entity identity from `seed`, distinct per seed byte.
const fn entity_id_of(seed: u8) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: Uuid::from_bytes([seed; 16]).into(),
        entity_uuid: Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
    }
}

/// Returns the versioned type URL behind ontology row `row`.
///
/// Ontology identities key each row by the uuid its URL derives, as the store's do.
fn fixture_type_url(row: u64) -> String {
    format!("https://example.com/types/fixture-{row}/v/1")
}

/// Derives the ontology identity of row `row` from its fixture URL.
fn ontology_id_of(row: u64) -> ArchivedOntologyTypeUuid {
    let url: VersionedUrl = fixture_type_url(row)
        .parse()
        .expect("the fixture URL parses");
    ArchivedOntologyTypeUuid::from_url(&url)
}

/// Builds sequential entity identities from `seed`.
///
/// The identities take the seed bytes `seed..seed + rows`, and `seed + rows` must not exceed 256.
///
/// # Panics
///
/// Panics if `rows` exceeds 256.
fn entity_table<R: Row>(rows: u64, seed: u8) -> IdentityTable<R, ArchivedEntityId> {
    let mut table = IdentityTable::new();
    for row in 0..rows {
        let row = u8::try_from(row).expect("fixture row counts fit u8");
        table.push(entity_id_of(seed + row));
    }
    table
}

/// Builds a table of `rows` ontology identities.
fn ontology_table(rows: u64) -> IdentityTable<OntologyRowId, ArchivedOntologyTypeUuid> {
    let mut table = IdentityTable::new();
    for row in 0..rows {
        table.push(ontology_id_of(row));
    }
    table
}

/// Assigns each node row one direct type, alternating between the two node types.
fn node_types(nodes: u64) -> IdVec<NodeRowId, SmallVec<OntologyRowId, 2>> {
    (0..nodes)
        .map(|row| SmallVec::from_buf_and_len([OntologyRowId::new(row & 1), LINK_TYPE], 1))
        .collect()
}

/// Builds the direct-parent column of [`PARENTS`].
fn parents() -> IdVec<OntologyRowId, SmallVec<OntologyRowId, 2>> {
    PARENTS
        .iter()
        .map(|parents| parents.iter().copied().collect())
        .collect()
}

/// Returns the fit configuration the document echoes.
///
/// The seed and the schedule are what [`Lod::build`] consumes. The remaining fields describe
/// stages a synthetic generation does not run and carry values their validators accept.
const fn config() -> FitConfig {
    FitConfig {
        seed: SEED,
        selection: SelectionOptions {
            maximum_count: nz!(2),
            ..
        },
        curve: AffinityCurve::new(positive!(1.577), positive!(0.895)),
        placement: PlacementOptions::LandmarkBaseline,
        ranking: RankingConfig::ConstantColumns,
        ..
    }
}

/// Stages a placeholder for an artifact the serving open never opens.
///
/// The bytes are the artifact's own name, and the binding carries their digest.
///
/// # Panics
///
/// Panics if staging the placeholder fails.
fn placeholder<A: Artifact>(staging: &StagedGeneration, artifact: A) -> Binding<A> {
    staging
        .stage_with(artifact, |writer| {
            let name = A::NAME;
            let bytes = name.as_str().as_bytes();
            writer.write_all(bytes)?;
            Ok(Sha256Digest::of(bytes))
        })
        .expect("the placeholder stages")
}

/// The delivery structure of the corpus, derived as a fit derives it.
struct Delivery<'corpus> {
    /// The node row count: `types`, `lod`, `quad` and `postings` all cover this many rows.
    nodes: u64,
    /// Each node row's direct types.
    types: IdVec<NodeRowId, SmallVec<OntologyRowId, 2>>,
    /// The base order and its permutation columns.
    lod: Lod,
    /// The quadtree cut over the base order.
    quad: QuadTree,
    /// The type postings over the base order.
    postings: Postings,
    /// The incident-edge adjacency over `endpoints`.
    adjacency: Adjacency,
    /// The canonical points `lod` derives from.
    coordinates: &'corpus [Vec2],
    /// The edge list `adjacency` and the edge artifacts derive from.
    endpoints: &'corpus [[NodeRowId; 2]],
}

/// Derives delivery artifacts from the supplied points and edges.
///
/// # Panics
///
/// Panics if a row cannot be encoded as a fixture identity, a point is non-finite, or an artifact
/// builder rejects the corpus.
fn derive_over<'corpus>(
    coordinates: &'corpus [Vec2],
    endpoints: &'corpus [[NodeRowId; 2]],
    config: &FitConfig,
) -> Delivery<'corpus> {
    let nodes_usize = coordinates.len();
    let nodes = u64::try_from(nodes_usize).expect("fixture node counts fit u64");
    let points = IdSlice::<NodeRowId, Vec2>::from_raw(coordinates);
    let points = FinitePointField::new(points).expect("the corpus points are finite");
    let node_ids: IdVec<NodeRowId, ArchivedEntityId> = (0..nodes)
        .map(|row| entity_id_of(u8::try_from(row).expect("fixture row counts fit u8")))
        .collect();
    let types = node_types(nodes);
    let parents = parents();

    let importance = ConstantImportance.derive(nodes_usize);
    let priority = IdVec::from_domain(0.0_f32, &importance);
    let inputs = RankInputs::new(&importance, &priority, &node_ids)
        .expect("the corpus rank columns agree with the coordinates");
    let lod = Lod::build(points, inputs, config.seed, config.lod).expect("the lod builds");
    let quad = QuadTree::build(&lod, &types, config.lod).expect("the quadtree builds");
    let postings =
        Postings::build(&types, &lod.row_of_position, &parents).expect("the postings build");
    let adjacency = Adjacency::build(nodes_usize, endpoints);

    Delivery {
        nodes,
        types,
        lod,
        quad,
        postings,
        adjacency,
        coordinates,
        endpoints,
    }
}

/// Derives the delivery structure over the corpus constants.
///
/// # Panics
///
/// Panics when an artifact builder rejects the corpus under `config`, as
/// [`derive_over`] does.
fn derive(config: &FitConfig) -> Delivery<'static> {
    derive_over(&COORDINATES, &ENDPOINTS, config)
}

/// Generates distinct finite points with alternating vertical coordinates.
// world::tests uses larger corpora to distinguish sampled from exhaustive validation.
#[cfg(test)]
fn spread_coordinates(nodes: u8) -> Vec<Vec2> {
    (0..nodes)
        .map(|row| Vec2::new(f32::from(row), f32::from(row & 1)))
        .collect()
}

/// Stages node identities with each row's first direct type and an empty label.
///
/// # Panics
///
/// Panics if a row has no direct type, a row cannot be encoded as a fixture identity, or staging
/// fails.
fn stage_nodes(
    staging: &StagedGeneration,
    nodes: u64,
    types: &IdSlice<NodeRowId, SmallVec<OntologyRowId, 2>>,
) -> Binding<artifact::NodeIdentities> {
    let legends: Vec<OwnedLegend> = types
        .iter()
        .map(|types| OwnedLegend::new(types[0], Label::EMPTY))
        .collect();

    staging
        .stage_with(artifact::NodeIdentities, |writer| {
            entity_table::<NodeRowId>(nodes, 0)
                .write_into(legends.iter().map(Borrow::borrow), writer)
        })
        .expect("should stage the node identities")
}

/// Stages every artifact of the generation and returns the manifest's typed entries.
///
/// # Panics
///
/// Panics if an identity cannot be encoded, a node has no direct type, or an artifact cannot be
/// staged.
fn stage_files(
    staging: &StagedGeneration,
    Delivery {
        nodes,
        types,
        lod,
        quad,
        postings,
        adjacency,
        coordinates,
        endpoints,
    }: &Delivery<'_>,
) -> SaltFiles {
    let edge_legend = OwnedLegend::new(LINK_TYPE, Label::EMPTY);
    // Row 0 carries an icon and its child row 1 resolves to it through the closure.
    let icons = [Icon::new("fixture-icon"), Icon::empty(), Icon::empty()];
    let edges = u64::try_from(endpoints.len()).expect("fixture edge counts fit u64");

    SaltFiles {
        representations: placeholder(staging, artifact::Representations),
        card_embeddings: placeholder(staging, artifact::CardEmbeddings),
        card_hashes: placeholder(staging, artifact::CardHashes),
        knn: placeholder(staging, artifact::Knn),
        semantic: placeholder(staging, artifact::Semantic),
        landmarks: placeholder(staging, artifact::Landmarks),
        classifier: placeholder(staging, artifact::Classifier),
        policy: placeholder(staging, artifact::Policy),
        attraction: placeholder(staging, artifact::Attraction),
        protection: placeholder(staging, artifact::Protection),
        coordinates: staging
            .stage(
                artifact::Coordinates,
                SizedColumn::new(IdSlice::<NodeRowId, Vec2>::from_raw(coordinates)),
            )
            .expect("the coordinates stage"),
        morton: staging
            .stage(
                artifact::Morton,
                &MortonColumn {
                    fenceposts: &lod.fenceposts,
                    codes: lod.codes.as_raw(),
                },
            )
            .expect("the morton column stages"),
        quad: staging
            .stage(artifact::Quad, quad)
            .expect("the quadtree stages"),
        postings: staging
            .stage(artifact::Postings, postings)
            .expect("the postings stage"),
        wire_coordinates: staging
            .stage(
                artifact::WireCoordinates,
                SizedColumn::new(&lod.coordinates),
            )
            .expect("the wire coordinates stage"),
        rank_of_position: staging
            .stage(
                artifact::RankOfPosition,
                SizedColumn::new(&lod.rank_of_position),
            )
            .expect("the rank-of-position column stages"),
        position_of_rank: staging
            .stage(
                artifact::PositionOfRank,
                SizedColumn::new(&lod.position_of_rank),
            )
            .expect("the position-of-rank column stages"),
        position_of_row: staging
            .stage(
                artifact::PositionOfRow,
                SizedColumn::new(&lod.position_of_row),
            )
            .expect("the position-of-row column stages"),
        row_of_position: staging
            .stage(
                artifact::RowOfPosition,
                SizedColumn::new(&lod.row_of_position),
            )
            .expect("the row-of-position column stages"),
        node_identities: stage_nodes(staging, *nodes, types),
        edge_identities: staging
            .stage_with(artifact::EdgeIdentities, |writer| {
                entity_table::<EdgeRowId>(edges, EDGE_SEED)
                    .write_into(core::iter::repeat_n(&*edge_legend, endpoints.len()), writer)
            })
            .expect("the edge identities stage"),
        ontology_identities: staging
            .stage_with(artifact::OntologyIdentities, |writer| {
                ontology_table(TYPES).write_into(icons, writer)
            })
            .expect("the ontology identities stage"),
        edge_endpoints: staging
            .stage_with(artifact::EdgeEndpoints, |writer| {
                SizedColumn::new(IdSlice::<EdgeRowId, [NodeRowId; 2]>::from_raw(endpoints))
                    .write_into(writer)
            })
            .expect("the endpoint column stages"),
        adjacency: staging
            .stage(artifact::Adjacency, adjacency)
            .expect("the adjacency stages"),
        projector: None,
        reviewed_verdicts: None,
        annotation_corpus: None,
        annotation_embeddings: None,
        annotation_hashes: None,
    }
}

/// Builds the metadata document of the synthetic generation.
///
/// The snapshot counts are `delivery`'s own node and edge counts, and the lod, quad and postings
/// sections are the builds' own measurements. The sections of the stages a synthetic generation
/// does not run carry empty readings.
///
/// # Panics
///
/// Panics if a corpus count exceeds `usize`.
fn metadata(config: FitConfig, delivery: &Delivery<'_>) -> SaltMetadata {
    let nodes = usize::try_from(delivery.nodes).expect("fixture node counts fit usize");
    let edges = delivery.endpoints.len();
    let edges_u64 = u64::try_from(edges).expect("fixture edge counts fit u64");
    let types = usize::try_from(TYPES).expect("fixture type counts fit usize");
    let self_references = delivery
        .endpoints
        .iter()
        .filter(|&&[source, target]| source == target)
        .count();
    let lod = delivery.lod.measurements(config.lod);

    SaltMetadata {
        snapshot: Snapshot {
            axes: None,
            nodes: delivery.nodes,
            edges: edges_u64,
            ontology_types: TYPES,
        },
        reproducibility: Reproducibility {
            config,
            embedder: EmbedderFingerprint::new(Sha256Digest::of(b"serve fixture embedder")),
            prior: None,
        },
        dataset: Some(DatasetOrigin::Memory),
        placement: Placement::LandmarkBaseline,
        ranking: RankingOrigin::ConstantColumns,
        evidence: Evidence {
            cards: CardEmbeddingStats {
                reused: 0,
                embedded: types,
            },
            norm: NormSpotCheck {
                rows: nodes,
                sampled_rows: 0,
                tolerance: d_positive!(1.0e-4),
                defect_rate: open_unit_fraction!(0.01),
                confidence: open_unit_fraction!(0.999),
                defects: Vec::new(),
            },
            recall: RecallSpotCheck {
                sampled_rows: 0,
                neighbours_per_row: 0,
                matched: 0,
                expected: 0,
                deviation: DNonNegative::ZERO,
                minimum_recall: unit_fraction!(0.89),
                resolution: DNonNegative::ZERO,
                confidence: open_unit_fraction!(0.99),
            },
            landmarks: LandmarkEvidence {
                selected: 0,
                retained: 0,
                layout_epochs: nz!(1),
            },
            policy: PolicyEvidence {
                relations: 1,
                overridden: 0,
            },
            classifier: ClassifierEvidence::Supplied {
                source: Sha256Digest::of(b"serve fixture classifier"),
            },
            relations: BuildMeasurements {
                pruning_threshold: non_negative!(0.0),
                retained_edges: edges,
                pruned_edges: 0,
                retained_mass: DNonNegative::ZERO,
                pruned_mass: DNonNegative::ZERO,
                self_references,
                multi_typed_edges: vec![edges_u64],
            },
            lod,
            quad: delivery.quad.measurements(),
            postings: delivery.postings.measurements(),
            projector: None,
        },
    }
}

/// One published synthetic generation and the root it tampers into.
///
/// Tampering republishes the edited artifacts under their own digests. The untampered generation is
/// never written to. Dropping the fixture attempts to remove the root and every generation under
/// it, and logs a warning rather than panicking when the removal fails.
pub(crate) struct TamperFixture {
    /// The temporary root this fixture publishes every generation into.
    root: GenerationRoot,
    /// The untampered generation.
    generation: Generation,
}

impl TamperFixture {
    /// Publishes the synthetic generation under a root named `name`.
    ///
    /// # Panics
    ///
    /// Panics if constructing or publishing the fixture fails.
    // serving unit tests use the default layout.
    #[cfg(test)]
    pub(crate) fn publish(name: &str) -> Self {
        Self::with_config(name, config())
    }

    /// Publishes a one-cell root grid whose visible rows require a deeper scoped cut.
    ///
    /// # Panics
    ///
    /// Panics if constructing or publishing the fixture fails.
    #[cfg(feature = "test-utils")]
    pub(crate) fn publish_scoped(name: &str) -> Self {
        let mut config = config();
        config.lod.span = crate::math::Log2::new(0).expect("should represent the one-cell span");
        Self::with_config(name, config)
    }

    /// Builds and publishes the corpus using the supplied fixture configuration.
    ///
    /// # Panics
    ///
    /// Panics if constructing an artifact or publishing its generation fails.
    fn with_config(name: &str, config: FitConfig) -> Self {
        let delivery = derive(&config);

        Self::publish_delivery(name, config, &delivery)
    }

    /// Publishes an edgeless corpus of distinct finite points.
    ///
    /// # Panics
    ///
    /// Panics if the corpus cannot be built or its generation cannot be published and opened.
    // world::tests uses larger corpora to distinguish sampled from exhaustive validation.
    #[cfg(test)]
    pub(crate) fn publish_with_nodes(name: &str, nodes: u8) -> Self {
        let config = config();
        let coordinates = spread_coordinates(nodes);
        let delivery = derive_over(&coordinates, &[], &config);

        Self::publish_delivery(name, config, &delivery)
    }

    /// Publishes the derived artifacts and their metadata under a temporary root.
    ///
    /// # Panics
    ///
    /// Panics if an artifact cannot be written or the generation cannot be published and opened.
    #[expect(clippy::significant_drop_tightening, reason = "false-positive")]
    fn publish_delivery(name: &str, config: FitConfig, delivery: &Delivery<'_>) -> Self {
        let root = GenerationRoot::new(scratch(name)).expect("the root should open");
        let staging = root.stage().expect("the staging should create");
        let repository = SaltRepository {
            version: RepositoryVersion::V2,
            files: stage_files(&staging, delivery),
            metadata: metadata(config, delivery),
        };
        let published = staging.seal(&repository).expect("the staging should seal");

        let generation = root
            .open(published.id())
            .expect("the published generation should open");

        Self { root, generation }
    }

    /// Borrows the untampered generation.
    pub(crate) const fn generation(&self) -> &Generation {
        &self.generation
    }

    /// Republishes the generation with `edit` applied to the artifact `name`.
    ///
    /// # Panics
    ///
    /// Panics if staging, copying, re-digesting, sealing or reopening the republished generation
    /// fails.
    // serving unit tests alter individual serialized artifacts.
    #[cfg(test)]
    #[expect(clippy::significant_drop_tightening, reason = "false-positive")]
    pub(crate) fn tamper(&self, name: &FileName, edit: impl FnOnce(&Utf8Path)) -> Generation {
        let staging = self.root.stage().expect("the staging should create");

        for file in self.generation.repository().files.files() {
            std::fs::copy(
                self.generation.path_of(&file.name),
                staging.path_of(&file.name),
            )
            .expect("a published file should copy into the staging");
        }

        edit(&staging.path_of(name));

        let mut document = serde_json::to_value(self.generation.repository())
            .expect("the manifest should serialize");
        let entries = document
            .get_mut("files")
            .and_then(serde_json::Value::as_object_mut)
            .expect("the manifest holds its files object");

        for entry in entries.values_mut().filter(|entry| !entry.is_null()) {
            let name: FileName = entry
                .get("name")
                .cloned()
                .map(serde_json::from_value)
                .expect("an entry names its file")
                .expect("an entry's name is a file name");

            let digest = digest_file(staging.path_of(&name)).expect("a staged file should digest");
            entry["hash"] = serde_json::to_value(digest).expect("a digest should serialize");
        }

        let repository: SaltRepository =
            serde_json::from_value(document).expect("the rebound manifest should deserialize");

        let published = staging
            .seal(&repository)
            .expect("the edited staging should seal");

        self.root
            .open(published.id())
            .expect("the republished generation should open")
    }
}

impl Drop for TamperFixture {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(self.root.path())
            && error.kind() != std::io::ErrorKind::NotFound
        {
            tracing::warn!(error = %error, "failed to remove serving fixture directory");
        }
    }
}

// serving unit tests alter serialized fixture artifacts.
#[cfg(test)]
pub(crate) use self::tamper::{
    constant_u32_column, constant_u64_column, respan_adjacency, retarget_postings_points,
    retarget_quad_root, set_row_position, shorten_endpoints, shorten_entities, shorten_ontology,
    shorten_u32_column,
};

#[cfg(test)]
mod tamper {
    use core::borrow::Borrow as _;
    use std::{io::Write as _, path::Path};

    use hashql_core::id::{IdSlice, IdVec};
    use zerocopy::U64;

    use super::{entity_table, ontology_table};
    use crate::{
        dataset::auxiliary::{Icon, Label, OwnedLegend},
        file::{
            ArtifactFile as _, WriteInto as _,
            array::{ArrayFile, ArrayVariant, Dim, SizedArrayWriter, SizedColumn},
            identity::{Key, Row},
            postings::{read::PostingsFile, write::Regions},
            quad::{Node, TypeSets, read::QuadFile},
        },
        identity::{BasePosition, EdgeRowId, NodeRowId, OntologyRowId},
        salt::{adjacency::Adjacency, fit::prepare::identity::IdentityTable},
    };

    /// Reopens a published artifact for rewriting.
    ///
    /// Sealing dropped the write permission. A tamper therefore lifts it before truncating the
    /// file.
    ///
    /// # Panics
    ///
    /// Panics if reading or changing the artifact's permissions fails, or recreating the file does.
    fn recreate_writable(path: impl AsRef<Path>) -> std::fs::File {
        let mut permissions = std::fs::metadata(path.as_ref())
            .expect("the published artifact should stat")
            .permissions();
        #[expect(
            clippy::permissions_set_readonly_false,
            reason = "tests rewrite their own scratch files"
        )]
        permissions.set_readonly(false);

        std::fs::set_permissions(path.as_ref(), permissions).expect("the permissions should set");
        std::fs::File::create(path).expect("the published artifact rewrites")
    }

    /// Overwrites one identity artifact with a hand-built table and one payload per row.
    ///
    /// # Panics
    ///
    /// Panics if reopening the artifact or writing the table fails.
    fn rewrite_identities<'payload, R, K>(
        path: impl AsRef<Path>,
        table: &IdentityTable<R, K>,
        payloads: impl IntoIterator<Item = &'payload K::Payload>,
    ) where
        R: Row,
        K: Key<Payload: 'payload>,
    {
        let mut file = recreate_writable(path);
        let _digest = table
            .write_into(payloads, &mut file)
            .expect("the identities should write");
    }

    /// Rewrites an entity identity artifact with `rows` sequential fixture ids from `seed`.
    ///
    /// Every row's legend names ontology row 0 under the empty label.
    ///
    /// # Panics
    ///
    /// Panics if `rows` exceeds 256 or rewriting the artifact fails.
    pub(crate) fn shorten_entities<R: Row>(path: impl AsRef<Path>, rows: u64, seed: u8) {
        let legend = OwnedLegend::new(OntologyRowId::new(0), Label::EMPTY);
        let legends = core::iter::repeat_n(
            legend.borrow(),
            usize::try_from(rows).expect("fixture row counts fit usize"),
        );
        rewrite_identities(path, &entity_table::<R>(rows, seed), legends);
    }

    /// Rewrites the ontology identity artifact with `rows` fixture type uuids and no icons.
    ///
    /// # Panics
    ///
    /// Panics if `rows` does not fit `usize` or rewriting the artifact fails.
    pub(crate) fn shorten_ontology(path: impl AsRef<Path>, rows: u64) {
        let icons = core::iter::repeat_n(
            Icon::empty(),
            usize::try_from(rows).expect("fixture row counts fit usize"),
        );
        rewrite_identities(path, &ontology_table(rows), icons);
    }

    /// Rewrites the endpoint column with `pairs`, dropping the fixture's rows beyond them.
    ///
    /// # Panics
    ///
    /// Panics if rewriting the artifact fails.
    pub(crate) fn shorten_endpoints(path: impl AsRef<Path>, pairs: &[[NodeRowId; 2]]) {
        let file = recreate_writable(path);
        let _digest = SizedColumn::new(IdSlice::<EdgeRowId, [NodeRowId; 2]>::from_raw(pairs))
            .write_into(file)
            .expect("the endpoint column should write");
    }

    /// Rewrites the adjacency artifact over the same edges, spanning `rows` node rows.
    ///
    /// Each endpoint must lie in the `rows` node domain. Building from the same endpoints with a
    /// different node count preserves the paired runs, the edge-domain column bound and exactly one
    /// slot per edge per direction, while changing the node domain relative to the other artifacts.
    ///
    /// # Panics
    ///
    /// Panics if a computed adjacency slot lies outside its allocated column, or rewriting the
    /// artifact fails.
    pub(crate) fn respan_adjacency(
        path: impl AsRef<Path>,
        rows: usize,
        endpoints: &[[NodeRowId; 2]],
    ) {
        let file = recreate_writable(path);
        let _digest = Adjacency::build(rows, endpoints)
            .write_into(file)
            .expect("the adjacency should write");
    }

    /// Rewrites the quad artifact with the root's subtree count set to `points`.
    ///
    /// The topology, the runs, and the type sets are the published ones. The quad format validates
    /// the header, the fenceposts, and the child indexes, and never the subtree counts, which
    /// is why `open` must.
    ///
    /// # Panics
    ///
    /// Panics if opening the published quad artifact fails, it holds no root, or rewriting it
    /// fails.
    pub(crate) fn retarget_quad_root(path: impl AsRef<Path>, points: u32) {
        // The mapping ends before the rewrite: the file backs the slices read here.
        let (mut nodes, sets) = {
            let quad = QuadFile::open(path.as_ref()).expect("the published quad artifact opens");
            let nodes = quad.nodes().to_vec();
            let sets: Vec<Vec<u32>> = (0..nodes.len())
                .map(|node| {
                    let node = u32::try_from(node).expect("fixture node tables fit u32");
                    quad.type_set(node).iter().map(|id| id.get()).collect()
                })
                .collect();

            (nodes, TypeSets::from_sets(&sets))
        };

        let root = *nodes.first().expect("the fixture quad holds a root");
        let run = root.run();
        let length = u32::try_from(run.end - run.start).expect("fixture runs fit u32");
        nodes[0] = Node::new(root.children(), run.start, length, points);

        let file = recreate_writable(path);
        let mut file = std::io::BufWriter::new(file);
        crate::file::quad::write::write_regions(&nodes, &sets, &mut file)
            .expect("the quad regions write");
        file.flush().expect("the quad artifact flushes");
    }

    /// Rewrites the postings artifact with its point domain set to `points`.
    ///
    /// Setting `points` to a count different from the coordinate column's length creates a domain
    /// mismatch. The format ties the dense sets and the direct fenceposts to that domain as well.
    /// The dense sets rebuild over the new domain, because every frame's own domain count restates
    /// the header's and open checks the agreement. The direct fenceposts resize to cover it -
    /// truncating drops the stranded runs' ids, growing appends empty runs. The flags, lists and
    /// parents restate the published regions.
    ///
    /// # Panics
    ///
    /// Panics if opening the published postings artifact fails, a count or fencepost does not fit
    /// `usize`, a resized column breaks the fencepost law, or rewriting the artifact fails.
    pub(crate) fn retarget_postings_points(path: impl AsRef<Path>, points: u64) {
        // The file backs the slices read here, and the mapping ends before the rewrite. Every
        // region therefore copies into build vocabulary first.
        let postings =
            PostingsFile::open(path.as_ref()).expect("the published postings artifact opens");

        let published = postings.flags();
        let mut flags = crate::bitset::DenseBitSlice::new_empty(
            usize::try_from(postings.types()).expect("fixture type domains fit usize"),
        );
        let mut dense_sets = crate::bitset::DenseBitSliceArray::new_empty(
            usize::try_from(points).expect("fixture point domains fit usize"),
            usize::try_from(published.count()).expect("fixture dense counts fit usize"),
        );
        for (rank, type_row) in published.iter().enumerate() {
            flags.insert(type_row);
            for member in postings.dense_sets()[rank].iter() {
                dense_sets[rank].insert(member);
            }
        }

        let posts_len = usize::try_from(points).expect("fixture point domains fit usize") + 1;
        let mut direct_posts = postings
            .direct_posts()
            .iter()
            .map(|post| usize::try_from(post.get()).expect("fixture posts fit usize"))
            .collect::<Vec<_>>();
        let mut direct_ids = postings.direct_ids().to_vec();
        if direct_posts.len() > posts_len {
            direct_posts.truncate(posts_len);
            let close = *direct_posts
                .last()
                .expect("the fencepost region anchors at zero");
            direct_ids.truncate(close);
        } else {
            let close = *direct_posts
                .last()
                .expect("the fencepost region anchors at zero");
            direct_posts.resize(posts_len, close);
        }

        let lists = crate::runs::Runs::from_parts(
            IdVec::from_raw(postings.list_posts().to_vec()),
            postings.list_entries().to_vec(),
        )
        .expect("the published list columns satisfy the fencepost law");
        let parents = crate::runs::Runs::from_parts(
            IdVec::from_raw(postings.parent_posts().to_vec()),
            postings.parent_ids().to_vec(),
        )
        .expect("the published parent columns satisfy the fencepost law");
        let direct = crate::runs::Runs::from_parts(
            IdVec::from_raw(
                direct_posts
                    .iter()
                    .map(|&post| U64::new(post as u64))
                    .collect(),
            ),
            direct_ids,
        )
        .expect("the resized direct columns satisfy the fencepost law");

        drop(postings);

        let file = recreate_writable(path);
        let mut file = std::io::BufWriter::new(file);
        crate::file::postings::write::write_regions(
            Regions {
                flags: &flags,
                lists: &lists,
                dense_sets: &dense_sets,
                parents: &parents,
                direct: &direct,
            },
            &mut file,
        )
        .expect("the postings regions write");
        file.flush().expect("the postings artifact flushes");
    }

    /// Rewrites a little-endian `u32` column with `rows` ascending values.
    ///
    /// The values do not matter to the check under test - `open` compares lengths - and ascending
    /// keeps the file a plausible permutation prefix rather than a shape no producer would
    /// write.
    ///
    /// # Panics
    ///
    /// Panics if a written row index does not fit `u32` or writing the column fails.
    #[expect(
        clippy::little_endian_bytes,
        reason = "the array format's `U32Le` columns are little-endian bytes"
    )]
    pub(crate) fn shorten_u32_column(path: impl AsRef<Path>, rows: u64) {
        let file = recreate_writable(path);
        let mut writer = SizedArrayWriter::new(file, ArrayVariant::U32Le, &[Dim::new(rows)])
            .expect("the header writes");
        for row in 0..rows {
            let value = u32::try_from(row).expect("fixture rows fit u32");
            writer
                .write_row(&value.to_le_bytes())
                .expect("the row writes");
        }
        writer.finish().expect("the column seals");
    }

    /// Changes one row's stored base position without changing the column's other entries.
    ///
    /// # Panics
    ///
    /// Panics if the file cannot be read as a base-position column, `row` is outside its domain, or
    /// rewriting the column fails.
    pub(crate) fn set_row_position(path: impl AsRef<Path>, row: NodeRowId, position: BasePosition) {
        // retain an owned column copy for rewriting after this mapping closes.
        let mut rows = {
            let file = ArrayFile::open(path.as_ref()).expect("should open the position column");
            file.column::<NodeRowId, BasePosition>()
                .expect("should contain base positions indexed by node row")
                .to_vec()
        };
        rows[row] = position;

        let _digest = SizedColumn::new(&rows)
            .write_into(recreate_writable(path))
            .expect("should rewrite the position column");
    }

    /// Rewrites a little-endian `u32` column with `rows` copies of `value`.
    ///
    /// Constant values preserve the column's format and requested length. Over two or more rows
    /// they cannot form a permutation, which the roundtrip sample rejects.
    ///
    /// # Panics
    ///
    /// Panics if writing the column fails.
    #[expect(
        clippy::little_endian_bytes,
        reason = "the array format's `U32Le` columns are little-endian bytes"
    )]
    pub(crate) fn constant_u32_column(path: impl AsRef<Path>, rows: u64, value: u32) {
        let file = recreate_writable(path);
        let mut writer = SizedArrayWriter::new(file, ArrayVariant::U32Le, &[Dim::new(rows)])
            .expect("the header writes");
        for _ in 0..rows {
            writer
                .write_row(&value.to_le_bytes())
                .expect("the row writes");
        }
        writer.finish().expect("the column seals");
    }

    /// Rewrites a little-endian `u64` column with `rows` copies of `value`.
    ///
    /// The row column is the one `u64` column of the base order.
    ///
    /// # Panics
    ///
    /// Panics if writing the column fails.
    #[expect(
        clippy::little_endian_bytes,
        reason = "the array format's `U64Le` columns are little-endian bytes"
    )]
    pub(crate) fn constant_u64_column(path: impl AsRef<Path>, rows: u64, value: u64) {
        let file = recreate_writable(path);
        let mut writer = SizedArrayWriter::new(file, ArrayVariant::U64Le, &[Dim::new(rows)])
            .expect("the header writes");
        for _ in 0..rows {
            writer
                .write_row(&value.to_le_bytes())
                .expect("the row writes");
        }
        writer.finish().expect("the column seals");
    }
}
