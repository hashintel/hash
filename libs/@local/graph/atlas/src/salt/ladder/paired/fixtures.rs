//! Shared inputs of the paired-movement acceptance tests.
//!
//! The identity pins freeze the exact bytes [`snapshot`] and [`reproducibility`] serialize
//! into, and the writer pins record the salt they derive, so every sibling's tests must agree
//! on one definition of these inputs. A definition that drifted in one test module and not
//! another would fail a byte pin far from the drift, so the shared inputs live here and each
//! test module keeps the fixtures it alone consumes.

use core::num::NonZero;

use hashql_core::id::IdSlice;

use super::identity::{DrawRule, DrawSalt, RuleIdentity};
use crate::{
    file::{
        attraction::{EdgeRecord, GroupRecord},
        salt::metadata::{Reproducibility, Snapshot},
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AffinityCurve, NonNegative, PositiveUnitFraction, UnitFraction, Vec2},
    salt::{embedding::EmbedderFingerprint, fit::FitConfig, landmark::select::SelectionOptions},
};

/// Digests a seed string into a fixture identity.
pub(super) fn digest(seed: &str) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hasher.finalize()
}

/// The frozen configuration half of the preimage inputs.
pub(super) fn config() -> FitConfig {
    FitConfig {
        seed: 0xC2,
        selection: SelectionOptions {
            maximum_count: NonZero::new(512).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::new(1.5, 0.9)
            .expect("the fixture parameters are finite and strictly positive"),
        ..
    }
}

/// The frozen snapshot half of the preimage inputs.
pub(super) fn snapshot() -> Snapshot {
    Snapshot {
        axes: None,
        nodes: 1_000,
        edges: 4_000,
        ontology_types: 12,
    }
}

/// The frozen reproducibility half of the preimage inputs.
pub(super) fn reproducibility() -> Reproducibility {
    Reproducibility {
        config: config(),
        embedder: EmbedderFingerprint::new(digest("embedder contract")),
        prior: None,
    }
}

/// The recognized initial draw rule.
pub(super) fn rule() -> DrawRule {
    RuleIdentity::INITIAL
        .recognize()
        .expect("the crate carries its own initial identity")
}

/// The salt the frozen inputs derive.
pub(super) fn salt() -> DrawSalt {
    rule()
        .derive_salt(&snapshot(), &reproducibility())
        .expect("the fixture should derive a salt")
}

/// Names a corpus row.
pub(super) fn node(value: u64) -> NodeRowId {
    NodeRowId::new(value)
}

/// Builds one attraction group record with the given Proximal class weight.
pub(super) fn group(relation: u64, edge_offset: u64, proximal: f32) -> GroupRecord {
    let weight = |value: f32| NonNegative::new(value).expect("the fixture weights are in domain");
    GroupRecord::new(
        OntologyRowId::new(relation),
        edge_offset,
        weight(0.25),
        weight(proximal),
        weight(1.0),
    )
}

/// Builds one attraction edge record between two corpus rows.
pub(super) fn edge(source: u64, target: u64) -> EdgeRecord<NodeRowId, EdgeRowId> {
    EdgeRecord::new(
        EdgeRowId::new(0),
        NodeRowId::new(source),
        NodeRowId::new(target),
        UnitFraction::new(1.0).expect("the fixture confidence is in domain"),
        PositiveUnitFraction::new(1.0).expect("the fixture degree is in domain"),
        0b111,
    )
}

/// Views a point slice as a corpus-row frame.
pub(super) fn frame(points: &[Vec2]) -> &IdSlice<NodeRowId, Vec2> {
    IdSlice::from_raw(points)
}
