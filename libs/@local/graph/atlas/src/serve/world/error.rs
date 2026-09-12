use core::{error::Error, fmt};

use crate::file::repository::FileName;

/// A failure while opening a [`World`].
///
/// [`World`]: super::World
#[derive(Debug)]
pub enum WorldError {
    /// An artifact failed to open.
    Open {
        /// The artifact's repository file name.
        file: FileName,
    },
    /// The recorded bucket schedule failed validation.
    BucketSchedule,
    /// The node identity table and the node position columns disagree on the row count.
    NodeIndexCountMismatch {
        /// The rows the node identity table covers.
        identity: u64,
        /// The rows the row-of-position column covers.
        lookup: usize,
        /// The rows the position-of-row column covers.
        reverse: usize,
    },
    /// The node importance columns disagree on the row count.
    NodeImportanceCountMismatch {
        /// The rows the rank-of-position column covers.
        lookup: usize,
        /// The rows the position-of-rank column covers.
        reverse: usize,
    },
    /// The wire coordinate column and the Morton order disagree on the point count.
    GeometryCountMismatch {
        /// The points the wire coordinate column covers.
        positions: usize,
        /// The points the Morton order covers.
        morton_order: u64,
    },
    /// The spatial index root and the wire coordinate column disagree on the point count.
    SpatialIndexCountMismatch {
        /// The points the spatial index root covers.
        root: u32,
        /// The points the wire coordinate column covers.
        positions: usize,
    },
    /// The node index, the node importance and the geometry disagree on the node count.
    LayoutCountMismatch {
        /// The nodes the node index covers.
        index: usize,
        /// The nodes the node importance covers.
        importance: usize,
        /// The nodes the geometry covers.
        geometry: usize,
    },
    /// A sampled position failed to round-trip through a layout permutation and its inverse.
    LayoutRoundtrip,
    /// The node count exceeds the `u32` range of positions and wire ids.
    TooManyNodes {
        /// The nodes the world holds.
        nodes: usize,
    },
    /// The row count exceeds the wire domain or address space.
    TooManyRows {
        /// The opening row domain's size.
        rows: u64,
    },
    /// The edge identity table, the endpoint column and the adjacency disagree on the edge count.
    TopologyCountMismatch {
        /// The edges the edge identity table covers.
        identity: u64,
        /// The edges the endpoint column covers.
        endpoints: usize,
        /// The edges the adjacency covers.
        adjacency: u64,
    },
    /// The edge count exceeds the `u32` range of edge ids.
    TooManyEdges {
        /// The edges the world holds.
        edges: u64,
    },
    /// The ontology identity table and the postings disagree on the type count.
    OntologyCountMismatch {
        /// The types the ontology identity table covers.
        identity: u64,
        /// The types the postings cover.
        postings: u64,
    },
    /// The point count exceeds the address space.
    TooManyPositions {
        /// The points the postings cover.
        positions: u64,
    },
    /// The type count exceeds the address space.
    TooManyTypes {
        /// The types the ontology holds.
        types: u64,
    },
    /// The type closure failed to derive.
    OntologyClosure,
    /// The layout, the topology and the ontology disagree on the node count.
    NodeCountMismatch {
        /// The nodes the layout covers.
        layout: usize,
        /// The nodes the topology covers.
        topology: usize,
        /// The nodes the ontology covers.
        ontology: usize,
    },
}

impl fmt::Display for WorldError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open { file } => write!(fmt, "the {file} artifact failed to open"),
            Self::BucketSchedule => fmt.write_str("the recorded bucket schedule failed validation"),
            Self::NodeIndexCountMismatch {
                identity,
                lookup,
                reverse,
            } => write!(
                fmt,
                "the node identity table covers {identity} rows where the row-of-position column \
                 covers {lookup} and the position-of-row column covers {reverse}",
            ),
            Self::NodeImportanceCountMismatch { lookup, reverse } => write!(
                fmt,
                "the rank-of-position column covers {lookup} rows where the position-of-rank \
                 column covers {reverse}",
            ),
            Self::GeometryCountMismatch {
                positions,
                morton_order,
            } => write!(
                fmt,
                "the wire coordinate column covers {positions} points where the Morton order \
                 covers {morton_order}",
            ),
            Self::SpatialIndexCountMismatch { root, positions } => write!(
                fmt,
                "the spatial index root covers {root} points where the wire coordinate column \
                 covers {positions}",
            ),
            Self::LayoutCountMismatch {
                index,
                importance,
                geometry,
            } => write!(
                fmt,
                "the node index covers {index} nodes where the node importance covers \
                 {importance} and the geometry covers {geometry}",
            ),
            Self::LayoutRoundtrip => fmt.write_str(
                "a sampled position failed to round-trip through the layout permutations",
            ),
            Self::TooManyNodes { nodes } => write!(
                fmt,
                "the world holds {nodes} nodes where positions and wire ids span the u32 range",
            ),
            Self::TooManyRows { rows } => write!(
                fmt,
                "row count {rows} exceeds the wire domain or address space",
            ),
            Self::TopologyCountMismatch {
                identity,
                endpoints,
                adjacency,
            } => write!(
                fmt,
                "the edge identity table covers {identity} edges where the endpoint column covers \
                 {endpoints} and the adjacency covers {adjacency}",
            ),
            Self::TooManyEdges { edges } => write!(
                fmt,
                "the world holds {edges} edges where edge ids span the u32 range",
            ),
            Self::OntologyCountMismatch { identity, postings } => write!(
                fmt,
                "the ontology identity table covers {identity} types where the postings cover \
                 {postings}",
            ),
            Self::TooManyPositions { positions } => write!(
                fmt,
                "the postings cover {positions} points where the address space spans the usize \
                 range",
            ),
            Self::TooManyTypes { types } => write!(
                fmt,
                "the ontology holds {types} types where the address space spans the usize range",
            ),
            Self::OntologyClosure => fmt.write_str("the type closure failed to derive"),
            Self::NodeCountMismatch {
                layout,
                topology,
                ontology,
            } => write!(
                fmt,
                "the layout covers {layout} nodes where the topology covers {topology} and the \
                 ontology covers {ontology}",
            ),
        }
    }
}

impl Error for WorldError {}
