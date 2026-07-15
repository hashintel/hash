//! Production adapters for external quality suites.

use core::fmt;

use super::{
    ConditionQuality, ConditionQualityEvaluationError, ConditionQualityEvaluator,
    PersistedCondition, PersistenceDiagnostics, PersistenceEvaluationError,
    PersistenceEvaluationSubject, PersistenceQualityEvaluator, ProjectedCondition,
};
use crate::salt::hash::ContentHash;

/// Callback-backed adapter for a versioned condition-quality service.
pub(crate) struct ConditionQualitySuiteAdapter<Batch, Persisted> {
    suite_version: Box<str>,
    contract_hash: ContentHash,
    evaluate_batch: Batch,
    evaluate_persisted: Persisted,
}

impl<Batch, Persisted> ConditionQualitySuiteAdapter<Batch, Persisted> {
    /// Binds external evaluation callbacks to an immutable suite contract.
    ///
    /// # Errors
    ///
    /// Returns an error when the suite version or contract identity is not
    /// canonical.
    pub(crate) fn new(
        suite_version: impl Into<Box<str>>,
        contract_hash: ContentHash,
        evaluate_batch: Batch,
        evaluate_persisted: Persisted,
    ) -> Result<Self, ConditionQualityEvaluationError> {
        let suite_version = suite_version.into();
        if suite_version.is_empty()
            || suite_version.trim() != suite_version.as_ref()
            || contract_hash == ContentHash::from_bytes([0; 32])
        {
            return Err(ConditionQualityEvaluationError::new(
                "condition-quality suite identity is not canonical",
            ));
        }
        Ok(Self {
            suite_version,
            contract_hash,
            evaluate_batch,
            evaluate_persisted,
        })
    }
}

impl<Batch, Persisted> fmt::Debug for ConditionQualitySuiteAdapter<Batch, Persisted> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ConditionQualitySuiteAdapter")
            .field("suite_version", &self.suite_version)
            .field("contract_hash", &self.contract_hash)
            .finish_non_exhaustive()
    }
}

impl<Batch, Persisted> ConditionQualityEvaluator for ConditionQualitySuiteAdapter<Batch, Persisted>
where
    Batch: Fn(&[ProjectedCondition]) -> Result<Vec<ConditionQuality>, ConditionQualityEvaluationError>
        + Sync,
    Persisted: for<'field> Fn(
            PersistedCondition<'field>,
        ) -> Result<ConditionQuality, ConditionQualityEvaluationError>
        + Sync,
{
    fn suite_version(&self) -> &str {
        &self.suite_version
    }

    fn contract_hash(&self) -> ContentHash {
        self.contract_hash
    }

    fn evaluate(
        &self,
        fields: &[ProjectedCondition],
    ) -> Result<Vec<ConditionQuality>, ConditionQualityEvaluationError> {
        (self.evaluate_batch)(fields)
    }

    fn evaluate_persisted(
        &self,
        field: PersistedCondition<'_>,
    ) -> Result<ConditionQuality, ConditionQualityEvaluationError> {
        (self.evaluate_persisted)(field)
    }
}

/// Callback-backed adapter for persistence distribution and planted-shape suites.
pub(crate) struct PersistenceQualitySuiteAdapter<Evaluate> {
    suite_version: Box<str>,
    contract_hash: ContentHash,
    evaluate: Evaluate,
}

impl<Evaluate> PersistenceQualitySuiteAdapter<Evaluate> {
    /// Binds a persistence evaluator callback to its versioned contract.
    ///
    /// # Errors
    ///
    /// Returns an error when the suite version or contract identity is not
    /// canonical.
    pub(crate) fn new(
        suite_version: impl Into<Box<str>>,
        contract_hash: ContentHash,
        evaluate: Evaluate,
    ) -> Result<Self, PersistenceEvaluationError> {
        let suite_version = suite_version.into();
        if suite_version.is_empty()
            || suite_version.trim() != suite_version.as_ref()
            || contract_hash == ContentHash::from_bytes([0; 32])
        {
            return Err(PersistenceEvaluationError::new(
                "persistence suite identity is not canonical",
            ));
        }
        Ok(Self {
            suite_version,
            contract_hash,
            evaluate,
        })
    }
}

impl<Evaluate> fmt::Debug for PersistenceQualitySuiteAdapter<Evaluate> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PersistenceQualitySuiteAdapter")
            .field("suite_version", &self.suite_version)
            .field("contract_hash", &self.contract_hash)
            .finish_non_exhaustive()
    }
}

impl<Evaluate> PersistenceQualityEvaluator for PersistenceQualitySuiteAdapter<Evaluate>
where
    Evaluate: for<'subject> Fn(
            PersistenceEvaluationSubject<'subject>,
        ) -> Result<PersistenceDiagnostics, PersistenceEvaluationError>
        + Sync,
{
    fn suite_version(&self) -> &str {
        &self.suite_version
    }

    fn contract_hash(&self) -> ContentHash {
        self.contract_hash
    }

    fn evaluate(
        &self,
        subject: PersistenceEvaluationSubject<'_>,
    ) -> Result<PersistenceDiagnostics, PersistenceEvaluationError> {
        (self.evaluate)(subject)
    }
}
