use core::{error::Error, fmt};

use crate::{
    file::{
        array::OpenArrayError,
        generation::{GenerationId, OpenError},
        identity::read::OpenIdentityError,
        morton::read::OpenMortonError,
        postings::read::OpenPostingsError,
        quad::read::OpenQuadError,
        repository::IntegrityVerificationError,
        sprs::read::OpenSprsError,
    },
    identity::{BasePosition, ImportanceRank, NodeRowId},
    morton::Depth,
    salt::{
        adjacency::InvalidAdjacencyFile,
        fit::prepare::identity::InvalidIdentityFile,
        postings::{artifact::InvalidPostingsFile, closure::ParentCycle},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ArrayKind {
    Coordinates,
    Rows,
    Endpoints,
    Ranks,
    Positions,
    RankPositions,
}

impl fmt::Display for ArrayKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Coordinates => write!(fmt, "coordinates"),
            Self::Rows => write!(fmt, "rows"),
            Self::Endpoints => write!(fmt, "endpoints"),
            Self::Ranks => write!(fmt, "ranks"),
            Self::Positions => write!(fmt, "positions"),
            Self::RankPositions => write!(fmt, "rank positions"),
        }
    }
}

/// The identity domain an identity artifact serves, for error reporting.
///
/// The identity artifacts share one file format. A failure therefore names which table it hit.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum IdentityDomain {
    /// The ontology identity table, joining type rows to type uuids.
    Ontology,
    /// The node identity table, joining node rows to entity ids.
    Node,
    /// The edge identity table, joining edge rows to link-entity ids.
    Edge,
}

impl fmt::Display for IdentityDomain {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::Ontology => "ontology",
            Self::Node => "node",
            Self::Edge => "edge",
        })
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
    OpenAdjacency(OpenSprsError),
    /// The adjacency file violates the incident-list contract.
    Adjacency(InvalidAdjacencyFile),
    OpenPostings(OpenPostingsError),
    /// The postings file violates the artifact contract.
    Postings(InvalidPostingsFile),
    /// The postings parent graph holds a cycle.
    ///
    /// A cycle leaves no closure map to expand colouring requests.
    Closure(ParentCycle),
    /// An identity file failed to open.
    OpenIdentity {
        /// The identity domain the file serves.
        domain: IdentityDomain,
        /// The failure.
        error: OpenIdentityError,
    },
    /// Verifying a published file against the digest the metadata document records failed.
    ///
    /// The error names the file and, for a mismatch, both digests.
    Corruption(IntegrityVerificationError),
    /// An identity file violates the table contract.
    ///
    /// A key width other than the store's fails the open outright. A generation whose ids are not
    /// store identities does not serve.
    Identity {
        /// The identity domain the file serves.
        domain: IdentityDomain,
        /// The violation.
        error: InvalidIdentityFile,
    },
    /// The recorded schedule needs more subdivisions than a 64-bit Morton key resolves.
    Schedule {
        /// The recorded cells-per-tile-axis exponent.
        span_log2: u8,
        /// The recorded deepest tile zoom.
        max_tile_depth: u8,
    },
    /// An artifact's element type or shape is not the serving contract's.
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
        /// Entries in the reverse rank permutation.
        rank_positions: u64,
    },
    /// The rank columns disagree on a sampled position.
    ///
    /// The rank column and its reverse invert each other, a contract the fit pipeline proves
    /// when it constructs the generation. A file's recorded digest proves its bytes are the ones
    /// the fit published and says nothing about whether two files agree with each other. Open
    /// therefore roundtrips a bounded sample of positions through both columns and refuses a fit
    /// that published a non-inverse pair.
    RankInverse {
        /// The sampled base position whose roundtrip failed.
        position: BasePosition,
        /// The position's recorded rank.
        rank: ImportanceRank,
        /// The position the reverse column holds at that rank, absent when the rank lies
        /// outside the domain.
        roundtrip: Option<BasePosition>,
    },
    /// The row columns disagree on a sampled position.
    ///
    /// The position column and its reverse invert each other, the same contract the rank columns
    /// carry, and open spot-checks both pairs at the same sampled positions.
    RowInverse {
        /// The sampled base position whose roundtrip failed.
        position: BasePosition,
        /// The node row the position column holds at that position.
        node: NodeRowId,
        /// The position the reverse column holds for that node, absent when the node lies
        /// outside the reverse column's domain.
        roundtrip: Option<BasePosition>,
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
    /// The postings' point domain contradicts the code column.
    Points {
        /// Points the postings span.
        postings: u64,
        /// Codes in the morton column.
        codes: u64,
    },
    /// The postings' type domain contradicts the ontology identities.
    Types {
        /// Types the postings span.
        postings: u64,
        /// Rows in the ontology identity table.
        identities: u64,
    },
    /// The node identity table contradicts the code column.
    Identities {
        /// Rows in the node identity table.
        identities: u64,
        /// Codes in the morton column.
        codes: u64,
    },
    /// The edge identity table contradicts the adjacency's edge domain.
    EdgeIdentities {
        /// Rows in the edge identity table.
        identities: u64,
        /// Edge rows the adjacency spans.
        edges: u64,
    },
    /// The row universe exceeds the wire's `u32` id domain.
    Universe {
        /// Entries in the row column.
        rows: u64,
    },
    /// The edge universe exceeds the `u32` edge-row domain.
    EdgeUniverse {
        /// Edge rows the adjacency spans.
        edges: u64,
    },
}

