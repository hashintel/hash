//! Cross-artifact agreement at open: each shared-domain disagreement names its own variant.
//!
//! `Atlas::open` is the only place that checks the artifacts against each other; every read path
//! below it indexes across them without re-validating. A generation whose artifacts disagree
//! therefore gets one chance at refusal, and refusing it under the wrong name leaves an operator
//! little better off than serving it would: the variant is what an operator repairs from.

use core::assert_matches;
use std::io::Write as _;

use camino::Utf8PathBuf;
use hashql_core::id::{Id as _, IdVec};
use type_system::ontology::id::VersionedUrl;
use zerocopy::{IntoBytes as _, LE, U64};

use super::{
    Atlas, EDGE_SEED, OpenAtlasError, entity_id_of, fit_fixture, fixture_type_url,
    recreate_writable, rewrite_identities, store_identities, test_open_options,
};
use crate::{
    file::{
        WriteInto as _,
        array::{ArrayVariant, Dim, SizedArrayWriter},
        generation::{Generation, GenerationRoot},
        identity::{Row, read::IdentityFile},
        postings::{read::PostingsFile, write::Regions},
        quad::{Node, TypeSets, read::QuadFile},
        repository::FileName,
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    salt::{adjacency::Adjacency, fit::prepare::identity::IdentityTable},
};

/// One artifact's bytes, held so a tamper can be undone.
struct Saved {
    path: Utf8PathBuf,
    bytes: Vec<u8>,
}

impl Saved {
    fn of(path: Utf8PathBuf) -> Self {
        let bytes = std::fs::read(&path).expect("the published artifact reads");
        Self { path, bytes }
    }

    fn restore(&self) {
        let mut file = recreate_writable(&self.path);
        file.write_all(&self.bytes).expect("the artifact restores");
    }
}

/// Rewrites an entity identity artifact with `rows` sequential fixture ids from `seed`.
fn shorten_entities<R: Row>(path: &Utf8PathBuf, rows: u64, seed: u8) {
    let mut table = IdentityTable::<R, ArchivedEntityId>::new();
    for row in 0..rows {
        let row = u8::try_from(row).expect("fixture row counts fit u8");
        table.push(entity_id_of(seed + row));
    }
    // The all-zero legend payload names ontology row 0 under the empty label.
    let empty = vec![vec![0_u8; 8]; usize::try_from(rows).expect("fixture row counts fit usize")];
    rewrite_identities(path, &table, &empty);
}

/// Rewrites the ontology identity artifact with `rows` fixture type uuids.
fn shorten_ontology(path: &Utf8PathBuf, rows: u64) {
    let mut table = IdentityTable::<OntologyRowId, ArchivedOntologyTypeUuid>::new();
    for row in 0..rows {
        let url: VersionedUrl = fixture_type_url(row)
            .parse()
            .expect("the fixture URL parses");
        table.push(ArchivedOntologyTypeUuid::from_url(&url));
    }
    let empty = vec![Vec::new(); usize::try_from(rows).expect("fixture row counts fit usize")];
    rewrite_identities(path, &table, &empty);
}

/// Rewrites the endpoint column with `pairs`, dropping whatever the fixture published beyond it.
fn shorten_endpoints(path: &Utf8PathBuf, pairs: &[[NodeRowId; 2]]) {
    let file = recreate_writable(path);
    let mut writer = SizedArrayWriter::new(
        file,
        ArrayVariant::U64Le,
        &[Dim::new(pairs.len() as u64), Dim::new(2)],
    )
    .expect("the header writes");
    for &[source, target] in pairs {
        let row = [
            U64::<LE>::new(source.as_u64()),
            U64::<LE>::new(target.as_u64()),
        ];
        writer.write_row(row.as_bytes()).expect("the row writes");
    }
    writer.finish().expect("the column seals");
}

/// Rewrites the adjacency artifact over the same edges, spanning `rows` node rows.
///
/// The production builder writes it, so the file keeps every property the incident-list contract
/// checks - paired runs, the domain-bound column dimension, one slot per edge per direction - and
/// disagrees with the columns on the node domain alone.
fn respan_adjacency(path: &Utf8PathBuf, rows: usize, endpoints: &[[NodeRowId; 2]]) {
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
fn retarget_quad_root(path: &Utf8PathBuf, points: u32) {
    // The mapping ends before the rewrite: the file backs the slices read here.
    let (mut nodes, sets) = {
        let quad = QuadFile::open(path).expect("the published quad artifact opens");
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
fn retarget_postings_points(path: &Utf8PathBuf, points: u64) {
    // The mapping ends before the rewrite: the file backs the slices read here, so every region
    // is copied into build vocabulary first.
    let (flags, lists, dense_sets, parents, direct) = {
        let postings = PostingsFile::open(path).expect("the published postings artifact opens");

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

        (
            flags,
            crate::runs::Runs::from_parts(
                IdVec::from_raw(postings.list_posts().to_vec()),
                postings.list_entries().to_vec(),
            )
            .expect("the published list columns satisfy the fencepost law"),
            dense_sets,
            crate::runs::Runs::from_parts(
                IdVec::from_raw(postings.parent_posts().to_vec()),
                postings.parent_ids().to_vec(),
            )
            .expect("the published parent columns satisfy the fencepost law"),
            crate::runs::Runs::from_parts(
                IdVec::from_raw(
                    direct_posts
                        .iter()
                        .map(|&post| U64::new(post as u64))
                        .collect(),
                ),
                direct_ids,
            )
            .expect("the resized direct columns satisfy the fencepost law"),
        )
    };

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
fn shorten_u32_column(path: &Utf8PathBuf, rows: u64) {
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
/// A constant column keeps its length and its format and cannot be a permutation, which is what
/// the rank roundtrip sample refuses.
fn constant_u32_column(path: &Utf8PathBuf, rows: u64, value: u32) {
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

/// One published generation with the counts its tamper witnesses compare against.
///
/// Every tamper test publishes its own fixture and moves a single domain by one row, leaving
/// the artifact valid at its own format. The rejection must name the tamper's own variant; the
/// test then restores the bytes and reopens. The reopen is the negative control: each rejection
/// belongs to its tamper rather than to a fixture that had stopped opening unnoticed.
///
/// The artifact structure forces which direction a tamper moves a domain. Dropping a node row
/// from the adjacency would drop that node's edge slots with it and move the edge domain in the
/// same tamper; narrowing the postings' point domain can strand a membership position outside
/// it, which the postings contract refuses first and under its own name. Both therefore add a
/// row, and widening is as much a producer bug as truncation is.
///
/// Both universe variants are absent and cannot be present: `Universe` and `EdgeUniverse` fire
/// above `u32::MAX` rows, which no fixture constructs. They guard arithmetic the fixture cannot
/// reach, so no tamper can exercise them. Every other variant of the cross-artifact pass has a
/// tamper test over this fixture.
struct TamperFixture {
    root: GenerationRoot,
    generation: Generation,
    nodes: u64,
    endpoints: Vec<[NodeRowId; 2]>,
}

impl TamperFixture {
    /// Publishes `name`'s generation and reads the untampered counts, proving it opens.
    async fn publish(name: &str) -> Self {
        let (root, generation) = fit_fixture(name).await;
        store_identities(&generation);

        let atlas = Atlas::open(&root, generation.id(), test_open_options())
            .expect("the published fixture opens");
        let nodes = atlas.row_ids().len() as u64;
        let endpoints = atlas.endpoint_pairs().as_raw().to_vec();
        drop(atlas);

        Self {
            root,
            generation,
            nodes,
            endpoints,
        }
    }

    /// Opens the fixture's generation.
    fn open(&self) -> Result<Atlas, OpenAtlasError> {
        Atlas::open(&self.root, self.generation.id(), test_open_options())
    }

    /// Returns the path of `name`'s artifact.
    fn path_of(&self, name: &FileName) -> Utf8PathBuf {
        self.generation.path_of(name)
    }

    /// The fixture's edge count, the endpoint pairs' own length.
    fn edges(&self) -> u64 {
        self.endpoints.len() as u64
    }
}

/// Open refuses a node identity table short of the code column, under `Identities`.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn short_node_identity_table_refuses() {
    let fixture = TamperFixture::publish("open-node-identities").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    let node_identities = Saved::of(fixture.path_of(&files.node_identities.name()));
    shorten_entities::<NodeRowId>(&node_identities.path, nodes - 1, 0);
    assert_matches!(
        fixture.open().expect_err("a short node identity table is refused"),
        OpenAtlasError::Identities { identities, codes }
            if identities == nodes - 1 && codes == nodes,
    );
    node_identities.restore();
    fixture.open().expect("the repaired fixture opens");
}

/// Open refuses an edge identity table short of the adjacency's edge domain, under
/// `EdgeIdentities`.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn short_edge_identity_table_refuses() {
    let fixture = TamperFixture::publish("open-edge-identities").await;
    let edges = fixture.edges();
    let files = &fixture.generation.repository().files;

    let edge_identities = Saved::of(fixture.path_of(&files.edge_identities.name()));
    shorten_entities::<EdgeRowId>(&edge_identities.path, edges - 1, EDGE_SEED);
    assert_matches!(
        fixture.open().expect_err("a short edge identity table is refused"),
        OpenAtlasError::EdgeIdentities { identities, edges: spanned }
            if identities == edges - 1 && spanned == edges,
    );
    edge_identities.restore();
    fixture.open().expect("the repaired fixture opens");
}

/// Open refuses an ontology identity table short of the postings' type domain, under `Types`.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn short_ontology_identity_table_refuses() {
    let fixture = TamperFixture::publish("open-ontology-identities").await;
    let files = &fixture.generation.repository().files;
    let types = IdentityFile::open(fixture.path_of(&files.ontology_identities.name()))
        .expect("the published ontology identities open")
        .rows();

    let ontology_identities = Saved::of(fixture.path_of(&files.ontology_identities.name()));
    shorten_ontology(&ontology_identities.path, types - 1);
    assert_matches!(
        fixture
            .open()
            .expect_err("a short ontology identity table is refused"),
        OpenAtlasError::Types { postings, identities }
            if postings == types && identities == types - 1,
    );
    ontology_identities.restore();
    fixture.open().expect("the repaired fixture opens");
}

/// Open refuses a base-order column short of the code column, under `Columns`.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn short_rank_column_refuses() {
    let fixture = TamperFixture::publish("open-rank-column").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    let ranks = Saved::of(fixture.path_of(&files.rank_of_position.name()));
    shorten_u32_column(&ranks.path, nodes - 1);
    assert_matches!(
        fixture.open().expect_err("a short rank column is refused"),
        OpenAtlasError::Columns {
            codes,
            coordinates,
            rows,
            ranks: ranked,
            positions,
            rank_positions,
        } if codes == nodes
            && coordinates == nodes
            && rows == nodes
            && ranked == nodes - 1
            && positions == nodes
            && rank_positions == nodes,
    );
    ranks.restore();
    fixture.open().expect("the repaired fixture opens");
}

/// Open refuses an adjacency spanning an extra node row, under `Nodes`.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn respanned_adjacency_refuses() {
    let fixture = TamperFixture::publish("open-adjacency-span").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    let adjacency = Saved::of(fixture.path_of(&files.adjacency.name()));
    respan_adjacency(
        &adjacency.path,
        usize::try_from(nodes + 1).expect("fixture node counts fit usize"),
        &fixture.endpoints,
    );
    assert_matches!(
        fixture
            .open()
            .expect_err("an adjacency spanning an extra node row is refused"),
        OpenAtlasError::Nodes { adjacency: spanned, codes }
            if spanned == nodes + 1 && codes == nodes,
    );
    adjacency.restore();
    fixture.open().expect("the repaired fixture opens");
}

/// Open refuses an endpoint column short of the adjacency's edge domain, under `Edges`.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn short_endpoint_column_refuses() {
    let fixture = TamperFixture::publish("open-endpoint-column").await;
    let edges = fixture.edges();
    let files = &fixture.generation.repository().files;

    let endpoint_column = Saved::of(fixture.path_of(&files.edge_endpoints.name()));
    shorten_endpoints(
        &endpoint_column.path,
        &fixture.endpoints[..fixture.endpoints.len() - 1],
    );
    assert_matches!(
        fixture.open().expect_err("a short endpoint column is refused"),
        OpenAtlasError::Edges { adjacency: spanned, endpoints: paired }
            if spanned == edges && paired == edges - 1,
    );
    endpoint_column.restore();
    fixture.open().expect("the repaired fixture opens");
}

/// Open refuses a quadtree root whose subtree count lies below the point count, under
/// `Subtree`.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn retargeted_quad_root_refuses() {
    let fixture = TamperFixture::publish("open-quad-root").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    let quad = Saved::of(fixture.path_of(&files.quad.name()));
    retarget_quad_root(
        &quad.path,
        u32::try_from(nodes - 1).expect("fixture point counts fit u32"),
    );
    assert_matches!(
        fixture
            .open()
            .expect_err("a root subtree count below the point count is refused"),
        OpenAtlasError::Subtree { quad: counted, codes }
            if counted == nodes - 1 && codes == nodes,
    );
    quad.restore();
    fixture.open().expect("the repaired fixture opens");
}

