//! The open pass.
//!
//! Mapping a generation's serving artifacts and validating each format plus their cross-artifact
//! agreement once, so every read after it trusts its views. The pass is one linear derivation: map
//! and type each artifact, prove the artifacts agree on their shared domains, derive the serving
//! state (the schedule, the wire codec and its encoded row column, the frame extent), and construct
//! the [`Atlas`] whole - no half-initialized value exists at any point.

use std::sync::OnceLock;

use hashql_core::id::Id;

use super::{
    Atlas,
    codec::{NODE_LABEL, RowCodec},
    error::{ArrayKind, IdentityDomain, OpenAtlasError},
    grid::Grid,
    secret::WireSecret,
};
use crate::{
    dataset::postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    file::{
        array::ArrayFile,
        generation::{Generation, GenerationId, GenerationRoot, OpenError},
        identity::{Key, Row, read::IdentityFile},
        morton::read::MortonFile,
        postings::read::PostingsFile,
        quad::read::QuadFile,
        repository::RepositoryFile,
        sprs::read::SprsFile,
    },
    identity::{
        BasePosition, Column, EdgeRowId, Element, ImportanceRank, NodeRowId, OntologyRowId,
    },
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
pub(crate) struct OpenOptions {
    /// The server secret behind the wire row-id codec.
    ///
    /// The keyed permutation derives from it per generation at open.
    ///
    /// Operator contract, unenforced by any binding: the secret must not change for a generation
    /// that has ever served. Nothing fingerprints the secret, so reopening the same generation
    /// under a different value re-keys every wire id while client cache identity (authorization
    /// context, generation, route, canonical query) stays constant. A secret change therefore
    /// requires a generation rotation and application-cache invalidation.
    pub wire_secret: WireSecret,
}

/// One generation's serving artifacts, each mapped and validated against its own format.
///
/// The columns share one base order and the archives share the domains that order indexes, so a
/// value of this type holds artifacts that are individually well-formed and not yet known to agree
/// with one another. [`Artifacts::agree`] is that second proof, and the serving state derives only
/// after it holds.
#[derive(Debug)]
struct Artifacts {
    quad: QuadFile,
    morton: MortonFile,
    /// The wire-coordinate column in base order.
    points: Column<BasePosition, Vec2>,
    /// The row column in base order: the node universe's permutation.
    rows: Column<BasePosition, NodeRowId>,
    adjacency: AdjacencyArchive,
    /// The endpoint column mapping each edge row to `[source, target]`.
    endpoints: Column<EdgeRowId, [NodeRowId; 2]>,
    /// The rank column in base order.
    ranks: Column<BasePosition, ImportanceRank>,
    /// The position permutation in row order.
    positions_of_row: Column<NodeRowId, BasePosition>,
    /// The reverse rank permutation, mapping each rank to its base position.
    positions_of_rank: Column<ImportanceRank, BasePosition>,
    postings: PostingsArchive,
    /// The ontology identity table, joining type uuids to ontology rows.
    ontology_ids: IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId>,
    /// The node identity table, joining node rows to entity identities.
    node_ids: IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    /// The edge identity table, joining edge rows to link-entity identities.
    edge_ids: IdentityTableArchive<ArchivedEntityId, EdgeRowId>,
}

impl Artifacts {
    /// Maps every serving artifact of `generation` and validates each format once.
    ///
    /// # Errors
    ///
    /// Returns a per-artifact variant when an artifact fails its format's validation, and
    /// [`OpenAtlasError::Shape`] when an artifact holds the wrong element type or shape.
    fn open(generation: &Generation) -> Result<Self, OpenAtlasError> {
        let files = &generation.repository().files;

        let quad = QuadFile::open(generation.path_of(&files.quad.name))?;
        let morton = MortonFile::open(generation.path_of(&files.morton.name))?;
        let points: Column<BasePosition, Vec2> =
            open_column(generation, &files.wire_coordinates, ArrayKind::Coordinates)?;
        let rows: Column<BasePosition, NodeRowId> =
            open_column(generation, &files.row_of_position, ArrayKind::Rows)?;
        let endpoints: Column<EdgeRowId, [NodeRowId; 2]> =
            open_column(generation, &files.edge_endpoints, ArrayKind::Endpoints)?;
        let ranks: Column<BasePosition, ImportanceRank> =
            open_column(generation, &files.rank_of_position, ArrayKind::Ranks)?;
        let positions_of_row: Column<NodeRowId, BasePosition> =
            open_column(generation, &files.position_of_row, ArrayKind::Positions)?;
        let positions_of_rank: Column<ImportanceRank, BasePosition> = open_column(
            generation,
            &files.position_of_rank,
            ArrayKind::RankPositions,
        )?;
        let adjacency =
            AdjacencyArchive::new(SprsFile::open(generation.path_of(&files.adjacency.name))?)?;
        let postings = PostingsArchive::new(PostingsFile::open(
            generation.path_of(&files.postings.name),
        )?)?;
        let ontology_ids = open_identities(
            generation,
            &files.ontology_identities,
            IdentityDomain::Ontology,
        )?;
        let node_ids = open_identities(generation, &files.node_identities, IdentityDomain::Node)?;
        let edge_ids = open_identities(generation, &files.edge_identities, IdentityDomain::Edge)?;

        Ok(Self {
            quad,
            morton,
            points,
            rows,
            adjacency,
            endpoints,
            ranks,
            positions_of_row,
            positions_of_rank,
            postings,
            ontology_ids,
            node_ids,
            edge_ids,
        })
    }

    /// Checks the artifacts agree on every domain they share.
    ///
    /// The morton column's code count is the point domain, the adjacency spans the node and edge
    /// domains, and the identity tables join to both. The pass checks every shared count once, so
    /// the read paths index across artifacts without re-validating. The rank pairing gets a
    /// deterministic bounded sample of roundtrips rather than a full inversion proof, so a
    /// mispairing outside the sample stays the fit-time contract's to exclude.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAtlasError::Columns`] when the point-domain columns disagree on a count,
    /// and [`OpenAtlasError::RankInverse`] when the rank columns disagree on a sampled position.
    /// Returns [`OpenAtlasError::Nodes`], [`OpenAtlasError::Edges`],
    /// [`OpenAtlasError::Subtree`], [`OpenAtlasError::Points`], [`OpenAtlasError::Types`],
    /// [`OpenAtlasError::Identities`] or [`OpenAtlasError::EdgeIdentities`] when two artifacts
    /// disagree on a count, and [`OpenAtlasError::EdgeUniverse`] when the edge rows exceed the
    /// `u32` edge-row domain.
    fn agree(&self) -> Result<(), OpenAtlasError> {
        let codes = self.morton.count();

        if self.points.len() as u64 != codes
            || self.rows.len() as u64 != codes
            || self.ranks.len() as u64 != codes
            || self.positions_of_row.len() as u64 != codes
            || self.positions_of_rank.len() as u64 != codes
        {
            return Err(OpenAtlasError::Columns {
                codes,
                coordinates: self.points.len() as u64,
                rows: self.rows.len() as u64,
                ranks: self.ranks.len() as u64,
                positions: self.positions_of_row.len() as u64,
                rank_positions: self.positions_of_rank.len() as u64,
            });
        }

        // The rank columns invert each other by the fit pipeline's own construction, and
        // re-proving that whole contract here would fault every page of both columns at open. A
        // bounded sample of roundtrips spot-checks the pairing instead: a mispaired or shuffled
        // artifact almost surely fails a sampled roundtrip, and the spread costs a fixed number
        // of page faults. The verdict is deterministic for a given generation, and a single
        // corrupt entry outside the sample stays the fit-time contract's to exclude.
        if codes > 0 && u32::try_from(codes - 1).is_ok() {
            const SAMPLES: u64 = 64;

            let ranks = self.ranks.view();
            let positions_of_rank = self.positions_of_rank.view();
            let samples = SAMPLES.min(codes);
            for index in 0..samples {
                // Evenly spread over the domain, first and last position included.
                #[expect(
                    clippy::integer_division,
                    clippy::integer_division_remainder_used,
                    reason = "an evenly spaced sample point is the floor of its proportional \
                              position"
                )]
                let at = if samples == 1 {
                    0
                } else {
                    index * (codes - 1) / (samples - 1)
                };
                let position = BasePosition::from_u32(
                    u32::try_from(at).expect("the sampled position lies in the checked domain"),
                );

                let rank = ranks[position];
                let roundtrip = positions_of_rank.get(rank).copied();
                if roundtrip != Some(position) {
                    return Err(OpenAtlasError::RankInverse {
                        position: u64::from(position.as_u32()),
                        rank: u64::from(rank.as_u32()),
                        roundtrip: roundtrip.map(|found| u64::from(found.as_u32())),
                    });
                }
            }
        }

        if self.adjacency.rows() != codes {
            return Err(OpenAtlasError::Nodes {
                adjacency: self.adjacency.rows(),
                codes,
            });
        }

        if self.endpoints.len() as u64 != self.adjacency.edges() {
            return Err(OpenAtlasError::Edges {
                adjacency: self.adjacency.edges(),
                endpoints: self.endpoints.len() as u64,
            });
        }

        if let Some(root_node) = self.quad.nodes().first()
            && u64::from(root_node.points()) != codes
        {
            return Err(OpenAtlasError::Subtree {
                quad: u64::from(root_node.points()),
                codes,
            });
        }

        if self.postings.points() != codes {
            return Err(OpenAtlasError::Points {
                postings: self.postings.points(),
                codes,
            });
        }

        if self.ontology_ids.len() != self.postings.types() {
            return Err(OpenAtlasError::Types {
                postings: self.postings.types(),
                identities: self.ontology_ids.len(),
            });
        }

        if self.node_ids.len() != codes {
            return Err(OpenAtlasError::Identities {
                identities: self.node_ids.len(),
                codes,
            });
        }

        if self.edge_ids.len() != self.adjacency.edges() {
            return Err(OpenAtlasError::EdgeIdentities {
                identities: self.edge_ids.len(),
                edges: self.adjacency.edges(),
            });
        }

        if u32::try_from(self.adjacency.edges()).is_err() {
            return Err(OpenAtlasError::EdgeUniverse {
                edges: self.adjacency.edges(),
            });
        }

        Ok(())
    }
}

