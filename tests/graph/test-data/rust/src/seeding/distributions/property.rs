use alloc::borrow::Cow;
use core::error::Error;

use error_stack::{Report, TryReportIteratorExt as _};
use rand::{Rng, seq::IndexedRandom as _};
use rand_distr::Distribution;
use type_system::{
    knowledge::Property,
    ontology::{
        VersionedUrl,
        data_type::schema::DataTypeReference,
        property_type::{PropertyType, schema::PropertyValues},
    },
};

use super::value::ValueDistributionRegistry;

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
    /// Create a new `PropertyDistribution` from a `PropertyType`.
    ///
    /// # Errors
    ///
    /// Returns an error if the `PropertyType` is empty.
    pub fn new(
        property_type: impl Into<Cow<'p, PropertyType>>,
    ) -> Result<Self, Report<[PropertyDistributionCreationError]>> {
        let property_type = property_type.into();

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
