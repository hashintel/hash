use core::{error::Error, fmt};

use crate::{
    file::{
        adjacency::read::OpenAdjacencyError,
        array::OpenArrayError,
        generation::{GenerationId, OpenError},
        morton::read::OpenMortonError,
        quad::read::OpenQuadError,
    },
    morton::Depth,
    salt::adjacency::InvalidAdjacencyFile,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ArrayKind {
    Coordinates,
    Rows,
    Endpoints,
    Ranks,
    Positions,
}

impl fmt::Display for ArrayKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Coordinates => write!(formatter, "coordinates"),
            Self::Rows => write!(formatter, "rows"),
            Self::Endpoints => write!(formatter, "endpoints"),
            Self::Ranks => write!(formatter, "ranks"),
            Self::Positions => write!(formatter, "positions"),
        }
    }
}

/// Opening a generation's serving surface failed.
#[derive(Debug)]
pub enum OpenAtlasError {
    /// The generation is not published in this root.
    Unpublished(GenerationId),
    Open(OpenError),
    OpenQuad(OpenQuadError),
    OpenMorton(OpenMortonError),
    OpenArray {
        kind: ArrayKind,
        error: OpenArrayError,
    },
    OpenAdjacency(OpenAdjacencyError),
    /// The adjacency file violates the incident-list contract.
    Adjacency(InvalidAdjacencyFile),
    /// The recorded schedule exceeds the Morton key width, so no tile
    /// grid exists to serve.
    Schedule {
        /// The recorded cells-per-tile-axis exponent.
        span_log2: u8,
        /// The recorded deepest tile zoom.
        max_tile_depth: u8,
    },
    /// An artifact's element type or shape is not the serving
    /// contract's.
    Shape {
        /// The artifact's repository role.
        kind: ArrayKind,
    },
    /// The base-order columns disagree on the point count.
    Columns {
        /// Codes in the morton column.
        codes: u64,
        /// Points in the wire-coordinate column.
        coordinates: u64,
        /// Entries in the row column.
        rows: u64,
        /// Entries in the rank column.
        ranks: u64,
        /// Entries in the position permutation.
        positions: u64,
    },
    /// The adjacency's node domain contradicts the code column.
    Nodes {
        /// Node rows the adjacency spans.
        adjacency: u64,
        /// Codes in the morton column.
        codes: u64,
    },
    /// The adjacency's edge domain contradicts the endpoint column.
    Edges {
        /// Edge rows the adjacency spans.
        adjacency: u64,
        /// Pairs in the endpoint column.
        endpoints: u64,
    },
    /// The quadtree root's subtree count contradicts the code column.
    Subtree {
        /// The root node's subtree point count.
        quad: u64,
        /// Codes in the morton column.
        codes: u64,
    },
}

impl From<OpenError> for OpenAtlasError {
    fn from(error: OpenError) -> Self {
        Self::Open(error)
    }
}

impl From<OpenAdjacencyError> for OpenAtlasError {
    fn from(error: OpenAdjacencyError) -> Self {
        Self::OpenAdjacency(error)
    }
}

impl From<InvalidAdjacencyFile> for OpenAtlasError {
    fn from(error: InvalidAdjacencyFile) -> Self {
        Self::Adjacency(error)
    }
}

impl From<OpenMortonError> for OpenAtlasError {
    fn from(error: OpenMortonError) -> Self {
        Self::OpenMorton(error)
    }
}

impl From<OpenQuadError> for OpenAtlasError {
    fn from(error: OpenQuadError) -> Self {
        Self::OpenQuad(error)
    }
}

impl fmt::Display for OpenAtlasError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unpublished(id) => {
                write!(formatter, "generation {id} is not published in this root")
            }
            Self::Open(error) => {
                write!(formatter, "the artifact failed to open: {error}")
            }
            Self::OpenMorton(morton) => {
                write!(formatter, "the morton artifact failed to open: {morton}")
            }
            Self::OpenQuad(quad) => {
                write!(formatter, "the quad artifact failed to open: {quad}")
            }
            Self::OpenArray { kind, error } => {
                write!(formatter, "the {kind} artifact failed to open: {error}")
            }
            Self::OpenAdjacency(adjacency) => {
                write!(
                    formatter,
                    "the adjacency artifact failed to open: {adjacency}"
                )
            }
            Self::Adjacency(invalid) => {
                write!(
                    formatter,
                    "the adjacency artifact violates the incident-list contract: {invalid}"
                )
            }
            Self::Schedule {
                span_log2,
                max_tile_depth,
            } => write!(
                formatter,
                "the recorded schedule needs {max_tile_depth} + {span_log2} subdivisions where a \
                 64-bit Morton key resolves {}",
                Depth::MAX.get(),
            ),
            Self::Shape { kind } => write!(
                formatter,
                "the {kind} artifact does not hold the serving contract's shape",
            ),
            Self::Columns {
                codes,
                coordinates,
                rows,
                ranks,
                positions,
            } => write!(
                formatter,
                "the base-order columns disagree on the point count: {codes} codes, {coordinates} \
                 coordinates, {rows} rows, {ranks} ranks, {positions} positions",
            ),
            Self::Nodes { adjacency, codes } => write!(
                formatter,
                "the adjacency spans {adjacency} node rows where the code column holds {codes}",
            ),
            Self::Edges {
                adjacency,
                endpoints,
            } => write!(
                formatter,
                "the adjacency spans {adjacency} edge rows where the endpoint column holds \
                 {endpoints}",
            ),
            Self::Subtree { quad, codes } => write!(
                formatter,
                "the quadtree root counts {quad} points where the code column holds {codes}",
            ),
        }
    }
}

impl Error for OpenAtlasError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Open(error) => Some(error),
            Self::OpenMorton(morton) => Some(morton),
            Self::OpenQuad(quad) => Some(quad),
            Self::OpenArray { kind: _, error } => Some(error),
            Self::OpenAdjacency(adjacency) => Some(adjacency),
            Self::Adjacency(invalid) => Some(invalid),
            Self::Unpublished(_)
            | Self::Schedule { .. }
            | Self::Shape { .. }
            | Self::Columns { .. }
            | Self::Nodes { .. }
            | Self::Edges { .. }
            | Self::Subtree { .. } => None,
        }
    }
}
