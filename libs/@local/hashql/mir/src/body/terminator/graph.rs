//! Graph read terminator representation for HashQL MIR.
//!
//! Graph read terminators represent database query operations that read from
//! the HashQL graph store. They provide structured access to graph data with
//! control flow implications based on query results.

use core::{fmt, fmt::Display};

use hashql_core::heap;

use crate::{
    body::{basic_block::BasicBlockId, local::Local, location::Location, operand::Operand},
    def::DefId,
};

/// A location that identifies a specific operation within a graph read terminator.
///
/// While a [`Location`] identifies a terminator within the control flow graph,
/// a [`GraphReadLocation`] provides finer-grained identification of specific
/// operations within a graph read terminator's processing pipeline.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GraphReadLocation {
    /// The base location identifying the graph read terminator.
    ///
    /// This [`Location`] points to the graph read terminator within the
    /// control flow graph (block and statement index).
    pub base: Location,

    /// The index of the specific operation within the graph read pipeline.
    ///
    /// This index identifies which operation in the graph read is being referenced:
    /// - `0`: The head operation
    /// - `1..n`: Body operations (indexed sequentially)
    /// - `n`: The tail operation (where n = 1 + number of body operations)
    pub graph_read_index: usize,
}

impl Display for GraphReadLocation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self {
            base,
            graph_read_index,
        } = self;

        write!(fmt, "{base}:{graph_read_index}")
    }
}

/// The starting point for a graph read operation.
///
/// Determines where the query begins in the bi-temporal graph. The head
/// specifies the initial data source and temporal context for the query,
/// establishing the foundation for subsequent filtering and processing operations.
///
/// # Bi-temporal Querying
///
/// HashQL's graph store maintains bi-temporal data, tracking both when
/// facts were true in the real world and when they were recorded in the
/// database. The head operation establishes the temporal axis for the query.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadHead<'heap> {
    /// Start the query from entities in the bi-temporal graph.
    ///
    /// This variant initiates a query that reads entity data from the graph
    /// store. The `axis` operand specifies the temporal context for the
    /// bi-temporal query.
    Entity { axis: Operand<'heap> },
}

/// Operations that can be applied to process and filter query results.
///
/// The body of a graph read operation contains filtering and transformation steps
/// that process the data selected by the [`GraphReadHead`]. These operations are
/// applied sequentially to refine and transform the result set before final
/// collection by the [`GraphReadTail`].
///
/// # Pipeline Processing
///
/// Body operations form a processing pipeline where:
/// 1. Data flows from the head operation through each body operation in sequence
/// 2. Each operation can filter, transform, or enrich the data stream
/// 3. Operations may have access to captured variables from the surrounding scope
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadBody {
    /// Apply a filter predicate to narrow down results.
    ///
    /// This operation applies a user-defined predicate function to filter
    /// the data stream, keeping only items that satisfy the predicate condition.
    /// The filter function has access to both the current data item and any
    /// captured environment variables.
    ///
    /// # Parameters
    ///
    /// - **Function**: The [`DefId`] identifies a function that implements the filter predicate.
    ///   This function must have arity 1 (taking one argument) and return a boolean value
    ///   indicating whether to keep the item.
    /// - **Environment**: The [`Local`] refers to a variable that holds the captured environment.
    Filter(DefId, Local),
}

/// The final operation that determines how the query results are returned.
///
/// The tail operation specifies how the processed data should be finalized
/// and returned to the caller. It represents the final step in the query
/// pipeline, determining the structure and format of the query results.
///
/// # Result Processing
///
/// Tail operations handle the final transformation of the data stream into
/// the form expected by the calling code. They may:
/// - Aggregate multiple items into collections
/// - Apply final transformations or formatting
/// - Handle empty result sets appropriately
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadTail {
    /// Collect all results into a collection.
    ///
    /// This operation gathers all items that have passed through the query
    /// pipeline and returns them as a structured collection (typically a list
    /// or array). It ensures that all qualifying entities are captured and
    /// made available to the calling code.
    Collect,
}

/// A graph read terminator in the HashQL MIR.
///
/// Graph read terminators represent database query operations that read from
/// the HashQL graph store and have control flow implications. They provide
/// a structured way to query graph data through a three-phase pipeline:
/// head (source), body (processing), and tail (result formatting).
///
/// # Query Pipeline Structure
///
/// Each graph read operation follows a consistent pipeline:
/// 1. **Head**: Establishes the data source and temporal context
/// 2. **Body**: Applies filtering and transformation operations in sequence
/// 3. **Tail**: Finalizes and formats the results for the caller
///
/// # Control Flow Integration
///
/// As a terminator, graph read operations yield control flow back to the caller through the target.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GraphRead<'heap> {
    /// The starting point and data source for the graph query.
    ///
    /// This [`GraphReadHead`] establishes where the query begins in the
    /// graph store and provides the temporal context for bi-temporal queries.
    /// It determines the initial set of data that will flow through the
    /// processing pipeline.
    pub head: GraphReadHead<'heap>,

    /// The sequence of processing operations applied to the query data.
    ///
    /// This collection of [`GraphReadBody`] operations forms a processing
    /// pipeline that filters, transforms, and refines the data selected
    /// by the head operation. Operations are applied in sequence, with
    /// each operation receiving the output of the previous operation.
    pub body: heap::Vec<'heap, GraphReadBody>,

    /// The final operation that determines how results are returned.
    ///
    /// This [`GraphReadTail`] specifies how the processed data should be
    /// finalized and structured for return to the calling code. It represents
    /// the final step in the query pipeline.
    pub tail: GraphReadTail,

    /// The continuation target after the graph read completes.
    ///
    /// This [`BasicBlockId`] specifies where control should transfer after the
    /// graph read operation completes successfully. The query results will
    /// be made available to the target block by the first argument of the
    /// target block.
    pub target: BasicBlockId,
}
