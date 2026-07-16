//! Evaluation-only relation-condition ladders and canonical selection.
//!
//! A conditioned projector accepts one global scalar for the whole coordinate
//! field. Ladder coordinates measure how that lens changes the atlas; they are
//! not publication variants. Only a ladder member with measured monotonicity
//! and distinguishability plus bound semantic-fidelity and task-suite reports
//! can become a [`CanonicalCondition`]. Persistence is measured from the
//! resulting canonical analytic artifact before release.
//!
//! # Why a ladder is disposable
//!
//! The relation condition is global: changing it projects the complete corpus
//! again. Ladder members are experiments used to establish how relation
//! pressure changes the map, not alternate views promised to readers. The
//! first member must be exact positive zero and supplies the semantic-only
//! reference frame.
//!
//! For each later field, measurement fits an orientation-preserving similarity
//! transform back to the reference. This removes translation, rotation, and
//! uniform scale before calculating movement. Two checks are then attached to
//! each rung:
//!
//! - monotonicity requires frozen relation-attraction loss not to increase beyond the configured
//!   tolerance; and
//! - distinguishability requires enough aligned RMS movement from the immediately preceding rung.
//!
//! Movement from the baseline and from the preceding rung are both retained:
//! the first explains cumulative geometric change, while the second detects
//! adjacent conditions that are operationally indistinguishable.
//!
//! # Canonical selection
//!
//! [`ConditionLadder::select_canonical`] proves that a requested scalar is an
//! exact evaluated member with passing cross-condition evidence. The separate
//! generation policy applies semantic-fidelity and subgroup thresholds and
//! chooses which passing rung to publish. Selection therefore cannot invent an
//! unevaluated interpolation.
//!
//! The selected field is aligned once into the zero-condition frame, rounded
//! onto the configured lattice, clamped to its declared extent, and narrowed
//! to persisted [`f32`] components. Release-quality evaluation receives this
//! quantized field and its content hash. Pre-quantization [`f64`] coordinates
//! remain useful diagnostics but cannot authorize publication.
//!
//! # Persistence
//!
//! The canonical field's analytic merge tree is compared with the independently
//! persisted landmark reference. Leaf counts at fixed normalized thresholds
//! and normalized total persistence must stay inside a two-sided ratio
//! envelope. Low-persistence mass and synthetic-noise persistence have
//! one-sided upper bounds, and every planted-shape case must pass.

mod canonical;
mod condition;
mod error;
mod measure;

pub(crate) use self::{
    canonical::{
        CanonicalField, CanonicalQuantization, QuantizedCanonicalField, canonical_field,
        quantized_field_content_hash,
    },
    condition::{CanonicalCondition, ConditionDomain, ConditionEvidence, ConditionLadder},
    error::EvaluationError,
    measure::{
        ConditionField, ConditionMeasurement, ConditionMeasurementConfig,
        ConditionMeasurementError, measure_condition_ladder, measure_persisted_relation_loss,
    },
};

#[cfg(test)]
mod tests;