impl From<IntegrityVerificationError> for OpenAtlasError {
    fn from(error: IntegrityVerificationError) -> Self {
        Self::Corruption(error)
    }
}

impl From<OpenError> for OpenAtlasError {
    fn from(error: OpenError) -> Self {
        Self::Open(error)
    }
}

impl From<OpenSprsError> for OpenAtlasError {
    fn from(error: OpenSprsError) -> Self {
        Self::OpenAdjacency(error)
    }
}

impl From<InvalidAdjacencyFile> for OpenAtlasError {
    fn from(error: InvalidAdjacencyFile) -> Self {
        Self::Adjacency(error)
    }
}

impl From<OpenPostingsError> for OpenAtlasError {
    fn from(error: OpenPostingsError) -> Self {
        Self::OpenPostings(error)
    }
}

impl From<InvalidPostingsFile> for OpenAtlasError {
    fn from(error: InvalidPostingsFile) -> Self {
        Self::Postings(error)
    }
}

impl From<ParentCycle> for OpenAtlasError {
    fn from(error: ParentCycle) -> Self {
        Self::Closure(error)
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
    #[expect(
        clippy::too_many_lines,
        reason = "one display arm per open refusal; the taxonomy is the length"
    )]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unpublished(id) => {
                write!(fmt, "generation {id} is not published in this root")
            }
            Self::Open(error) => write!(fmt, "the artifact failed to open: {error}"),
            Self::OpenMorton(error) => write!(fmt, "the morton artifact failed to open: {error}"),
            Self::OpenQuad(error) => write!(fmt, "the quad artifact failed to open: {error}"),
            Self::OpenArray { kind, error } => {
                write!(fmt, "the {kind} artifact failed to open: {error}")
            }
            Self::OpenAdjacency(error) => {
                write!(fmt, "the adjacency artifact failed to open: {error}")
            }
            Self::Adjacency(invalid) => {
                write!(
                    fmt,
                    "the adjacency artifact violates the incident-list contract: {invalid}"
                )
            }
            Self::Schedule {
                span_log2,
                max_tile_depth,
            } => {
                write!(
                    fmt,
                    "the recorded schedule needs {max_tile_depth} + {span_log2} subdivisions \
                     where a 64-bit Morton key resolves {}",
                    Depth::MAX.get(),
                )
            }
            Self::Shape { kind } => write!(
                fmt,
                "the {kind} artifact does not hold the serving contract's shape",
            ),
            Self::Columns {
                codes,
                coordinates,
                rows,
                ranks,
                positions,
                rank_positions,
            } => {
                write!(
                    fmt,
                    "the base-order columns disagree on the point count: {codes} codes, \
                     {coordinates} coordinates, {rows} rows, {ranks} ranks, {positions} \
                     positions, {rank_positions} rank positions",
                )
            }
            &Self::RankInverse {
                position,
                rank,
                roundtrip: Some(roundtrip),
            } => write!(
                fmt,
                "the rank columns are not inverse: position {position} carries rank {rank}, which \
                 the reverse column sends to position {roundtrip}",
            ),
            &Self::RankInverse {
                position,
                rank,
                roundtrip: None,
            } => write!(
                fmt,
                "the rank columns are not inverse: position {position} carries rank {rank}, which \
                 lies outside the rank domain",
            ),
            &Self::RowInverse {
                position,
                node,
                roundtrip: Some(roundtrip),
            } => write!(
                fmt,
                "the row columns are not inverse: position {position} holds node {node}, which \
                 the reverse column sends to position {roundtrip}",
            ),
            &Self::RowInverse {
                position,
                node,
                roundtrip: None,
            } => write!(
                fmt,
                "the row columns are not inverse: position {position} holds node {node}, which \
                 lies outside the reverse column's domain",
            ),
            Self::Corruption(error) => fmt::Display::fmt(error, fmt),
            Self::Nodes { adjacency, codes } => write!(
                fmt,
                "the adjacency spans {adjacency} node rows where the code column holds {codes}",
            ),
            Self::Edges {
                adjacency,
                endpoints,
            } => write!(
                fmt,
                "the adjacency spans {adjacency} edge rows where the endpoint column holds \
                 {endpoints}",
            ),
            Self::Subtree { quad, codes } => write!(
                fmt,
                "the quadtree root counts {quad} points where the code column holds {codes}",
            ),
            Self::OpenPostings(error) => {
                write!(fmt, "the postings artifact failed to open: {error}")
            }
            Self::Postings(error) => {
                write!(fmt, "the postings artifact violates its contract: {error}")
            }
            Self::Closure(error) => {
                write!(fmt, "no closure map exists: {error}")
            }
            Self::OpenIdentity { domain, error } => {
                write!(
                    fmt,
                    "the {domain} identity artifact failed to open: {error}"
                )
            }
            Self::Identity { domain, error } => write!(
                fmt,
                "the {domain} identity artifact violates the table contract: {error}",
            ),
            Self::Points { postings, codes } => write!(
                fmt,
                "the postings span {postings} points where the code column holds {codes}",
            ),
            Self::Types {
                postings,
                identities,
            } => write!(
                fmt,
                "the postings span {postings} types where the identity table holds {identities}",
            ),
            Self::Identities { identities, codes } => write!(
                fmt,
                "the node identity table holds {identities} rows where the code column holds \
                 {codes}",
            ),
            Self::EdgeIdentities { identities, edges } => write!(
                fmt,
                "the edge identity table holds {identities} rows where the adjacency spans \
                 {edges} edges",
            ),
            Self::Universe { rows } => write!(
                fmt,
                "the row column holds {rows} entries where wire ids span the u32 range",
            ),
            Self::EdgeUniverse { edges } => write!(
                fmt,
                "the adjacency spans {edges} edge rows where edge ids span the u32 range",
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
            Self::OpenPostings(postings) => Some(postings),
            Self::Postings(invalid) => Some(invalid),
            Self::Closure(cycle) => Some(cycle),
            Self::OpenIdentity { domain: _, error } => Some(error),
            Self::Identity { domain: _, error } => Some(error),
            Self::Corruption(error) => Some(error),
            Self::Unpublished(_)
            | Self::Schedule { .. }
            | Self::Shape { .. }
            | Self::Columns { .. }
            | Self::RankInverse { .. }
            | Self::RowInverse { .. }
            | Self::Nodes { .. }
            | Self::Edges { .. }
            | Self::Subtree { .. }
            | Self::Points { .. }
            | Self::Types { .. }
            | Self::Identities { .. }
            | Self::EdgeIdentities { .. }
            | Self::Universe { .. }
            | Self::EdgeUniverse { .. } => None,
        }
    }
}
