use core::fmt;
use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::error::ReleaseGateError;
use crate::salt::{
    hash::{ContentHash, ContentHasher},
    revision::{DataRevision, GenerationId},
};

/// Identity of one mandatory canonical-generation release gate.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum GateId {
    Representation,
    AnnRecall,
    SemanticFidelity,
    RelationPolicy,
    RelationSatisfaction,
    MergeTreePersistence,
    TemporalDrift,
    SubgroupBehavior,
    AuthorizationNoninterference,
    SnapshotConsistency,
    Reproducibility,
    SecurityApproval,
    CompanionPin,
}

impl GateId {
    const ALL: [Self; 13] = [
        Self::Representation,
        Self::AnnRecall,
        Self::SemanticFidelity,
        Self::RelationPolicy,
        Self::RelationSatisfaction,
        Self::MergeTreePersistence,
        Self::TemporalDrift,
        Self::SubgroupBehavior,
        Self::AuthorizationNoninterference,
        Self::SnapshotConsistency,
        Self::Reproducibility,
        Self::SecurityApproval,
        Self::CompanionPin,
    ];

    /// Borrows the complete mandatory gate set.
    #[must_use]
    #[inline]
    pub(crate) const fn required() -> &'static [Self] {
        &Self::ALL
    }
}

impl fmt::Display for GateId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Representation => "representation",
            Self::AnnRecall => "ANN recall",
            Self::SemanticFidelity => "semantic fidelity",
            Self::RelationPolicy => "relation policy",
            Self::RelationSatisfaction => "relation satisfaction",
            Self::MergeTreePersistence => "merge-tree persistence",
            Self::TemporalDrift => "temporal drift",
            Self::SubgroupBehavior => "subgroup behavior",
            Self::AuthorizationNoninterference => "authorization noninterference",
            Self::SnapshotConsistency => "snapshot consistency",
            Self::Reproducibility => "reproducibility",
            Self::SecurityApproval => "security approval",
            Self::CompanionPin => "client companion pin",
        };
        formatter.write_str(name)
    }
}

/// Immutable generation head named by a release report and activation pointer.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReleaseHead {
    pub generation: GenerationId,
    pub data: DataRevision,
    pub manifest: ContentHash,
}

/// Result and evidence identity for one release gate.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct GateOutcome {
    pub gate: GateId,
    pub evidence: ContentHash,
}

/// Complete canonical-generation gate report in stable gate order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct GateReport {
    version: u32,
    head: ReleaseHead,
    outcomes: Vec<GateOutcome>,
}

impl GateReport {
    /// Validates complete, unique, passing evidence for one release head.
    ///
    /// Outcomes are stored in [`GateId`] order, making JSON bytes and the
    /// report identity independent of caller order.
    ///
    /// # Errors
    ///
    /// This returns an error when a required gate is missing, repeated, or
    /// failed.
    pub(crate) fn new(
        head: ReleaseHead,
        mut outcomes: Vec<GateOutcome>,
    ) -> Result<Self, ReleaseGateError> {
        outcomes.sort_unstable_by_key(|outcome| outcome.gate);
        let mut seen = BTreeSet::new();
        for outcome in &outcomes {
            if !seen.insert(outcome.gate) {
                return Err(ReleaseGateError::Duplicate { gate: outcome.gate });
            }
        }
        for gate in GateId::ALL {
            if !seen.contains(&gate) {
                return Err(ReleaseGateError::Missing { gate });
            }
        }
        Ok(Self {
            version: 1,
            head,
            outcomes,
        })
    }

    /// Revalidates a report loaded from storage.
    ///
    /// # Errors
    ///
    /// This returns an error when the format version is unsupported or gate
    /// evidence is incomplete, repeated, or failed.
    pub(crate) fn validate(&self) -> Result<(), ReleaseGateError> {
        if self.version != 1 {
            return Err(ReleaseGateError::Version {
                actual: self.version,
            });
        }
        let canonical = Self::new(self.head, self.outcomes.clone())?;
        if canonical.outcomes != self.outcomes {
            return Err(ReleaseGateError::NonCanonicalOrder);
        }
        Ok(())
    }

    /// Borrows gate outcomes in canonical order.
    #[must_use]
    #[inline]
    pub(crate) fn outcomes(&self) -> &[GateOutcome] {
        &self.outcomes
    }

    /// Returns the exact immutable head evaluated by this report.
    #[must_use]
    #[inline]
    pub(crate) const fn head(&self) -> ReleaseHead {
        self.head
    }

    /// Computes the canonical report identity.
    #[must_use]
    pub(crate) fn content_hash(&self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.release-report.v1");
        hasher.update(self.head.generation.content_hash().as_bytes());
        hasher.update(&self.head.data.base().get().to_le_bytes());
        hasher.update(&self.head.data.delta().get().to_le_bytes());
        hasher.update(self.head.manifest.as_bytes());
        for outcome in &self.outcomes {
            hasher.update(&[gate_discriminant(outcome.gate)]);
            hasher.update(outcome.evidence.as_bytes());
        }
        hasher.finish()
    }

    /// Converts a validated report into activation authority.
    ///
    /// # Errors
    ///
    /// This returns an error if a report deserialized from storage is
    /// unsupported, incomplete, failing, repeated, or non-canonical.
    pub(crate) fn approve(&self) -> Result<GatedRelease, ReleaseGateError> {
        self.validate()?;
        let report = self.content_hash();
        Ok(GatedRelease {
            head: self.head,
            report,
        })
    }
}

/// Activation authority for one exact gated generation head.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct GatedRelease {
    head: ReleaseHead,
    report: ContentHash,
}

impl GatedRelease {
    /// Returns the exact generation and data head authorized for activation.
    #[must_use]
    #[inline]
    pub(crate) const fn head(self) -> ReleaseHead {
        self.head
    }

    /// Returns the release-report identity authorizing the head.
    #[must_use]
    #[inline]
    pub(crate) const fn report(self) -> ContentHash {
        self.report
    }
}

#[inline]
const fn gate_discriminant(gate: GateId) -> u8 {
    match gate {
        GateId::Representation => 0,
        GateId::AnnRecall => 1,
        GateId::SemanticFidelity => 2,
        GateId::RelationPolicy => 3,
        GateId::RelationSatisfaction => 4,
        GateId::MergeTreePersistence => 5,
        GateId::TemporalDrift => 6,
        GateId::SubgroupBehavior => 7,
        GateId::AuthorizationNoninterference => 8,
        GateId::SnapshotConsistency => 9,
        GateId::Reproducibility => 10,
        GateId::SecurityApproval => 11,
        GateId::CompanionPin => 12,
    }
}