/// Open refuses a postings point domain above the code column's count, under `Points`.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn retargeted_postings_points_refuses() {
    let fixture = TamperFixture::publish("open-postings-points").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    let postings = Saved::of(fixture.path_of(&files.postings.name()));
    retarget_postings_points(&postings.path, nodes + 1);
    assert_matches!(
        fixture
            .open()
            .expect_err("a postings point domain above the point count is refused"),
        OpenAtlasError::Points { postings: spanned, codes }
            if spanned == nodes + 1 && codes == nodes,
    );
    postings.restore();
    fixture.open().expect("the repaired fixture opens");
}

/// Each rank-pair tamper names its own variant, and repair restores the open.
///
/// The rank column and its reverse invert each other by the fit pipeline's construction, and
/// open spot-checks a bounded sample of roundtrips rather than paging both columns whole. The
/// tampers here keep each column valid at its own format, so the only thing that moves is the
/// pairing under test, and the reopen after each repair is the negative control.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn rank_pair_tampers_name_their_own_variants() {
    let (root, generation) = fit_fixture("open-rank-pair").await;
    store_identities(&generation);

    let open = || Atlas::open(&root, generation.id(), test_open_options());
    let files = &generation.repository().files;

    let atlas = open().expect("the published fixture opens");
    let nodes = atlas.row_ids().len() as u64;
    drop(atlas);

    // The reverse rank permutation against the code column.
    let rank_positions = Saved::of(generation.path_of(&files.position_of_rank.name()));
    shorten_u32_column(&rank_positions.path, nodes - 1);
    assert_matches!(
        open().expect_err("a short reverse rank permutation is refused"),
        OpenAtlasError::Columns {
            codes,
            rank_positions: reversed,
            ..
        } if codes == nodes && reversed == nodes - 1,
    );
    rank_positions.restore();
    open().expect("the repaired fixture opens");

    // Every rank claiming position zero keeps the length and the format and is no permutation,
    // so the spot check refuses the pairing at the first sampled position past zero.
    constant_u32_column(&rank_positions.path, nodes, 0);
    assert_matches!(
        open().expect_err("a non-inverse reverse rank permutation is refused"),
        OpenAtlasError::RankInverse {
            position,
            rank: _,
            roundtrip: Some(0),
        } if position > 0,
    );
    rank_positions.restore();
    open().expect("the repaired fixture opens");

    // When a rank lies outside the domain, the sample reports the roundtrip as absent.
    let ranks = Saved::of(generation.path_of(&files.rank_of_position.name()));
    constant_u32_column(&ranks.path, nodes, u32::MAX);
    assert_matches!(
        open().expect_err("an out-of-domain rank is refused"),
        OpenAtlasError::RankInverse {
            position: 0,
            rank,
            roundtrip: None,
        } if rank == u64::from(u32::MAX),
    );
    ranks.restore();
    open().expect("the repaired fixture opens");
}
