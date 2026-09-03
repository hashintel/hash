//! Cross-artifact agreement at open: each shared-domain disagreement names its own variant.
//!
//! `Atlas::open` is the only place that checks the artifacts against each other. Every read path
//! below it indexes across them without re-validating. A generation whose artifacts disagree
//! therefore gets one chance at refusal, and refusing it under the wrong name leaves an operator
//! little better off than serving it would: the variant is what an operator repairs from.
//!
//! Open verifies every published file against the digest its manifest records before any
//! structural check runs. A structural tamper therefore travels through [`republish`], which seals
//! the edited file into a new generation with its digest recorded, and the check under test is the
//! first one that can refuse it. The corruption tests edit a published generation in place instead,
//! and the digest check refuses them before anything else looks.

use core::assert_matches;
use std::io::Write as _;

use camino::Utf8PathBuf;
use hashql_core::id::{Id as _, IdVec};
use type_system::ontology::id::VersionedUrl;
use zerocopy::{IntoBytes as _, LE, U64};

use super::{
    Atlas, EDGE_SEED, OpenAtlasError, entity_id_of, fit_fixture, fixture_type_url,
    recreate_writable, republish, rewrite_identities, store_identities, test_open_options,
};
use crate::{
    file::{
        WriteInto as _,
        array::{ArrayVariant, Dim, SizedArrayWriter},
        generation::{Generation, GenerationRoot},
        identity::{Row, read::IdentityFile},
        postings::{read::PostingsFile, write::Regions},
        quad::{Node, TypeSets, read::QuadFile},
        repository::{FileName, IntegrityVerificationError},
    },
    identity::{BasePosition, EdgeRowId, ImportanceRank, NodeRowId, OntologyRowId},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    salt::{adjacency::Adjacency, fit::prepare::identity::IdentityTable},
};

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
/// The production builder writes it. The file therefore keeps every property the incident-list
/// contract checks (paired runs, the domain-bound column dimension, one slot per edge per
/// direction) and disagrees with the columns on the node domain alone.
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
    // The mapping ends before the rewrite. The file backs the slices read here, hence every region
    // copies into build vocabulary first.
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
/// A constant column keeps its length and its format and cannot be a permutation. The roundtrip
/// sample refuses exactly that.
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

