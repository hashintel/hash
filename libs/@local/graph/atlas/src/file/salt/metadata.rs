//! The SALT generation metadata document.
//!
//! The schema is version 0 and **mutable**: change it freely to fit what
//! the pipeline needs and increment its version field when you do; no
//! migration or compatibility machinery exists on purpose until it
//! stabilizes.

/// Metadata describing one published SALT generation: the input snapshot,
/// pipeline configuration, and quality gates its files were produced
/// under.
///
/// The field set follows the generation manifest the SPEC requires; it is
/// populated as the pipeline stages land.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltMetadata;
