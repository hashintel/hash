//! The open pass.
//!
//! Mapping a generation's serving artifacts and validating each format plus their cross-artifact
//! agreement once, so every read after it trusts its views. The pass is one linear derivation:
//! map and type each artifact, prove the artifacts agree on their shared domains, derive the
//! serving state (the schedule, the wire codec and its encoded row column, the frame extent), and
//! construct the [`Atlas`] whole - no partially initialized value exists at any point.

use hashql_core::id::Id;

use super::{
    Atlas,
    codec::{NODE_LABEL, RowCodec},
    error::{ArrayKind, IdentityDomain, OpenAtlasError},
    grid::Grid,
    secret::WireSecret,
};
use crate::{
    file::{
        array::ArrayFile,
        generation::{Generation, GenerationId, GenerationRoot, OpenError},
        identity::read::IdentityFile,
        morton::read::MortonFile,
        postings::read::PostingsFile,
        quad::read::QuadFile,
        region::ByteStable,
        repository::RepositoryFile,
        sprs::read::SprsFile,
    },
    identity::{Column, Element, NodeRowId},
    math::{Bounds2, Vec2},
    salt::{
        adjacency::AdjacencyArchive,
        fit::prepare::identity::IdentityTableArchive,
        postings::{artifact::PostingsArchive, closure::ClosureMap},
    },
};

/// The options one serving open takes.
///
/// Configuration travels as a struct, never constants or bare parameters. The struct has no
/// default: every open names its secret explicitly, so no deployment can serve under key material
/// it never configured.
#[derive(Debug, Clone)]
pub struct OpenOptions {
    /// The server secret behind the wire row-id codec.
    ///
    /// The keyed permutation derives from it per generation at open.
    ///
    /// Operator contract, unenforced by any binding: the secret must not change for a generation
    /// that has ever served. Nothing fingerprints the secret, so reopening the same generation
    /// under a different value silently re-keys every wire id while client cache identity
    /// (authorization context, generation, route, canonical query) stays constant. A secret
    /// change therefore requires a generation rotation and application-cache invalidation.
    pub wire_secret: WireSecret,
}

impl Atlas {
    /// Opens generation `id` from `root` and maps every serving artifact.
    ///
    /// Validates each format once.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAtlasError::Unpublished`] when the generation is not published in this root,
    /// a per-artifact variant when the metadata document or an artifact fails its format's
    /// validation, [`OpenAtlasError::Schedule`] when the recorded schedule exceeds the key width,
    /// [`OpenAtlasError::Shape`] when an artifact holds the wrong element type or shape,
    /// [`OpenAtlasError::Universe`] when the row count exceeds the wire's `u32` id domain, and
    /// [`OpenAtlasError::Columns`] or [`OpenAtlasError::Subtree`] when the artifacts disagree on
    /// the point count.
    #[tracing::instrument(skip_all)]
    #[expect(
        clippy::too_many_lines,
        reason = "one linear pass: map, validate, derive, construct"
    )]
    pub fn open(
        root: &GenerationRoot,
        id: GenerationId,
        options: &OpenOptions,
    ) -> Result<Self, OpenAtlasError> {
        let generation = root.open(id).map_err(|error| match error {
            OpenError::Unpublished(id) => OpenAtlasError::Unpublished(id),
            error @ (OpenError::Identity { .. } | OpenError::Document(_) | OpenError::Io(_)) => {
                OpenAtlasError::Open(error)
            }
        })?;

        let files = &generation.repository().files;

        let quad = QuadFile::open(generation.path_of(&files.quad.name))?;
        let morton = MortonFile::open(generation.path_of(&files.morton.name))?;
        let points: Column<Vec2> =
            open_column(&generation, &files.wire_coordinates, ArrayKind::Coordinates)?;
        let rows: Column<u32> = open_column(&generation, &files.row_of_position, ArrayKind::Rows)?;
        let endpoints: Column<[NodeRowId; 2]> =
            open_column(&generation, &files.edge_endpoints, ArrayKind::Endpoints)?;
        let ranks: Column<u32> =
            open_column(&generation, &files.rank_of_position, ArrayKind::Ranks)?;
        let positions_of_row: Column<u32> =
            open_column(&generation, &files.position_of_row, ArrayKind::Positions)?;
        let adjacency =
            AdjacencyArchive::new(SprsFile::open(generation.path_of(&files.adjacency.name))?)?;
        let postings = PostingsArchive::new(PostingsFile::open(
            generation.path_of(&files.postings.name),
        )?)?;
        let closure = ClosureMap::new(&postings)?;
        let ontology_ids = open_identities(
            &generation,
            &files.ontology_identities,
            IdentityDomain::Ontology,
        )?;
        let node_ids = open_identities(&generation, &files.node_identities, IdentityDomain::Node)?;
        let edge_ids = open_identities(&generation, &files.edge_identities, IdentityDomain::Edge)?;

        let grid = Grid::new(generation.repository().metadata.reproducibility.config.lod)?;

        // Cross-artifact agreement: every shared domain is checked here, so the read paths index
        // across artifacts without re-validating.
        let codes = morton.count();
        if points.len() as u64 != codes
            || rows.len() as u64 != codes
            || ranks.len() as u64 != codes
            || positions_of_row.len() as u64 != codes
        {
            return Err(OpenAtlasError::Columns {
                codes,
                coordinates: points.len() as u64,
                rows: rows.len() as u64,
                ranks: ranks.len() as u64,
                positions: positions_of_row.len() as u64,
            });
        }
        if adjacency.rows() != codes {
            return Err(OpenAtlasError::Nodes {
                adjacency: adjacency.rows(),
                codes,
            });
        }
        if endpoints.len() as u64 != adjacency.edges() {
            return Err(OpenAtlasError::Edges {
                adjacency: adjacency.edges(),
                endpoints: endpoints.len() as u64,
            });
        }
        if let Some(root_node) = quad.nodes().first()
            && u64::from(root_node.points()) != codes
        {
            return Err(OpenAtlasError::Subtree {
                quad: u64::from(root_node.points()),
                codes,
            });
        }
        if postings.points() != codes {
            return Err(OpenAtlasError::Points {
                postings: postings.points(),
                codes,
            });
        }
        if ontology_ids.len() != postings.types() {
            return Err(OpenAtlasError::Types {
                postings: postings.types(),
                identities: ontology_ids.len(),
            });
        }
        if node_ids.len() != codes {
            return Err(OpenAtlasError::Identities {
                identities: node_ids.len(),
                codes,
            });
        }
        if edge_ids.len() != adjacency.edges() {
            return Err(OpenAtlasError::EdgeIdentities {
                identities: edge_ids.len(),
                edges: adjacency.edges(),
            });
        }
        if u32::try_from(adjacency.edges()).is_err() {
            return Err(OpenAtlasError::EdgeUniverse {
                edges: adjacency.edges(),
            });
        }

        // The row column is the node universe's permutation, so its validated length is the
        // codec's `N`. Edges cross the wire as link-entity identities and need no codec.
        let universe = u32::try_from(rows.len()).map_err(|_error| OpenAtlasError::Universe {
            rows: rows.len() as u64,
        })?;
        let node_codec = RowCodec::derive(&options.wire_secret, id, NODE_LABEL, universe);

        // The wire column maps the validated row column once, so every position-driven gather
        // reads permuted ids for free.
        let wire_rows = rows
            .view()
            .iter()
            .map(|&row| node_codec.encode(NodeRowId::from_u32(row)))
            .collect();

        let world = generation.repository().metadata.evidence.lod.world;
        let bounds = (codes > 0).then(|| frame_extent(world));

        Ok(Self {
            generation,
            wire_secret: options.wire_secret.clone(), /* NOTE: why don't you just take ownership
                                                       * of Option if you need to clone? */
            grid,
            quad,
            morton,
            points,
            rows,
            adjacency,
            endpoints,
            ranks,
            positions_of_row,
            postings,
            closure,
            ontology_ids,
            node_ids,
            edge_ids,
            node_codec,
            wire_rows,
            bounds,
        })
    }
}

