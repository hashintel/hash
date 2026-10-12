//! # HASH Integrations Definition
//!
//! The checked model of an integration definition: the sources an integration reads, the
//! pipelines that turn their rows into entities and links, and the unit maps that give measured
//! values their data types.
//!
//! [`Definition::new`] checks a [`DefinitionParts`] and reports every problem as a
//! [`DefinitionIssue`] with the path of the part it concerns.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(ascii_char, ascii_char_variants)]

extern crate alloc;

mod definition;
mod issue;
mod link;
mod name;
mod pipeline;
mod source;
mod step;
mod unit_map;

pub use self::{
    definition::{Definition, DefinitionParts},
    issue::{DefinitionIssue, DefinitionPath, IssueKind, PathSegment},
    link::{EmptyLinkInputs, LinkEndpoint, LinkInput, LinkInputs, LinkPipeline, LinkStep},
    name::{
        CheckpointName, ColumnName, ConnectorId, InputAlias, InvalidName, LinkId, SourceName,
        StepId, UnitCode, UnitMapName,
    },
    pipeline::EntityPipeline,
    source::{
        Coverage, EmptySqlQuery, InvalidPrimaryKey, PrimaryKey, Source, SourceKind, SqlQuery,
    },
    step::{
        Accessor, Action, BranchStep, Branches, Coercion, ConflictingPropertyVersions, EntitySink,
        InvalidBranches, Properties, Step, StepKind,
    },
    unit_map::{EmptyUnitMap, UnitMap},
};
