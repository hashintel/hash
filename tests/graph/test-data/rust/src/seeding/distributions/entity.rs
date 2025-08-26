use alloc::borrow::Cow;
use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use rand::Rng;
use rand_distr::{Bernoulli, Distribution};
use type_system::{
    knowledge::property::PropertyObject,
    ontology::{
        BaseUrl,
        entity_type::{ClosedEntityType, schema::EntityConstraints},
        property_type::schema::{PropertyTypeReference, ValueOrArray},
    },
};

use super::property::PropertyDistributionRegistry;

#[derive(Debug, derive_more::Display)]
pub enum EntityDistributionCreationError {
    #[display("Unknown required property `{_0}`")]
    UnknownRequiredProperty(BaseUrl),
}

impl Error for EntityDistributionCreationError {}

struct EntityPropertyDistribution<'a> {
    probability: Bernoulli,
    property_type: Cow<'a, PropertyTypeReference>,
}

fn create_probability(required: bool) -> Bernoulli {
    let probability_value = if required { 1.0 } else { 0.5 };

    Bernoulli::new(probability_value).unwrap_or_else(|error| {
        unreachable!("Bernoulli distribution should always be able to be created: {error}")
    })
}

pub struct EntityDistribution<'a> {
    properties: Vec<EntityPropertyDistribution<'a>>,
}

pub struct BoundEntityDistribution<'a, P> {
    distribution: EntityDistribution<'a>,
    properties: P,
}

impl<'p> EntityDistribution<'p> {
    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn from_constraints(constraints: EntityConstraints) -> Self {
        let properties = constraints.properties.into_iter().map(|(base_url, property_type_ref)| {
            match property_type_ref {
                ValueOrArray::Value(property_type_reference) => {
                    EntityPropertyDistribution {
                        probability: create_probability(constraints.required.contains(&base_url)),
                        property_type: Cow::Owned(property_type_reference),
                    }
                }
                ValueOrArray::Array(_) => todo!("https://linear.app/hash/issue/H-5256/support-arrays-in-entity-and-entity-type-generation"),
            }
        }).collect();

        Self { properties }
    }

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn from_constraints_ref(constraints: &'p EntityConstraints) -> Self {
        let properties = constraints.properties.iter().map(|(base_url, property_type_ref)| {
            match property_type_ref {
                ValueOrArray::Value(property_type_reference) => {
                    EntityPropertyDistribution {
                        probability: create_probability(constraints.required.contains(base_url)),
                        property_type: Cow::Borrowed(property_type_reference),
                    }
                }
                ValueOrArray::Array(_) => todo!("https://linear.app/hash/issue/H-5256/support-arrays-in-entity-and-entity-type-generation"),
            }
        }).collect();

        Self { properties }
    }

    pub fn new(entity_type: impl Into<Cow<'p, ClosedEntityType>>) -> Self {
        match entity_type.into() {
            Cow::Borrowed(entity_type) => Self::from_constraints_ref(&entity_type.constraints),
            Cow::Owned(entity_type) => Self::from_constraints(entity_type.constraints),
        }
    }

    pub const fn bind<P>(self, properties: P) -> BoundEntityDistribution<'p, P> {
        BoundEntityDistribution {
            distribution: self,
            properties,
        }
    }
}

#[derive(Debug, derive_more::Display)]
pub enum EntityDistributionError {
    #[display("Missing property distribution `{}`", _0.url)]
    MissingPropertyDistribution(PropertyTypeReference),
    #[display("Property generation failed")]
    PropertyGenerationFailed,
}

impl Error for EntityDistributionError {}

impl<P> Distribution<Result<PropertyObject, Report<[EntityDistributionError]>>>
    for BoundEntityDistribution<'_, P>
where
    P: PropertyDistributionRegistry,
{
    fn sample<R: Rng + ?Sized>(
        &self,
        rng: &mut R,
    ) -> Result<PropertyObject, Report<[EntityDistributionError]>> {
        Ok(PropertyObject::new(
            self.distribution
                .properties
                .iter()
                .filter_map(|property_distribution| {
                    if !property_distribution.probability.sample(rng) {
                        return None;
                    }

                    let Some(bound_property_distribution) = self
                        .properties
                        .get_distribution(&property_distribution.property_type.url)
                    else {
                        return Some(Err(Report::new(
                            EntityDistributionError::MissingPropertyDistribution(
                                property_distribution.property_type.clone().into_owned(),
                            ),
                        )));
                    };

                    Some(
                        bound_property_distribution
                            .sample(rng)
                            .map(|property| {
                                (
                                    property_distribution.property_type.url.base_url.clone(),
                                    property,
                                )
                            })
                            .change_context(EntityDistributionError::PropertyGenerationFailed),
                    )
                })
                .try_collect_reports()?,
        ))
    }
}
