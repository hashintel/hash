use error_stack::{Report, ReportSink, ResultExt as _, TryReportIteratorExt as _, bail};
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};

use crate::{
    Value,
    schema::{
        ConstraintError, SingleValueSchema,
        data_type::{
            closed::ResolveClosedDataTypeError,
            constraint::{Constraint, ConstraintValidator, ValueConstraints},
        },
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnyOfConstraints {
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[SingleValueSchema, ...SingleValueSchema[]]")
    )]
    pub any_of: Vec<SingleValueSchema>,
}

impl From<AnyOfConstraints> for ValueConstraints {
    fn from(mut constraints: AnyOfConstraints) -> Self {
        if constraints.any_of.len() == 1
            && constraints.any_of[0].description.is_none()
            && constraints.any_of[0].label.is_empty()
        {
            Self::Typed(constraints.any_of.remove(0).constraints)
        } else {
            Self::AnyOf(constraints)
        }
    }
}

impl Constraint for AnyOfConstraints {
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        let mut combined_constraints = Vec::new();
        let mut remainders = Vec::new();
        let mut errors = Vec::new();

        for (lhs, rhs) in self
            .any_of
            .clone()
            .into_iter()
            .cartesian_product(other.any_of.clone())
        {
            let (constraints, remainder) = match lhs.intersection(rhs) {
                Ok((constraints, remainder)) => (constraints, remainder),
                Err(error) => {
                    errors.push(Err(error));
                    continue;
                }
            };

            combined_constraints.push(constraints);
            if let Some(remainder) = remainder {
                remainders.push(remainder);
            }
        }

        match combined_constraints.len() {
            0 => {
                let _: Vec<()> = errors
                    .into_iter()
                    .try_collect_reports()
                    .change_context(ResolveClosedDataTypeError::EmptyAnyOf)?;
                bail!(ResolveClosedDataTypeError::EmptyAnyOf);
            }
            1 => Ok((
                Self {
                    any_of: combined_constraints,
                },
                remainders.pop().map(|schema| Self {
                    any_of: vec![schema],
                }),
            )),
            _ => {
                if remainders.is_empty() {
                    Ok((
                        Self {
                            any_of: combined_constraints,
                        },
                        None,
                    ))
                } else {
                    // Not possible to combine the constraints, we keep the input as it is
                    // for now
                    Ok((self, Some(other)))
                }
            }
        }
    }
}

impl ConstraintValidator<Value> for AnyOfConstraints {
    type Error = ConstraintError;

    fn is_valid(&self, value: &Value) -> bool {
        self.any_of
            .iter()
            .any(|schema| schema.constraints.is_valid(value))
    }

