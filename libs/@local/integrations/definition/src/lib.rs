//! # HASH Integrations Definition
//!
//! The checked model of an integration definition.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(ascii_char, ascii_char_variants)]

extern crate alloc;

mod name;

pub use self::name::{
    CheckpointName, ColumnName, ConnectorId, InputAlias, InvalidName, LinkId, SourceName, StepId,
    UnitCode, UnitMapName,
};
