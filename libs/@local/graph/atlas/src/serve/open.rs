//! The open pass: mapping a generation's serving artifacts and
//! validating each format plus their cross-artifact agreement once,
//! so every read after it trusts its views.

use super::{
    Atlas,
    error::{ArrayKind, IdentityDomain, OpenAtlasError},
};
use crate::{
    file::{
        array::ArrayFile,
        generation::{Generation, GenerationId, GenerationRoot, OpenError},
        identity::read::IdentityFile,
        morton::read::MortonFile,
        postings::read::PostingsFile,
        quad::read::QuadFile,
        repository::RepositoryFile,
        sprs::read::SprsFile,
    },
    math::{Bounds2, Vec2},
    salt::{
        adjacency::MappedAdjacency,
        fit::prepare::identity::MappedIdentityTable,
        postings::{closure::ClosureMap, mapped::MappedPostings},
    },
};

impl Atlas {
    /// Opens generation `id` from `root` and maps every serving
    /// artifact, validating each format once.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAtlasError::Unpublished`] when the generation is
    /// not published in this root, [`OpenAtlasError::Artifact`] when
    /// the metadata document or an artifact fails its format's
    /// validation, [`OpenAtlasError::Schedule`] when the recorded
    /// schedule exceeds the key width, [`OpenAtlasError::Shape`] when
    /// an artifact holds the wrong element type or shape, and
    /// [`OpenAtlasError::Columns`] or [`OpenAtlasError::Subtree`] when
    /// the artifacts disagree on the point count.
    #[tracing::instrument(skip_all)]
    pub fn open(root: &GenerationRoot, id: GenerationId) -> Result<Self, OpenAtlasError> {
        let generation = root.open(id).map_err(|error| match error {
            OpenError::Unpublished(id) => OpenAtlasError::Unpublished(id),
            error @ (OpenError::Identity { .. } | OpenError::Document(_) | OpenError::Io(_)) => {
                OpenAtlasError::Open(error)
            }
        })?;

        let files = &generation.repository().files;

        let quad = QuadFile::open(generation.path_of(&files.quad.name))?;
        let morton = MortonFile::open(generation.path_of(&files.morton.name))?;
        let coordinates = open_array(&generation, &files.wire_coordinates, ArrayKind::Coordinates)?;
        let rows = open_array(&generation, &files.row_of_position, ArrayKind::Rows)?;
        let endpoints = open_array(&generation, &files.edge_endpoints, ArrayKind::Endpoints)?;
        let rank_of_position = open_array(&generation, &files.rank_of_position, ArrayKind::Ranks)?;
        let position_of_row =
            open_array(&generation, &files.position_of_row, ArrayKind::Positions)?;
        let adjacency =
            MappedAdjacency::new(SprsFile::open(generation.path_of(&files.adjacency.name))?)?;
        let postings = MappedPostings::new(PostingsFile::open(
            generation.path_of(&files.postings.name),
        )?)?;
        let closure = ClosureMap::new(&postings)?;
        // Identity tables fail loud, key width included: a
        // generation whose ids are not store identities does not
        // serve (ruling 2026-07-20, reversing the foreign-width
        // degradation this open briefly carried).
        let ontology_ids = open_identities(
            &generation,
            &files.ontology_identities,
            IdentityDomain::Ontology,
        )?;
        let node_ids = open_identities(&generation, &files.node_identities, IdentityDomain::Node)?;
        let edge_ids = open_identities(&generation, &files.edge_identities, IdentityDomain::Edge)?;

        let lod = generation.repository().metadata.reproducibility.config.lod;
        if lod.deepest().is_none() {
            return Err(OpenAtlasError::Schedule {
                span_log2: lod.span_log2,
                max_tile_depth: lod.max_tile_depth,
            });
        }

        let world = generation.repository().metadata.evidence.lod.world;
        let bounds = (morton.count() > 0).then(|| frame_extent(world));

        let this = Self {
            generation,
            lod,
            quad,
            morton,
            coordinates,
            rows,
            adjacency,
            endpoints,
            rank_of_position,
            position_of_row,
            postings,
            closure,
            ontology_ids,
            node_ids,
            edge_ids,
            bounds,
        };

        this.validate()?;

        Ok(this)
    }

    fn validate(&self) -> Result<(), OpenAtlasError> {
        let points = self.coordinates.points().ok_or(OpenAtlasError::Shape {
            kind: ArrayKind::Coordinates,
        })?;
        let row_ids = self.rows.u32_elements().ok_or(OpenAtlasError::Shape {
            kind: ArrayKind::Rows,
        })?;
        let endpoint_pairs = self.endpoints.u64_pairs().ok_or(OpenAtlasError::Shape {
            kind: ArrayKind::Endpoints,
        })?;
        let ranks = self
            .rank_of_position
            .u32_elements()
            .ok_or(OpenAtlasError::Shape {
                kind: ArrayKind::Ranks,
            })?;
        let positions = self
            .position_of_row
            .u32_elements()
            .ok_or(OpenAtlasError::Shape {
                kind: ArrayKind::Positions,
            })?;

        let codes = self.morton.count();
        if points.len() as u64 != codes
            || row_ids.len() as u64 != codes
            || ranks.len() as u64 != codes
            || positions.len() as u64 != codes
        {
            return Err(OpenAtlasError::Columns {
                codes,
                coordinates: points.len() as u64,
                rows: row_ids.len() as u64,
                ranks: ranks.len() as u64,
                positions: positions.len() as u64,
            });
        }

        if self.adjacency.rows() != codes {
            return Err(OpenAtlasError::Nodes {
                adjacency: self.adjacency.rows(),
                codes,
            });
        }

        if endpoint_pairs.len() as u64 != self.adjacency.edges() {
            return Err(OpenAtlasError::Edges {
                adjacency: self.adjacency.edges(),
                endpoints: endpoint_pairs.len() as u64,
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

        Ok(())
    }
}

/// Opens and validates one identity artifact, binding its failures
/// to the domain it serves. Every failure is loud - a key width
/// other than the store's included.
fn open_identities<I>(
    generation: &Generation,
    file: &RepositoryFile,
    domain: IdentityDomain,
) -> Result<MappedIdentityTable<I>, OpenAtlasError>
where
    I: Copy
        + zerocopy::IntoBytes
        + zerocopy::FromBytes
        + zerocopy::Immutable
        + zerocopy::Unaligned
        + zerocopy::KnownLayout,
{
    let identities = IdentityFile::open(generation.path_of(&file.name))
        .map_err(|error| OpenAtlasError::OpenIdentity { domain, error })?;
    MappedIdentityTable::new(identities).map_err(|error| OpenAtlasError::Identity { domain, error })
}

/// Opens one array artifact, binding its open error to the role it
/// serves.
fn open_array(
    generation: &Generation,
    file: &RepositoryFile,
    kind: ArrayKind,
) -> Result<ArrayFile, OpenAtlasError> {
    ArrayFile::open(generation.path_of(&file.name))
        .map_err(|error| OpenAtlasError::OpenArray { kind, error })
}

/// Derives the tight wire-frame extent of the full point set from the
/// world frame.
///
/// Normalization maps each axis's world minimum and maximum onto the
/// frame edges - values real points attain - and collapses a
/// zero-extent axis to the frame centre, so the extent is exact
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
