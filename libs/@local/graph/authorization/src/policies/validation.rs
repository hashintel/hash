use std::sync::LazyLock;

use cedar_policy_core::{
    extensions::Extensions,
    validator::{CoreSchema, ValidationMode, Validator, ValidatorSchema},
};
use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};

use super::set::PolicySet;

static SCHEMA: LazyLock<ValidatorSchema> = LazyLock::new(|| {
    let (schema, warnings) = ValidatorSchema::from_cedarschema_str(
        include_str!("../../schemas/policies.cedarschema"),
        Extensions::none(),
    )
    .unwrap_or_else(|error| {
        panic!("Policy schema is invalid: {error}");
    });

    for warning in warnings {
        tracing::warn!("policy schema warning: {warning}");
        #[cfg(test)]
        {
            eprintln!("policy schema warning: {warning}");
        }
    }
    schema
});

static VALIDATOR: LazyLock<Validator> = LazyLock::new(|| Validator::new((*SCHEMA).clone()));

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("pocliy validation failed")]
pub struct PolicyValidationError;

#[derive(Debug)]
pub struct PolicyValidator;

impl PolicyValidator {
    pub(crate) fn schema() -> &'static ValidatorSchema {
        &SCHEMA
    }

    pub(crate) fn core_schema() -> CoreSchema<'static> {
        CoreSchema::new(Self::schema())
    }

    /// Validate a policy set.
    ///
    /// # Errors
    ///
    /// Returns a [`Report`] if the policy set is invalid. The report contains
    /// a list of validation errors.
    #[expect(
        clippy::unused_self,
        reason = "More fields will be added in the future"
    )]
    #[track_caller]
    pub fn validate_policy_set(
        &self,
        policy_set: &PolicySet,
    ) -> Result<(), Report<PolicyValidationError>> {
        let result = VALIDATOR.validate(policy_set.policies(), ValidationMode::Strict);
        #[cfg(test)]
        {
            for warning in result.validation_warnings() {
                eprintln!("validation warning: {warning}");
            }
        }

        for warning in result.validation_warnings() {
            tracing::warn!(message=%warning, "validation warning");
        }

        result
            .into_errors_and_warnings()
            .0
            .map(|error| Err(Report::new(error)))
            .try_collect_reports()
            .change_context(PolicyValidationError)
    }
}