    fn validate_value(&self, value: &Value) -> Result<(), Report<ConstraintError>> {
        let mut status = ReportSink::<ConstraintError>::new();
        for schema in &self.any_of {
            if status
                .attempt(schema.constraints.validate_value(value))
                .is_some()
            {
                // We found a valid schema, so we can return early.
                let _: Result<(), _> = status.finish();
                return Ok(());
            }
        }
        status.finish().change_context(ConstraintError::AnyOf)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{from_value, json};

    use crate::schema::data_type::{
        closed::ResolveClosedDataTypeError,
        constraint::tests::{check_schema_intersection, check_schema_intersection_error},
    };

    #[test]
    fn intersect_min_max() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5,
                    "maximum": 10,
                }),
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "minimum": 7,
                        },
                        {
                            "type": "number",
                            "maximum": 12,
                        },
                    ],
                }),
            ],
            [json!({
                "anyOf": [
                    {
                        "type": "number",
                        "minimum": 7,
                        "maximum": 10,
                    },
                    {
                        "type": "number",
                        "minimum": 5,
                        "maximum": 10,
                    },
                ],
            })],
        );
    }

    #[test]
    fn intersect_single_variant() {
        check_schema_intersection(
            [
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "minimum": 7,
                            "maximum": 12,
                        },
                    ],
                }),
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "minimum": 5,
                            "maximum": 10,
                        },
                    ],
                }),
            ],
            [json!(
                {
                    "type": "number",
                    "minimum": 7,
                    "maximum": 10,
                }
            )],
        );
    }

    #[test]
    fn intersect_single_variant_metadata() {
        check_schema_intersection(
            [
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "minimum": 7,
                            "maximum": 12,
                        },
                    ],
                }),
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "minimum": 5,
                            "maximum": 10,
                            "description": "A number between 5 and 10",
                        },
                    ],
                }),
            ],
            [json!({
                "anyOf": [
                    {
                        "type": "number",
                        "minimum": 7,
                        "maximum": 10,
                        "description": "A number between 5 and 10",
                    },
                ],
            })],
        );
    }

    #[test]
    fn intersect_single_variant_with_remainder() {
        check_schema_intersection(
            [
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "multipleOf": 2,
                        },
                    ],
                }),
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "multipleOf": 3,
                        },
                    ],
                }),
            ],
            [
                json!(
                {
                    "type": "number",
                    "multipleOf": 2,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 3,
                }),
            ],
        );
    }

    #[test]
    fn intersect_multi_variant_with_remainder() {
        let schemas = [
            json!({
                "anyOf": [
                    {
                        "type": "number",
                        "multipleOf": 2,
                    },
                    {
                        "type": "number",
                        "multipleOf": 7,
                    },
                ],
            }),
            json!({
                "anyOf": [
                    {
                        "type": "number",
                        "multipleOf": 3,
                    },
                    {
                        "type": "number",
                        "multipleOf": 5,
                    },
                ],
            }),
        ];
        check_schema_intersection(schemas.clone(), schemas);
    }

    #[test]
    fn intersect_multi_variant_without_remainder() {
        check_schema_intersection(
            [
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "minimum": 2,
                            "description": "A1",
                        },
                        {
                            "type": "number",
                            "minimum": 5,
                        },
                    ],
                }),
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "maximum": 10,
                            "description": "B1",
                        },
                        {
                            "type": "number",
                            "maximum": 15,
                            "description": "B2",
                        },
                    ],
                }),
            ],
            [json!({
                "anyOf": [
                    {
                        "type": "number",
                        "minimum": 2,
                        "maximum": 10,
                        "description": "A1",
                    },
                    {
                        "type": "number",
                        "minimum": 2,
                        "maximum": 15,
                        "description": "A1",
                    },
                    {
                        "type": "number",
                        "minimum": 5,
                        "maximum": 10,
                        "description": "B1",
                    },
                    {
                        "type": "number",
                        "minimum": 5,
                        "maximum": 15,
                        "description": "B2",
                    },
                ],
            })],
        );
    }

    #[test]
    fn intersect_results_in_empty() {
        check_schema_intersection_error(
            [
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "minimum": 3,
                        },
                        {
                            "type": "number",
                            "minimum": 4,
                        },
                    ],
                }),
                json!({
                    "anyOf": [
                        {
                            "type": "number",
                            "maximum": 1,
                        },
                        {
                            "type": "number",
                            "maximum": 2,
                        },
                    ],
                }),
            ],
            [
                ResolveClosedDataTypeError::EmptyAnyOf,
                ResolveClosedDataTypeError::UnsatisfiableConstraint(
                    from_value(json!({
                        "type": "number",
                        "minimum": 3,
                        "maximum": 1,
                    }))
                    .expect("Failed to parse schema"),
                ),
                ResolveClosedDataTypeError::UnsatisfiableConstraint(
                    from_value(json!({
                        "type": "number",
                        "minimum": 4,
                        "maximum": 1,
                    }))
                    .expect("Failed to parse schema"),
                ),
                ResolveClosedDataTypeError::UnsatisfiableConstraint(
                    from_value(json!({
                        "type": "number",
                        "minimum": 3,
                        "maximum": 2,
                    }))
                    .expect("Failed to parse schema"),
                ),
                ResolveClosedDataTypeError::UnsatisfiableConstraint(
                    from_value(json!({
                        "type": "number",
                        "minimum": 4,
                        "maximum": 2,
                    }))
                    .expect("Failed to parse schema"),
                ),
            ],
        );
    }
}
