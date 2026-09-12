//! A synthetic generation for the serving tests.
//!
//! The fixture publishes a corpus of [`NODES`] nodes, [`EDGES`] edges and [`TYPES`] ontology rows
//! through the writers the fit stages its delivery structure with: [`Lod::build`] for the base
//! order and its four permutation columns, [`QuadTree::build`], [`Postings::build`],
//! [`Adjacency::build`], and [`IdentityTable::write_into`] for the three identity tables. Staging
//! eight chosen points through the builders a fit stages with keeps every artifact the serving
//! open reads at the format the fit writes, and runs none of the fit's ingest, embedding or
//! placement stages. The artifacts the serving open never opens are placeholders bound to the
//! digest of their own bytes: the seal requires every manifest name present, and the open
//! verifies the digest of a file it opens. Every count a test compares against is a constant of
//! this module.
//!
//! [`TamperFixture::tamper`] republishes the generation with one file rewritten and re-bound to
//! the digest of its new bytes. The digest check passes and the structural check inside the open
//! refuses the file. A file edited in place fails the digest check first.

use core::{borrow::Borrow, num::NonZero};
use std::{io::Write as _, path::Path};

use camino::{Utf8Path, Utf8PathBuf};
use hashql_core::id::{IdSlice, IdVec};
use smallvec::SmallVec;
use type_system::ontology::id::VersionedUrl;
use uuid::Uuid;
use zerocopy::U64;

use super::super::secret::ServeSecret;
use crate::{
    dataset::{
        DatasetOrigin,
        auxiliary::{Icon, Label, OwnedLegend},
    },
    file::{
        ArtifactFile as _, WriteInto as _,
        array::{ArrayVariant, Dim, SizedArrayWriter, SizedColumn},
        digest_file,
        generation::{Generation, GenerationRoot, StagedGeneration},
        identity::{Key, Row},
        postings::{read::PostingsFile, write::Regions},
        quad::{Node, TypeSets, read::QuadFile},
        repository::{Artifact, Binding, FileName, RepositoryVersion},
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
        AffinityCurve, FinitePointField, Vec2, d_non_negative, d_positive, non_negative,
        open_unit_fraction, unit_fraction,
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
/// Distinct points with extent on both axes, hence a world frame and a base order that is a
/// permutation.
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
const SECRET: [u8; 32] = *b"atlas-test-serve-secret-32-bytes";

/// The serving secret every suite open uses.
pub(crate) fn secret() -> ServeSecret {
    ServeSecret::from(SecretHexBytes::new(SECRET))
}

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-serve-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    dir
}

/// One synthetic entity identity per seed byte.
fn entity_id_of(seed: u8) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: Uuid::from_bytes([seed; 16]).into(),
        entity_uuid: Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
    }
}

/// The versioned type URL behind ontology row `row`.
///
/// Ontology identities key each row by the uuid its URL derives, as the store's do.
fn fixture_type_url(row: u64) -> String {
    format!("https://example.com/types/fixture-{row}/v/1")
}

/// The ontology identity of row `row`.
fn ontology_id_of(row: u64) -> ArchivedOntologyTypeUuid {
    let url: VersionedUrl = fixture_type_url(row)
        .parse()
        .expect("the fixture URL parses");
    ArchivedOntologyTypeUuid::from_url(&url)
}

/// A table of `rows` sequential entity identities from `seed`.
fn entity_table<R: Row>(rows: u64, seed: u8) -> IdentityTable<R, ArchivedEntityId> {
    let mut table = IdentityTable::new();
    for row in 0..rows {
        let row = u8::try_from(row).expect("fixture row counts fit u8");
        table.push(entity_id_of(seed + row));
    }
    table
}

/// A table of `rows` ontology identities.
fn ontology_table(rows: u64) -> IdentityTable<OntologyRowId, ArchivedOntologyTypeUuid> {
    let mut table = IdentityTable::new();
    for row in 0..rows {
        table.push(ontology_id_of(row));
    }
    table
}

/// Each node row's direct types: one type per row, alternating between the two node types.
fn node_types() -> IdVec<NodeRowId, SmallVec<OntologyRowId, 2>> {
    (0..NODES)
        .map(|row| SmallVec::from_buf_and_len([OntologyRowId::new(row & 1), LINK_TYPE], 1))
        .collect()
}

/// The direct-parent column of [`PARENTS`].
fn parents() -> IdVec<OntologyRowId, SmallVec<OntologyRowId, 2>> {
    PARENTS
        .iter()
        .map(|parents| parents.iter().copied().collect())
        .collect()
}

