mod callgraph;
mod data_dependency;
pub mod dataflow;
pub use self::{
    callgraph::{CallGraph, CallGraphAnalysis, CallKind},
    data_dependency::{DataDependencyAnalysis, DataDependencyGraph, TransientDataDependencyGraph},
};