/// Rewrites a little-endian `u64` column with `rows` copies of `value`.
///
/// The row column is the one `u64` column of the base order, and the same constant-column argument
/// holds for it.
fn constant_u64_column(path: &Utf8PathBuf, rows: u64, value: u64) {
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

/// One published generation with the counts its tamper witnesses compare against.
///
/// Every tamper test publishes its own fixture and moves a single domain by one row, leaving
/// the artifact valid at its own format. The tamper republishes the generation with the edited
/// file sealed under its own digest, and the rejection must name the tamper's own variant. The
/// untampered generation is never written to, and reopening it after the rejection is the
/// negative control: each rejection belongs to its tamper rather than to a fixture that had
/// stopped opening unnoticed.
///
/// The artifact structure forces which direction a tamper moves a domain. Dropping a node row
/// from the adjacency would drop that node's edge slots with it and move the edge domain in the
/// same tamper; narrowing the postings' point domain can strand a membership position outside
/// it, which the postings contract refuses first and under its own name. Both therefore add a
/// row, and widening is as much a producer bug as truncation is.
///
/// Both universe variants are absent and cannot be present: `Universe` and `EdgeUniverse` fire
/// above `u32::MAX` rows, which no fixture constructs. They guard arithmetic beyond any fixture's
/// reach. Every other variant of the cross-artifact pass has a tamper test over this fixture.
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
        let generation = store_identities(&root, &generation);

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

    /// Opens the untampered generation.
    fn open(&self) -> Result<Atlas, OpenAtlasError> {
        Atlas::open(&self.root, self.generation.id(), test_open_options())
    }

    /// Republishes the generation with `edit` applied to the artifact `name` and opens the result.
    fn open_tampered(
        &self,
        name: &FileName,
        edit: impl FnOnce(&Utf8PathBuf),
    ) -> Result<Atlas, OpenAtlasError> {
        let tampered = republish(&self.root, &self.generation, |staging| {
            edit(&staging.path_of(name));
        });
        Atlas::open(&self.root, tampered.id(), test_open_options())
    }

    /// Returns the path of `name`'s artifact in the untampered generation.
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
async fn node_identities_short() {
    let fixture = TamperFixture::publish("open-node-identities").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.node_identities.name(), |path| {
                shorten_entities::<NodeRowId>(path, nodes - 1, 0);
            })
            .expect_err("a short node identity table is refused"),
        OpenAtlasError::Identities { identities, codes }
            if identities == nodes - 1 && codes == nodes,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses an edge identity table short of the adjacency's edge domain, under
/// `EdgeIdentities`.
#[tokio::test]
async fn edge_identities_short() {
    let fixture = TamperFixture::publish("open-edge-identities").await;
    let edges = fixture.edges();
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.edge_identities.name(), |path| {
                shorten_entities::<EdgeRowId>(path, edges - 1, EDGE_SEED);
            })
            .expect_err("a short edge identity table is refused"),
        OpenAtlasError::EdgeIdentities { identities, edges: spanned }
            if identities == edges - 1 && spanned == edges,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses an ontology identity table short of the postings' type domain, under `Types`.
#[tokio::test]
async fn ontology_identities_short() {
    let fixture = TamperFixture::publish("open-ontology-identities").await;
    let files = &fixture.generation.repository().files;
    let types = IdentityFile::open(fixture.path_of(&files.ontology_identities.name()))
        .expect("the published ontology identities open")
        .rows();

    assert_matches!(
        fixture
            .open_tampered(&files.ontology_identities.name(), |path| {
                shorten_ontology(path, types - 1);
            })
            .expect_err("a short ontology identity table is refused"),
        OpenAtlasError::Types { postings, identities }
            if postings == types && identities == types - 1,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a rank column short of the code column, under `Columns`.
#[tokio::test]
async fn rank_column_short() {
    let fixture = TamperFixture::publish("open-rank-column").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.rank_of_position.name(), |path| {
                shorten_u32_column(path, nodes - 1);
            })
            .expect_err("a short rank column is refused"),
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
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a reverse rank permutation short of the code column, under `Columns`.
#[tokio::test]
async fn rank_positions_short() {
    let fixture = TamperFixture::publish("open-rank-positions-short").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.position_of_rank.name(), |path| {
                shorten_u32_column(path, nodes - 1);
            })
            .expect_err("a short reverse rank permutation is refused"),
        OpenAtlasError::Columns {
            codes,
            rank_positions: reversed,
            ..
        } if codes == nodes && reversed == nodes - 1,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a reverse row permutation short of the code column, under `Columns`.
#[tokio::test]
async fn row_positions_short() {
    let fixture = TamperFixture::publish("open-row-positions-short").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.position_of_row.name(), |path| {
                shorten_u32_column(path, nodes - 1);
            })
            .expect_err("a short reverse row permutation is refused"),
        OpenAtlasError::Columns {
            codes,
            positions: reversed,
            ..
        } if codes == nodes && reversed == nodes - 1,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a reverse rank permutation that is no permutation, under `RankInverse`.
///
/// Every rank claiming position zero keeps the length and the format. The roundtrip sample
/// therefore refuses the pairing at the first sampled position past zero.
#[tokio::test]
async fn rank_positions_constant() {
    let fixture = TamperFixture::publish("open-rank-positions-constant").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.position_of_rank.name(), |path| {
                constant_u32_column(path, nodes, 0);
            })
            .expect_err("a non-inverse reverse rank permutation is refused"),
        OpenAtlasError::RankInverse {
            position,
            rank: _,
            roundtrip: Some(roundtrip),
        } if position > BasePosition::MIN && roundtrip == BasePosition::MIN,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a rank outside the reverse permutation's domain, under `RankInverse`.
///
/// The sample reports the roundtrip as absent at the first sampled position.
#[tokio::test]
async fn ranks_out_of_domain() {
    let fixture = TamperFixture::publish("open-ranks-out-of-domain").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.rank_of_position.name(), |path| {
                constant_u32_column(path, nodes, u32::MAX);
            })
            .expect_err("an out-of-domain rank is refused"),
        OpenAtlasError::RankInverse {
            position,
            rank,
            roundtrip: None,
        } if position == BasePosition::MIN && rank == ImportanceRank::MAX,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a reverse row permutation that is no permutation, under `RowInverse`.
///
/// Every node claiming position zero keeps the length and the format. Position zero's own node
/// roundtrips, and the first sampled position past it does not.
#[tokio::test]
async fn row_positions_constant() {
    let fixture = TamperFixture::publish("open-row-positions-constant").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.position_of_row.name(), |path| {
                constant_u32_column(path, nodes, 0);
            })
            .expect_err("a non-inverse reverse row permutation is refused"),
        OpenAtlasError::RowInverse {
            position,
            node: _,
            roundtrip: Some(roundtrip),
        } if position > BasePosition::MIN && roundtrip == BasePosition::MIN,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a node row outside the reverse permutation's domain, under `RowInverse`.
///
/// The sample reports the roundtrip as absent at the first sampled position.
#[tokio::test]
async fn rows_out_of_domain() {
    let fixture = TamperFixture::publish("open-rows-out-of-domain").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.row_of_position.name(), |path| {
                constant_u64_column(path, nodes, u64::MAX);
            })
            .expect_err("an out-of-domain node row is refused"),
        OpenAtlasError::RowInverse {
            position,
            node,
            roundtrip: None,
        } if position == BasePosition::MIN && node == NodeRowId::MAX,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses an adjacency spanning an extra node row, under `Nodes`.
#[tokio::test]
async fn adjacency_extra_node_row() {
    let fixture = TamperFixture::publish("open-adjacency-span").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.adjacency.name(), |path| {
                respan_adjacency(
                    path,
                    usize::try_from(nodes + 1).expect("fixture node counts fit usize"),
                    &fixture.endpoints,
                );
            })
            .expect_err("an adjacency spanning an extra node row is refused"),
        OpenAtlasError::Nodes { adjacency: spanned, codes }
            if spanned == nodes + 1 && codes == nodes,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses an endpoint column short of the adjacency's edge domain, under `Edges`.
#[tokio::test]
async fn endpoint_column_short() {
    let fixture = TamperFixture::publish("open-endpoint-column").await;
    let edges = fixture.edges();
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.edge_endpoints.name(), |path| {
                shorten_endpoints(path, &fixture.endpoints[..fixture.endpoints.len() - 1]);
            })
            .expect_err("a short endpoint column is refused"),
        OpenAtlasError::Edges { adjacency: spanned, endpoints: paired }
            if spanned == edges && paired == edges - 1,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a quadtree root whose subtree count lies below the point count, under
/// `Subtree`.
#[tokio::test]
async fn quad_root_subtree_short() {
    let fixture = TamperFixture::publish("open-quad-root").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.quad.name(), |path| {
                retarget_quad_root(
                    path,
                    u32::try_from(nodes - 1).expect("fixture point counts fit u32"),
                );
            })
            .expect_err("a root subtree count below the point count is refused"),
        OpenAtlasError::Subtree { quad: counted, codes }
            if counted == nodes - 1 && codes == nodes,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a postings point domain above the code column's count, under `Points`.
#[tokio::test]
async fn postings_points_wide() {
    let fixture = TamperFixture::publish("open-postings-points").await;
    let nodes = fixture.nodes;
    let files = &fixture.generation.repository().files;

    assert_matches!(
        fixture
            .open_tampered(&files.postings.name(), |path| {
                retarget_postings_points(path, nodes + 1);
            })
            .expect_err("a postings point domain above the point count is refused"),
        OpenAtlasError::Points { postings: spanned, codes }
            if spanned == nodes + 1 && codes == nodes,
    );
    fixture.open().expect("the untampered generation opens");
}

/// Open refuses a published file rewritten in place, under `Corruption`.
///
/// The rewrite keeps the column's length and format and would fail the roundtrip sample if it
/// reached it. The digest check runs first and names the file with both digests.
#[tokio::test]
async fn corruption_rewritten_file() {
    let fixture = TamperFixture::publish("open-corruption-rewritten").await;
    let files = &fixture.generation.repository().files;
    let name = files.rank_of_position.name();

    constant_u32_column(&fixture.path_of(&name), fixture.nodes, 0);
    assert_matches!(
        fixture
            .open()
            .expect_err("a published file rewritten in place is refused"),
        OpenAtlasError::Corruption(IntegrityVerificationError::Checksum { file, received })
            if file.name == name
                && file.hash == files.rank_of_position.hash()
                && received != file.hash,
    );
}

/// Open refuses a generation missing a published file, under `Corruption`.
#[tokio::test]
async fn corruption_missing_file() {
    let fixture = TamperFixture::publish("open-corruption-missing").await;
    let name = fixture
        .generation
        .repository()
        .files
        .rank_of_position
        .name();

    std::fs::remove_file(fixture.path_of(&name)).expect("the published file removes");
    assert_matches!(
        fixture
            .open()
            .expect_err("a generation missing a published file is refused"),
        OpenAtlasError::Corruption(IntegrityVerificationError::Io { name: missing, error })
            if missing == name && error.kind() == std::io::ErrorKind::NotFound,
    );
}
