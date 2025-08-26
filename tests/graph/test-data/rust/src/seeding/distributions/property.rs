use alloc::borrow::Cow;
use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use rand::{Rng, seq::IndexedRandom as _};
use rand_distr::{Bernoulli, Distribution};
use type_system::{
    knowledge::{Property, property::PropertyObject},
    ontology::{
        VersionedUrl,
        data_type::schema::DataTypeReference,
        entity_type::{ClosedEntityType, schema::EntityConstraints},
        property_type::{
            PropertyType,
            schema::{PropertyTypeReference, PropertyValues, ValueOrArray},
        },
    },
};

use super::value::ValueDistributionRegistry;

struct PropertyObjectPropertyDistribution<'a> {
    probability: Bernoulli,
    property_type: Cow<'a, PropertyTypeReference>,
}

impl<'a> PropertyObjectPropertyDistribution<'a> {
    fn new(property_type: Cow<'a, PropertyTypeReference>, required: bool) -> Self {
        Self {
            probability: Bernoulli::new(if required { 1.0 } else { 0.5 }).unwrap_or_else(|error| {
                unreachable!("Bernoulli distribution should always be able to be created: {error}")
            }),
            property_type,
        }
    }
}

pub struct PropertyObjectDistribution<'a> {
    properties: Vec<PropertyObjectPropertyDistribution<'a>>,
}

enum InnerPropertyDistribution<'c> {
    Value(Cow<'c, DataTypeReference>),
}

#[derive(Debug, derive_more::Display)]
pub enum PropertyDistributionCreationError {
    #[display("`oneOf` is empty")]
    EmptyOneOf,
}

impl Error for PropertyDistributionCreationError {}

impl TryFrom<PropertyValues> for InnerPropertyDistribution<'_> {
    type Error = Report<PropertyDistributionCreationError>;

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn try_from(values: PropertyValues) -> Result<Self, Self::Error> {
        match values {
            PropertyValues::Value(value) => Ok(Self::Value(Cow::Owned(value))),
            PropertyValues::Array(_) => {
                todo!("https://linear.app/hash/issue/H-5242/support-property-seeding-for-arrays")
            }
            PropertyValues::Object(_) => {
                todo!("https://linear.app/hash/issue/H-5243/support-property-seeding-for-objects")
            }
        }
    }
}

impl<'c> TryFrom<&'c PropertyValues> for InnerPropertyDistribution<'c> {
    type Error = Report<PropertyDistributionCreationError>;

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn try_from(values: &'c PropertyValues) -> Result<Self, Self::Error> {
        match values {
            PropertyValues::Value(value) => Ok(Self::Value(Cow::Borrowed(value))),
            PropertyValues::Array(_) => {
                todo!("https://linear.app/hash/issue/H-5242/support-property-seeding-for-arrays")
            }
            PropertyValues::Object(_) => {
                todo!("https://linear.app/hash/issue/H-5243/support-property-seeding-for-objects")
            }
        }
    }
}

pub struct PropertyDistribution<'p> {
    property: Vec<InnerPropertyDistribution<'p>>,
}

pub struct BoundPropertyDistribution<'p, V> {
    distribution: PropertyDistribution<'p>,
    values: V,
}

impl<'p> PropertyDistribution<'p> {
    fn new(
        property_type: Cow<'p, PropertyType>,
    ) -> Result<Self, Report<[PropertyDistributionCreationError]>> {
        if property_type.one_of.is_empty() {
            return Err(Report::new(PropertyDistributionCreationError::EmptyOneOf).expand());
        }

        let property = match property_type {
            Cow::Borrowed(property_type) => property_type
                .one_of
                .iter()
                .map(InnerPropertyDistribution::try_from)
                .try_collect_reports()?,
            Cow::Owned(property_type) => property_type
                .one_of
                .into_iter()
                .map(InnerPropertyDistribution::try_from)
                .try_collect_reports()?,
        };

        Ok(Self { property })
    }

    pub const fn bind<V>(self, values: V) -> BoundPropertyDistribution<'p, V> {
        BoundPropertyDistribution {
            distribution: self,
            values,
        }
    }
}

impl TryFrom<PropertyType> for PropertyDistribution<'_> {
    type Error = Report<[PropertyDistributionCreationError]>;

    fn try_from(property_type: PropertyType) -> Result<Self, Self::Error> {
        Self::new(Cow::Owned(property_type))
    }
}

impl<'p> TryFrom<&'p PropertyType> for PropertyDistribution<'p> {
    type Error = Report<[PropertyDistributionCreationError]>;

    fn try_from(property_type: &'p PropertyType) -> Result<Self, Self::Error> {
        Self::new(Cow::Borrowed(property_type))
    }
}

#[derive(Debug, derive_more::Display)]
pub enum PropertyDistributionError {
    #[display("Missing value distribution `{}`", _0.url)]
    MissingValueDistribution(DataTypeReference),
}

impl Error for PropertyDistributionError {}

impl<V> Distribution<Result<Property, Report<PropertyDistributionError>>>
    for BoundPropertyDistribution<'_, V>
where
    V: ValueDistributionRegistry,
{
    fn sample<R: Rng + ?Sized>(
        &self,
        rng: &mut R,
    ) -> Result<Property, Report<PropertyDistributionError>> {
        let property = self.distribution.property.choose(rng).unwrap_or_else(|| {
            unreachable!("`PropertyDistribution` should always have at least one property")
        });

        match property {
            InnerPropertyDistribution::Value(value) => {
                let value_distribution =
                    self.values.get_distribution(&value.url).ok_or_else(|| {
                        Report::new(PropertyDistributionError::MissingValueDistribution(
                            value.clone().into_owned(),
                        ))
                    })?;
                Ok(Property::Value(value_distribution.sample(rng)))
            }
        }
    }
}

pub trait PropertyDistributionRegistry {
    type ValueDistributionRegistry: ValueDistributionRegistry;

    fn get_distribution(
        &self,
        url: &VersionedUrl,
    ) -> Option<BoundPropertyDistribution<'_, Self::ValueDistributionRegistry>>;
}

pub struct BoundPropertyObjectDistribution<'a, P> {
    distribution: PropertyObjectDistribution<'a>,
    properties: P,
}

impl<'p> PropertyObjectDistribution<'p> {
    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn from_constraints(constraints: EntityConstraints) -> Self {
        let properties = constraints.properties.into_iter().map(|(base_url, property_type_ref)| {
            match property_type_ref {
                ValueOrArray::Value(property_type_reference) => {
                    PropertyObjectPropertyDistribution::new(Cow::Owned(property_type_reference), constraints.required.contains(&base_url))
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
                    PropertyObjectPropertyDistribution::new(Cow::Borrowed(property_type_reference), constraints.required.contains(base_url))
                }
                ValueOrArray::Array(_) => todo!("https://linear.app/hash/issue/H-5256/support-arrays-in-entity-and-entity-type-generation"),
            }
        }).collect();

        Self { properties }
    }

    pub const fn bind<P>(self, properties: P) -> BoundPropertyObjectDistribution<'p, P> {
        BoundPropertyObjectDistribution {
            distribution: self,
            properties,
        }
    }
}

impl From<ClosedEntityType> for PropertyObjectDistribution<'_> {
    fn from(entity_type: ClosedEntityType) -> Self {
        Self::from_constraints(entity_type.constraints)
    }
}

impl<'p> From<&'p ClosedEntityType> for PropertyObjectDistribution<'p> {
    fn from(entity_type: &'p ClosedEntityType) -> Self {
        Self::from_constraints_ref(&entity_type.constraints)
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
    for BoundPropertyObjectDistribution<'_, P>
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