/// Opens one array artifact as its serving role's typed column.
///
/// Every failure names the role: the open error and the shape error alike carry `kind`.
fn open_column<T: Element>(
    generation: &Generation,
    file: &RepositoryFile,
    kind: ArrayKind,
) -> Result<Column<T>, OpenAtlasError> {
    let array = ArrayFile::open(generation.path_of(&file.name))
        .map_err(|error| OpenAtlasError::OpenArray { kind, error })?;

    Column::new(array).ok_or(OpenAtlasError::Shape { kind })
}

/// Opens and validates one identity artifact, binding its failures to the domain it serves.
///
/// Every failure is loud - a key width other than the store's included.
fn open_identities<I, R>(
    generation: &Generation,
    file: &RepositoryFile,
    domain: IdentityDomain,
) -> Result<IdentityTableArchive<I, R>, OpenAtlasError>
where
    I: ByteStable,
    R: Id,
{
    let identities = IdentityFile::open(generation.path_of(&file.name))
        .map_err(|error| OpenAtlasError::OpenIdentity { domain, error })?;
    IdentityTableArchive::new(identities)
        .map_err(|error| OpenAtlasError::Identity { domain, error })
}

/// Derives the tight wire-frame extent of the full point set from the world frame.
///
/// Normalization maps each axis's world minimum and maximum onto the frame edges - values real
/// points attain - and collapses a zero-extent axis to the frame centre, so the extent is exact
/// without scanning the coordinate column.
fn frame_extent(world: Bounds2) -> Bounds2 {
    #[expect(
        clippy::float_cmp,
        reason = "a zero-extent axis collapses to the centre by exact equality: the normalization \
                  contract, not a tolerance check"
    )]
    let axis = |minimum: f32, maximum: f32| {
        if minimum == maximum {
            (0.0, 0.0)
        } else {
            (-1.0, 1.0)
        }
    };

    let (min_x, max_x) = axis(world.min().x(), world.max().x());
    let (min_y, max_y) = axis(world.min().y(), world.max().y());

    Bounds2::new(Vec2::new(min_x, min_y), Vec2::new(max_x, max_y))
        .expect("the frame extent corners are finite and ordered")
}
