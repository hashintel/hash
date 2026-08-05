//! Cross-artifact agreement at open: each shared-domain disagreement names its own variant.
//!
//! `Atlas::open` is the only place that checks the artifacts against each other; every read path
//! below it indexes across them without re-validating. A generation whose artifacts disagree
//! therefore gets one chance at refusal, and refusing it under the wrong name leaves an operator
//! little better off than serving it would: the variant is what an operator repairs from.

use core::assert_matches;
use std::io::Write as _;

use camino::Utf8PathBuf;
use hashql_core::id::Id as _;
use type_system::ontology::id::{OntologyTypeUuid, VersionedUrl};
use zerocopy::{IntoBytes as _, LE, U64};

use super::{
    Atlas, EDGE_SEED, OpenAtlasError, entity_id_of, fit_fixture, fixture_type_url,
    recreate_writable, rewrite_identities, store_identities, test_open_options,
};
use crate::{
    dataset::postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    file::{
        WriteInto as _,
        array::{ArrayVariant, Dim, SizedArrayWriter},
        identity::{Row, read::IdentityFile},
        postings::{read::PostingsFile, write::Regions},
        quad::{Node, TypeSets, read::QuadFile},
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
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
    rewrite_identities(path, &table);
}

/// Rewrites the ontology identity artifact with `rows` fixture type uuids.
fn shorten_ontology(path: &Utf8PathBuf, rows: u64) {
    let mut table = IdentityTable::<OntologyRowId, ArchivedOntologyTypeUuid>::new();
    for row in 0..rows {
        let url: VersionedUrl = fixture_type_url(row)
            .parse()
            .expect("the fixture URL parses");
        table.push(ArchivedOntologyTypeUuid::from(
            OntologyTypeUuid::from_url(&url).into_uuid(),
        ));
    }
    rewrite_identities(path, &table);
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
/// Every other region is the published one. Only the membership lists read the header's point
/// domain back. Widening it loosens the bound every list position must clear, and the dense-run
/// rules key off the domain's word count, which one extra point moves only across a multiple of 32.
/// The postings contract would refuse a fixture that widened across that boundary under its own
/// name, which the caller's variant assertion reports rather than absorbs.
fn retarget_postings_points(path: &Utf8PathBuf, points: u64) {
    // The mapping ends before the rewrite: the file backs the slices read here. The writer
    // speaks native build words, so the copies decode the mapped little-endian regions.
    let (flags, membership_posts, entries, parent_posts, parent_ids) = {
        let postings = PostingsFile::open(path).expect("the published postings artifact opens");
        (
            postings
                .flags()
                .iter()
                .map(|word| word.get())
                .collect::<Vec<_>>(),
            postings
                .membership_posts()
                .iter()
                .map(|post| post.get())
                .collect::<Vec<_>>(),
            postings
                .entries()
                .iter()
                .map(|entry| entry.get())
                .collect::<Vec<_>>(),
            postings
                .parent_posts()
                .iter()
                .map(|post| post.get())
                .collect::<Vec<_>>(),
            postings
                .parent_ids()
                .iter()
                .map(|id| id.get())
                .collect::<Vec<_>>(),
        )
    };

    let file = recreate_writable(path);
    let mut file = std::io::BufWriter::new(file);
    crate::file::postings::write::write_regions(
        Regions {
            points,
            flags: &flags,
            membership_posts: &membership_posts,
            entries: &entries,
            parent_posts: &parent_posts,
            parent_ids: &parent_ids,
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

/// Every artifact disagreement `open` checks answers with its own variant, and repair restores it.
///
/// The tampers all run against a single published generation, changing one artifact at a time. Each
/// tamper moves a single domain by one row and leaves that artifact valid at its own format, so the
/// only thing that moved is the domain under test. The reopen after each repair is the negative
/// control. The fixture opens again every time, so each rejection belongs to its own tamper rather
/// than to a fixture that had stopped opening unnoticed.
///
/// The artifact structure forces which direction a tamper moves a domain. Dropping a node row from
/// the adjacency would drop that node's edge slots with it and move the edge domain in the same
/// tamper; narrowing the postings' point domain can strand a membership position outside it, which
/// the postings contract refuses first and under its own name. Both therefore add a row, and
/// widening is as much a producer bug as truncation is.
///
/// Both universe variants are absent and cannot be present: `Universe` and `EdgeUniverse` fire
/// above `u32::MAX` rows, which no fixture constructs. They guard arithmetic the fixture cannot
/// reach, so no tamper can exercise them. Every other variant of the cross-artifact pass has its
/// tamper here.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn every_cross_artifact_disagreement_names_its_own_variant() {
    let (root, generation) = fit_fixture("open-consistency").await;
    store_identities(&generation);

    let open = || Atlas::open(&root, generation.id(), test_open_options());
    let files = &generation.repository().files;

    // As a control, the untampered fixture opens, so every rejection
    // below is its tamper's.
    let atlas = open().expect("the published fixture opens");
    let nodes = atlas.row_ids().len() as u64;
    let endpoints = atlas.endpoint_pairs().as_raw().to_vec();
    let edges = endpoints.len() as u64;
    drop(atlas);

    let types = IdentityFile::open(generation.path_of(&files.ontology_identities.name))
        .expect("the published ontology identities open")
        .rows();

    // The node identity table against the code column.
    let node_identities = Saved::of(generation.path_of(&files.node_identities.name));
    shorten_entities::<NodeRowId>(&node_identities.path, nodes - 1, 0);
    assert_matches!(
        open().expect_err("a short node identity table is refused"),
        OpenAtlasError::Identities { identities, codes }
            if identities == nodes - 1 && codes == nodes,
    );
    node_identities.restore();
    open().expect("the repaired fixture opens");

    // The edge identity table against the adjacency's edge domain.
    let edge_identities = Saved::of(generation.path_of(&files.edge_identities.name));
    shorten_entities::<EdgeRowId>(&edge_identities.path, edges - 1, EDGE_SEED);
    assert_matches!(
        open().expect_err("a short edge identity table is refused"),
        OpenAtlasError::EdgeIdentities { identities, edges: spanned }
            if identities == edges - 1 && spanned == edges,
    );
    edge_identities.restore();
    open().expect("the repaired fixture opens");

    // The ontology identity table against the postings' type domain.
    let ontology_identities = Saved::of(generation.path_of(&files.ontology_identities.name));
    shorten_ontology(&ontology_identities.path, types - 1);
    assert_matches!(
        open().expect_err("a short ontology identity table is refused"),
        OpenAtlasError::Types { postings, identities }
            if postings == types && identities == types - 1,
    );
    ontology_identities.restore();
    open().expect("the repaired fixture opens");

    // A base-order column against the code column.
    let ranks = Saved::of(generation.path_of(&files.rank_of_position.name));
    shorten_u32_column(&ranks.path, nodes - 1);
    assert_matches!(
        open().expect_err("a short rank column is refused"),
        OpenAtlasError::Columns { codes, coordinates, rows, ranks: ranked, positions }
            if codes == nodes
                && coordinates == nodes
                && rows == nodes
                && ranked == nodes - 1
                && positions == nodes,
    );
    ranks.restore();
    open().expect("the repaired fixture opens");

    // The adjacency's node domain against the code column.
    let adjacency = Saved::of(generation.path_of(&files.adjacency.name));
    respan_adjacency(
        &adjacency.path,
        usize::try_from(nodes + 1).expect("fixture node counts fit usize"),
        &endpoints,
    );
    assert_matches!(
        open().expect_err("an adjacency spanning an extra node row is refused"),
        OpenAtlasError::Nodes { adjacency: spanned, codes }
            if spanned == nodes + 1 && codes == nodes,
    );
    adjacency.restore();
    open().expect("the repaired fixture opens");

    // The endpoint column against the adjacency's edge domain.
    let endpoint_column = Saved::of(generation.path_of(&files.edge_endpoints.name));
    shorten_endpoints(&endpoint_column.path, &endpoints[..endpoints.len() - 1]);
    assert_matches!(
        open().expect_err("a short endpoint column is refused"),
        OpenAtlasError::Edges { adjacency: spanned, endpoints: paired }
            if spanned == edges && paired == edges - 1,
    );
    endpoint_column.restore();
    open().expect("the repaired fixture opens");

    // The quadtree root's subtree count against the code column.
    let quad = Saved::of(generation.path_of(&files.quad.name));
    retarget_quad_root(
        &quad.path,
        u32::try_from(nodes - 1).expect("fixture point counts fit u32"),
    );
    assert_matches!(
        open().expect_err("a root subtree count below the point count is refused"),
        OpenAtlasError::Subtree { quad: counted, codes }
            if counted == nodes - 1 && codes == nodes,
    );
    quad.restore();
    open().expect("the repaired fixture opens");

    // The postings' point domain against the code column.
    let postings = Saved::of(generation.path_of(&files.postings.name));
    retarget_postings_points(&postings.path, nodes + 1);
    assert_matches!(
        open().expect_err("a postings point domain above the point count is refused"),
        OpenAtlasError::Points { postings: spanned, codes }
            if spanned == nodes + 1 && codes == nodes,
    );
    postings.restore();
    open().expect("the repaired fixture opens");
}
