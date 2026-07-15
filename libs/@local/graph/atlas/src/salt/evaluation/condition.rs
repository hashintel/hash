use super::error::EvaluationError;
use crate::salt::hash::ContentHash;

const MAX_EVALUATION_CONDITIONS: usize = 32;

/// Versioned closed domain of the global relation-lens condition.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ConditionDomain {
    minimum: f64,
    maximum: f64,
    version: ContentHash,
}

impl ConditionDomain {
    /// Defines a finite non-degenerate condition interval rooted at zero.
    ///
    /// # Errors
    ///
    /// This returns an error unless `minimum == 0 < maximum` and both endpoints
    /// are finite.
    pub(crate) fn new(
        minimum: f64,
        maximum: f64,
        version: ContentHash,
    ) -> Result<Self, EvaluationError> {
        if !minimum.is_finite()
            || !maximum.is_finite()
            || minimum.to_bits() != 0.0_f64.to_bits()
            || minimum >= maximum
        {
            return Err(EvaluationError::InvalidDomain { minimum, maximum });
        }
        Ok(Self {
            minimum,
            maximum,
            version,
        })
    }

    /// Returns the condition-domain version identity.
    #[must_use]
    #[inline]
    pub(crate) const fn version(self) -> ContentHash {
        self.version
    }
}

/// One finite global relation-lens condition.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
#[repr(transparent)]
pub(crate) struct RelationCondition(f64);

impl RelationCondition {
    /// Returns the scalar condition.
    #[must_use]
    #[inline]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }
}

/// Gate evidence for one disposable ladder coordinate field.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ConditionEvidence {
    pub monotonicity: bool,
    pub distinguishability: bool,
    pub report: ContentHash,
}

/// One evaluated relation condition and its evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct EvaluatedCondition {
    pub condition: RelationCondition,
    pub evidence: ConditionEvidence,
}

/// Bounded evaluation-only condition ladder.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConditionLadder {
    domain: ConditionDomain,
    candidates: Vec<EvaluatedCondition>,
}

impl ConditionLadder {
    /// Validates an ordered ladder inside a versioned condition domain.
    ///
    /// Candidate order is retained as configuration identity. At least two
    /// points are required to measure cross-condition behavior.
    ///
    /// # Errors
    ///
    /// This returns an error when the ladder has fewer than two or more than
    /// 32 candidates, or a condition is non-finite, out of domain, or not
    /// strictly increasing.
    pub(crate) fn new(
        domain: ConditionDomain,
        candidates: impl IntoIterator<Item = (f64, ConditionEvidence)>,
    ) -> Result<Self, EvaluationError> {
        let candidates = candidates
            .into_iter()
            .map(|(condition, evidence)| EvaluatedCondition {
                condition: RelationCondition(condition),
                evidence,
            })
            .collect::<Vec<_>>();
        if candidates.len() < 2 {
            return Err(EvaluationError::TooFewCandidates {
                count: candidates.len(),
            });
        }
        if candidates.len() > MAX_EVALUATION_CONDITIONS {
            return Err(EvaluationError::TooManyCandidates {
                count: candidates.len(),
                maximum: MAX_EVALUATION_CONDITIONS,
            });
        }
        if candidates[0].condition.get().to_bits() != 0.0_f64.to_bits() {
            return Err(EvaluationError::MissingSemanticBaseline {
                value: candidates[0].condition.get(),
            });
        }
        let mut previous = None;
        for (index, candidate) in candidates.iter().enumerate() {
            let value = candidate.condition.get();
            if !value.is_finite() {
                return Err(EvaluationError::NonFiniteCondition { index, value });
            }
            if value < domain.minimum || value > domain.maximum {
                return Err(EvaluationError::ConditionOutOfDomain { index, value });
            }
            if let Some(previous) = previous
                && value <= previous
            {
                return Err(EvaluationError::UnorderedCondition {
                    index,
                    previous,
                    value,
                });
            }
            previous = Some(value);
        }
        Ok(Self { domain, candidates })
    }

    /// Borrows evaluated candidates in configured order.
    #[must_use]
    #[inline]
    pub(crate) fn candidates(&self) -> &[EvaluatedCondition] {
        &self.candidates
    }

    /// Selects one fully passing evaluated condition for base materialization.
    ///
    /// Selection policy remains outside this validation boundary; this method
    /// proves only that the chosen condition was evaluated and passed every
    /// required cross-condition criterion. The report identity binds the
    /// external semantic-fidelity and task-suite grants.
    ///
    /// # Errors
    ///
    /// This returns an error when `value` is not an exact ladder member or its
    /// evidence has a failed criterion.
    pub(crate) fn select_canonical(
        &self,
        value: f64,
    ) -> Result<CanonicalCondition, EvaluationError> {
        let candidate = self
            .candidates
            .iter()
            .find(|candidate| candidate.condition.get().to_bits() == value.to_bits())
            .ok_or(EvaluationError::UnknownCanonical { value })?;
        let checks = [
            ("monotonicity", candidate.evidence.monotonicity),
            ("distinguishability", candidate.evidence.distinguishability),
        ];
        if let Some((criterion, _)) = checks.into_iter().find(|(_, passed)| !passed) {
            return Err(EvaluationError::FailedCanonicalEvidence { value, criterion });
        }
        Ok(CanonicalCondition {
            condition: candidate.condition,
            domain_version: self.domain.version(),
            evidence: candidate.evidence.report,
        })
    }
}

/// A fully evaluated condition authorized for canonical materialization.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CanonicalCondition {
    condition: RelationCondition,
    domain_version: ContentHash,
    evidence: ContentHash,
}

impl CanonicalCondition {
    /// Returns the selected global relation-lens scalar.
    #[must_use]
    #[inline]
    pub(crate) const fn condition(self) -> RelationCondition {
        self.condition
    }

    /// Returns the condition-domain version.
    #[must_use]
    #[inline]
    pub(crate) const fn domain_version(self) -> ContentHash {
        self.domain_version
    }

    /// Returns the selected candidate's evaluation evidence.
    #[must_use]
    #[inline]
    pub(crate) const fn evidence(self) -> ContentHash {
        self.evidence
    }
}