impl Atlas {
    /// Opens generation `id` from `root` and maps every serving artifact.
    ///
    /// Validates each format once.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAtlasError::Unpublished`] when the generation is not published in this root,
    /// and [`OpenAtlasError::Open`] when its identity or metadata document fails to read.
    ///
    /// Mapping the artifacts returns the open variant of the artifact that failed
    /// ([`OpenAtlasError::OpenQuad`], [`OpenAtlasError::OpenMorton`],
    /// [`OpenAtlasError::OpenArray`], [`OpenAtlasError::OpenAdjacency`],
    /// [`OpenAtlasError::OpenPostings`], [`OpenAtlasError::OpenIdentity`]), the contract variant
    /// when a mapped artifact violates its own format contract ([`OpenAtlasError::Adjacency`],
    /// [`OpenAtlasError::Postings`], [`OpenAtlasError::Identity`]), and
    /// [`OpenAtlasError::Shape`] when an artifact holds the wrong element type or shape.
    ///
    /// [`OpenAtlasError::Schedule`] follows when the recorded schedule exceeds the Morton key
    /// width, which leaves no tile grid to serve.
    ///
    /// The agreement pass over the mapped artifacts returns [`OpenAtlasError::Columns`],
    /// [`OpenAtlasError::Nodes`], [`OpenAtlasError::Edges`], [`OpenAtlasError::Subtree`],
    /// [`OpenAtlasError::Points`], [`OpenAtlasError::Types`], [`OpenAtlasError::Identities`] or
    /// [`OpenAtlasError::EdgeIdentities`] when two artifacts disagree on a count they share,
    /// [`OpenAtlasError::RankInverse`] when the rank columns disagree on a sampled position, and
    /// [`OpenAtlasError::EdgeUniverse`] when the edge rows exceed the `u32` edge-row domain.
    ///
    /// Deriving the type closure over the agreed artifacts returns [`OpenAtlasError::Closure`]
    /// when the parent graph holds a cycle.
    ///
    /// Deriving the wire codec returns [`OpenAtlasError::Universe`] when the row count exceeds the
    /// wire's `u32` id domain.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(
        root: &GenerationRoot,
        id: GenerationId,
        OpenOptions { wire_secret }: OpenOptions,
    ) -> Result<Self, OpenAtlasError> {
        let generation = root.open(id).map_err(|error| match error {
            OpenError::Unpublished(id) => OpenAtlasError::Unpublished(id),
            error @ (OpenError::Identity { .. } | OpenError::Document(_) | OpenError::Io(_)) => {
                OpenAtlasError::Open(error)
            }
        })?;

        let artifacts = Artifacts::open(&generation)?;
        let grid = Grid::new(generation.repository().metadata.reproducibility.config.lod)?;
        artifacts.agree()?;

        let Artifacts {
            quad,
            morton,
            points,
            rows,
            adjacency,
            endpoints,
            ranks,
            positions_of_row,
            positions_of_rank,
            postings,
            ontology_ids,
            node_ids,
            edge_ids,
        } = artifacts;

        // The agreement proof matched the identity rows to the postings' type domain, so every
        // displayed row seeds the icon memo in domain.
        let closure = ClosureMap::new(&postings, ontology_ids.displayed_rows())?;

        // The row column is the node universe's permutation, so its validated length is the
        // codec's `N`. Edges cross the wire as link-entity identities and need no codec.
        let universe = u32::try_from(rows.len()).map_err(|_error| OpenAtlasError::Universe {
            rows: rows.len() as u64,
        })?;
        let node_codec = RowCodec::derive(&wire_secret, id, NODE_LABEL, universe);

        // The wire column maps the validated row column once, so every position-driven gather
        // reads permuted ids for free.
        let wire_rows = rows
            .view()
            .iter()
            .map(|&row| node_codec.encode(row))
            .collect();

        let world = generation.repository().metadata.evidence.lod.world;
        let bounds = (morton.count() > 0).then(|| frame_extent(world));

        Ok(Self {
            generation,
            wire_secret,
            grid,
            quad,
            morton,
            points,
            rows,
            adjacency,
            endpoints,
            ranks,
            positions_of_row,
            positions_of_rank,
            postings,
            closure,
            ontology_ids,
            node_ids,
            edge_ids,
            node_codec,
            wire_rows,
            bounds,
            saturated: OnceLock::new(),
        })
    }
}

/// Opens one array artifact as its serving role's typed column.
///
/// Every failure names the role: the open error and the shape error alike carry `kind`.
fn open_column<I: Id, T: Element>(
    generation: &Generation,
    file: &RepositoryFile,
    kind: ArrayKind,
) -> Result<Column<I, T>, OpenAtlasError> {
    let array = ArrayFile::open(generation.path_of(&file.name))
        .map_err(|error| OpenAtlasError::OpenArray { kind, error })?;

    Column::new(array).ok_or(OpenAtlasError::Shape { kind })
}

/// Opens and validates one identity artifact, binding its failures to the domain it serves.
///
/// Every failure is loud - a key kind other than the store's included.
fn open_identities<I, R>(
    generation: &Generation,
    file: &RepositoryFile,
    domain: IdentityDomain,
) -> Result<IdentityTableArchive<I, R>, OpenAtlasError>
where
    I: Key,
    R: Row,
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
