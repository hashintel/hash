//! Immutable generation manifests and canonical content identities.
//!
//! A manifest binds every input, learned artifact, numerical contract, and
//! serving companion needed to reproduce one generation. Activation state and
//! release evidence are separate content-addressed records: including either
//! inside the manifest would create a hash cycle or make an immutable
//! generation change when it becomes active.

mod error;
mod model;
mod validate;

pub(crate) use self::{error::ManifestError, model::*};

#[cfg(test)]
mod tests;
