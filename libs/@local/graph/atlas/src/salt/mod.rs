//! Immutable, relation-conditioned atlas generation.
//!
//! SALT turns one permission-filtered graph snapshot into a content-addressed
//! two-dimensional atlas. Its central contract is stronger than "run a layout
//! algorithm": every input, learned model, numerical transform, quality
//! measurement, output artifact, and release decision is bound to an immutable
//! identity before readers can observe the result.
//!
//! # Mental model
//!
//! A generation is a sealed experiment with one explicit publication path:
//!
//! 1. [`snapshot`] freezes the bitemporal and authorization view. A relation enters geometry only
//!    when its link, endpoints, and required entity types are visible at the same verified
//!    authorization revision.
//! 2. [`card`], [`embedding`], [`classifier`], [`policy`], and [`strength`] derive relation
//!    semantics. Class probabilities, applicability, policy gates, and attraction strength remain
//!    separate values so no factor can be applied twice.
//! 3. [`representation`] validates each 3,072-component embedding and normalizes its 512-component
//!    projector prefix. [`graph`] persists the semantic k-nearest-neighbor graph; [`relation`]
//!    persists attraction and independent no-repel protection indexes.
//! 4. [`landmark`] selects a bounded, deterministic skeleton and fits its non-parametric reference
//!    layout. [`projector`] then trains one relation-conditioned parametric map over the complete
//!    corpus.
//! 5. [`evaluation`] measures a ladder of global relation conditions. [`generation`] selects one
//!    supported condition, aligns it into the reference frame, quantizes the exact field that
//!    readers will receive, and evaluates that persisted field.
//! 6. [`analytic`] derives density, superlevel-set persistence, watershed regions, and labels.
//!    [`materialize`] writes the immutable base and serving indexes.
//! 7. [`manifest`] validates and hashes the complete generation contract. [`release`] verifies
//!    measured and independently signed gates. [`activation`] changes the visible head only through
//!    an explicit compare-and-swap, then reopens and revalidates the generation.
//!
//! The stages deliberately exchange typed, validated values. A caller cannot
//! substitute a boolean "passed" claim for measured evidence or make an
//! unverified path visible by constructing only the final manifest.
//!
//! # Geometry
//!
//! The projector can be read as a family of maps
//!
//! ```text
//! y_i(eta) = f_theta(z_i, type_i, role_i, eta),  y_i in R^2
//! ```
//!
//! where `z_i` is the normalized 512-component prefix and `eta` is one global
//! relation condition for the complete coordinate field. Semantic fuzzy edges
//! preserve local embedding neighborhoods. Admitted relation instances add
//! attractive energy scaled by `eta`; separate protection channels suppress
//! incompatible negative samples. The classifier output itself is never fed
//! into the projector as a per-edge condition.
//!
//! Training differentiates semantic and relation objectives against detached
//! coordinates, clips their per-node coordinate gradients under independent
//! budgets, and propagates the resulting surrogate through the shared model.
//! Anchor and landmark support are outside the relation budget. This makes the
//! relation condition an interpretable global control rather than a way for
//! high-degree nodes to receive unbounded updates.
//!
//! # Identity and revisions
//!
//! SALT keeps three row-like identity domains distinct:
//!
//! - graph [`EntityId`] values are durable external identities;
//! - [`identity::GenerationRowId`] values are stable only within one generation;
//! - [`identity::ArtifactOrdinal`] values are dense indexes local to one artifact.
//!
//! Explicit maps mediate every transition. Content hashes use domain-separated,
//! length-framed SHA-256 preimages, so concatenation boundaries and semantic
//! roles are part of identity. [`revision::ReadSnapshot`] additionally binds
//! generation, authorization, scope, base revision, and delta revision to one
//! read.
//!
//! The storage model defines immutable base plus append-only delta semantics,
//! but the current serving implementation accepts only
//! `BaseRevision(0) + DeltaRevision(0)`. Mutation fails explicitly instead of
//! presenting partial incremental behavior.
//!
//! # Determinism and numerical contracts
//!
//! Stable row order, canonical little-endian encodings, named random seeds,
//! deterministic local projector initialization, and content-derived sampling
//! priorities make a run reproducible on its declared numerical target.
//! Floating-point behavior that can vary with FMA availability or backend
//! kernels is called out at the responsible module and covered by persisted
//! golden vectors or quality evidence. Release identity never assumes that two
//! different hardware targets produce equal bits without such a contract.
//!
//! The exact coordinates evaluated by release gates are the finite [`f32`]
//! values persisted for readers after alignment, clamping, and quantization.
//! Evidence records bind that coordinate-field hash, preventing a
//! higher-precision precursor from standing in for the published result.
//!
//! # Publication and recovery
//!
//! Generation, candidate publication, and activation are separate state
//! transitions. Files are written and synchronized beneath an immutable
//! generation directory; a candidate marker names the exact manifest and
//! signed release report; `active.json` changes only after compare-and-swap
//! verification. Startup rechecks signatures, hashes, schemas, projector
//! architecture, and cross-artifact invariants before serving any bytes.
//!
//! Mapped artifacts are copied into private unlinked snapshots before mapping.
//! Live readers therefore do not rely on advisory locking to keep a published
//! path immutable. The copy costs `O(file length)` once per opened generation;
//! typed section access afterward is zero-copy.
//!
//! # Operational boundary
//!
//! [`generation::run_store_backed_canonical_generation`] is the typed
//! generation, publication, activation, and restart-load composition point.
//! The crate-level [`crate::cli`] supplies a fitting adapter boundary and the
//! crate-level [`crate::api`] serves verified active state. The HTTP surface
//! trusts its surrounding network boundary and performs no request
//! authorization.
//!
//! [`EntityId`]: type_system::knowledge::entity::id::EntityId

mod activation;
mod alignment;
mod analytic;
#[cfg(feature = "salt-benchmarks")]
pub mod benchmark;
mod card;
mod classifier;
mod embedding;
mod evaluation;
mod format;
mod generation;
mod graph;
mod hash;
mod identity;
mod landmark;
mod manifest;
mod materialize;
mod policy;
mod projector;
mod relation;
mod release;
mod representation;
mod revision;
mod simd;
mod snapshot;
mod storage;
mod strength;

pub(crate) use self::{
    activation::{FileActivationStore, LoadedGeneration},
    hash::ContentHash,
    manifest::{ArtifactManifest, ArtifactRole},
    release::{ExternalGateVerifierSet, GateId, GateVerifier},
};