/// The fit configuration the document echoes.
///
/// The seed and the schedule are what [`Lod::build`] consumes. The remaining fields describe
/// stages a synthetic generation does not run and carry the smallest values their types admit.
fn config() -> FitConfig {
    FitConfig {
        seed: SEED,
        selection: SelectionOptions {
            maximum_count: NonZero::new(2).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::new(1.577, 0.895)
            .expect("the fixture parameters are finite and strictly positive"),
        placement: PlacementOptions::LandmarkBaseline,
        ranking: RankingConfig::ConstantColumns,
        ..
    }
}

/// Stages a placeholder for an artifact the serving open never opens.
///
/// The bytes are the artifact's own name, and the binding carries their digest.
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
struct Delivery {
    /// Each node row's direct types.
    types: IdVec<NodeRowId, SmallVec<OntologyRowId, 2>>,
    /// The base order and its permutation columns.
    lod: Lod,
    /// The quadtree cut over the base order.
    quad: QuadTree,
    /// The type postings over the base order.
    postings: Postings,
    /// The incident-edge adjacency over [`ENDPOINTS`].
    adjacency: Adjacency,
}

/// Derives the delivery structure over the corpus constants.
fn derive(config: &FitConfig) -> Delivery {
    let coordinates = IdSlice::<NodeRowId, Vec2>::from_raw(&COORDINATES);
    let coordinates = FinitePointField::new(coordinates).expect("the fixture points are finite");
    let node_ids: IdVec<NodeRowId, ArchivedEntityId> = (0..NODES)
        .map(|row| entity_id_of(u8::try_from(row).expect("fixture row counts fit u8")))
        .collect();
    let types = node_types();
    let parents = parents();
    let nodes = usize::try_from(NODES).expect("fixture node counts fit usize");

    let importance = ConstantImportance.derive(nodes);
    let priority = IdVec::from_domain(0.0_f32, &importance);
    let inputs = RankInputs::new(&importance, &priority, &node_ids)
        .expect("the fixture rank columns agree with the coordinates");
    let lod = Lod::build(coordinates, inputs, config.seed, config.lod).expect("the lod builds");
    let quad = QuadTree::build(&lod, &types, config.lod).expect("the quadtree builds");
    let postings =
        Postings::build(&types, &lod.row_of_position, &parents).expect("the postings build");
    let adjacency = Adjacency::build(nodes, &ENDPOINTS);

    Delivery {
        types,
        lod,
        quad,
        postings,
        adjacency,
    }
}

#[expect(clippy::cast_possible_truncation)]
const EDGE_COUNT: usize = EDGES as usize;

/// Stages every artifact of the generation and returns the manifest's typed entries.
fn stage_files(
    staging: &StagedGeneration,
    Delivery {
        types,
        lod,
        quad,
        postings,
        adjacency,
    }: &Delivery,
) -> SaltFiles {
    let node_legends: Vec<OwnedLegend> = types
        .iter()
        .map(|types| OwnedLegend::new(types[0], Label::EMPTY))
        .collect();
    let edge_legend = OwnedLegend::new(LINK_TYPE, Label::EMPTY);
    // Row 0 carries an icon and its child row 1 resolves to it through the closure.
    let icons = [Icon::new("fixture-icon"), Icon::empty(), Icon::empty()];

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
                SizedColumn::new(IdSlice::<NodeRowId, Vec2>::from_raw(&COORDINATES)),
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
        node_identities: staging
            .stage_with(artifact::NodeIdentities, |writer| {
                entity_table::<NodeRowId>(NODES, 0)
                    .write_into(node_legends.iter().map(Borrow::borrow), writer)
            })
            .expect("the node identities stage"),
        edge_identities: staging
            .stage_with(artifact::EdgeIdentities, |writer| {
                entity_table::<EdgeRowId>(EDGES, EDGE_SEED)
                    .write_into(core::iter::repeat_n(&*edge_legend, EDGE_COUNT), writer)
            })
            .expect("the edge identities stage"),
        ontology_identities: staging
            .stage_with(artifact::OntologyIdentities, |writer| {
                ontology_table(TYPES).write_into(icons, writer)
            })
            .expect("the ontology identities stage"),
        edge_endpoints: staging
            .stage_with(artifact::EdgeEndpoints, |writer| {
                SizedColumn::new(IdSlice::<EdgeRowId, [NodeRowId; 2]>::from_raw(&ENDPOINTS))
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

/// The metadata document of the synthetic generation.
///
/// The snapshot counts are the corpus constants, and the lod, quad and postings sections are the
/// builds' own measurements. The sections of the stages a synthetic generation does not run
/// carry empty readings.
fn metadata(config: FitConfig, delivery: &Delivery) -> SaltMetadata {
    let nodes = usize::try_from(NODES).expect("fixture node counts fit usize");
    let edges = usize::try_from(EDGES).expect("fixture edge counts fit usize");
    let types = usize::try_from(TYPES).expect("fixture type counts fit usize");
    let lod = delivery.lod.measurements(config.lod);

    SaltMetadata {
        snapshot: Snapshot {
            axes: None,
            nodes: NODES,
            edges: EDGES,
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
                deviation: d_non_negative!(0.0),
                minimum_recall: unit_fraction!(0.89),
                resolution: d_non_negative!(0.0),
                confidence: open_unit_fraction!(0.99),
            },
            landmarks: LandmarkEvidence {
                selected: 0,
                retained: 0,
                layout_epochs: NonZero::new(1).expect("the fixture epoch count is nonzero"),
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
                retained_mass: d_non_negative!(0.0),
                pruned_mass: d_non_negative!(0.0),
                self_references: 1,
                multi_typed_edges: vec![EDGES],
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
/// Every tamper test publishes its own fixture and moves a single domain by one row, leaving the
/// artifact valid at its own format. The tamper republishes the generation with the edited file
/// sealed under its own digest, and the rejection names the tamper's own variant. The untampered
/// generation is never written to. Dropping the fixture removes the root and every generation
/// under it.
pub(crate) struct TamperFixture {
    root: GenerationRoot,
    generation: Generation,
}

impl TamperFixture {
    /// Publishes the synthetic generation under a root named `name`.
    #[expect(clippy::significant_drop_tightening, reason = "false-positive")]
    pub(crate) fn publish(name: &str) -> Self {
        let config = config();
        let delivery = derive(&config);

        let root = GenerationRoot::new(scratch(name)).expect("the root should open");
        let staging = root.stage().expect("the staging should create");
        let repository = SaltRepository {
            version: RepositoryVersion::V2,
            files: stage_files(&staging, &delivery),
            metadata: metadata(config, &delivery),
        };
        let published = staging.seal(&repository).expect("the staging should seal");

        let generation = root
            .open(published.id())
            .expect("the published generation should open");

        Self { root, generation }
    }

    /// The untampered generation.
    pub(crate) const fn generation(&self) -> &Generation {
        &self.generation
    }

    /// Republishes the generation with `edit` applied to the artifact `name`.
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
        drop(std::fs::remove_dir_all(self.root.path()));
    }
}

/// Reopens a published artifact for rewriting.
///
/// Sealing dropped the write permission. A tamper therefore lifts it before truncating the file.
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
pub(crate) fn shorten_entities<R: Row>(path: impl AsRef<Path>, rows: u64, seed: u8) {
    let legend = OwnedLegend::new(OntologyRowId::new(0), Label::EMPTY);
    let legends = core::iter::repeat_n(
        legend.borrow(),
        usize::try_from(rows).expect("fixture row counts fit usize"),
    );
    rewrite_identities(path, &entity_table::<R>(rows, seed), legends);
}

/// Rewrites the ontology identity artifact with `rows` fixture type uuids and no icons.
pub(crate) fn shorten_ontology(path: impl AsRef<Path>, rows: u64) {
    let icons = core::iter::repeat_n(
        Icon::empty(),
        usize::try_from(rows).expect("fixture row counts fit usize"),
    );
    rewrite_identities(path, &ontology_table(rows), icons);
}

/// Rewrites the endpoint column with `pairs`, dropping whatever the fixture published beyond it.
pub(crate) fn shorten_endpoints(path: impl AsRef<Path>, pairs: &[[NodeRowId; 2]]) {
    let file = recreate_writable(path);
    let _digest = SizedColumn::new(IdSlice::<EdgeRowId, [NodeRowId; 2]>::from_raw(pairs))
        .write_into(file)
        .expect("the endpoint column should write");
}

/// Rewrites the adjacency artifact over the same edges, spanning `rows` node rows.
///
/// The production builder writes it. The file therefore keeps every property the incident-list
/// contract checks (paired runs, the domain-bound column dimension, one slot per edge per
/// direction) and disagrees with the columns on the node domain alone.
pub(crate) fn respan_adjacency(path: impl AsRef<Path>, rows: usize, endpoints: &[[NodeRowId; 2]]) {
    let file = recreate_writable(path);
    let _digest = Adjacency::build(rows, endpoints)
        .write_into(file)
        .expect("the adjacency should write");
}

/// Rewrites the quad artifact with the root's subtree count set to `points`.
///
/// The topology, the runs, and the type sets are the published ones. The quad format validates the
/// header, the fenceposts, and the child indexes, and never the subtree counts, which is why `open`
/// must.
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
/// Every other region restates the published one. The dense sets rebuild over the new domain,
/// because every frame's own domain count restates the header's and open checks the agreement,
/// and the direct fenceposts resize to cover it - truncating drops the stranded runs' ids,
/// growing appends empty runs. Only the header's point count and the bound every list position
/// must clear actually move.
pub(crate) fn retarget_postings_points(path: impl AsRef<Path>, points: u64) {
    // The mapping ends before the rewrite. The file backs the slices read here, hence every region
    // copies into build vocabulary first.
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
/// The values do not matter to the check under test - `open` compares lengths - and ascending keeps
/// the file a plausible permutation prefix rather than a shape no producer would write.
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

/// Rewrites a little-endian `u32` column with `rows` copies of `value`.
///
/// A constant column keeps its length and its format and cannot be a permutation. The roundtrip
/// sample refuses exactly that.
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
/// The row column is the one `u64` column of the base order, and the same constant-column argument
/// holds for it.
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
