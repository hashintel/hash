//! Distributions for generating [`EntityType`] properties structures.
//!
//! This module provides configurable distributions for generating properties maps for
//! [`EntityType`]s. Properties are key-value mappings where keys are property names and values
//! reference [`PropertyType`]s.
//!
//! The core design uses a two-phase approach:
//! 1. **Configuration Phase**: JSON-serializable config objects define the structure
//! 2. **Binding Phase**: Configs are bound to [`PropertyType`] catalogs to create distributions
//!
//! [`PropertyType`]: type_system::ontology::property_type::PropertyType
//! [`EntityType`]: type_system::ontology::entity_type::EntityType

use core::error::Error;
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use rand::{Rng, distr::Distribution};
use type_system::ontology::{
    BaseUrl,
    property_type::schema::{PropertyTypeReference, ValueOrArray},
};

use crate::seeding::producer::property_type::PropertyTypeCatalog;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EntityTypePropertiesDistributionConfig {
    Fixed {
        count: usize,
        required: bool,
    },
    Range {
        min: usize,
        max: usize,
        required: bool,
    },
    Empty,
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid properties distribution")]
pub enum EntityTypePropertiesBindingError {
    #[display("Empty PropertyType catalog")]
    EmptyPropertyTypeCatalog,
    #[display("Invalid range: min ({min}) > max ({max})")]
    InvalidRange { min: usize, max: usize },
    #[display("Weighted distribution error")]
    WeightedDistribution,
}

impl Error for EntityTypePropertiesBindingError {}

impl EntityTypePropertiesDistributionConfig {
    /// Bind this configuration to a [`PropertyType`] catalog to create a distribution.
    ///
    /// [`PropertyType`]: type_system::ontology::property_type::PropertyType
    ///
    /// # Errors
    ///
    /// Returns an error if the catalog is empty or if the configuration is invalid.
    pub fn bind<C: PropertyTypeCatalog>(
        &self,
        catalog: C,
    ) -> Result<BoundEntityTypePropertiesDistribution<C>, Report<[EntityTypePropertiesBindingError]>>
    {
        match self {
            Self::Fixed { count, required } => {
                if *count == 0 {
                    return Ok(BoundEntityTypePropertiesDistribution::Empty);
                }
                if catalog.property_type_references().is_empty() {
                    return Err(Report::new(
                        EntityTypePropertiesBindingError::EmptyPropertyTypeCatalog,
                    )
                    .expand());
                }
                Ok(BoundEntityTypePropertiesDistribution::Fixed {
                    catalog,
                    count: *count,
                    required: *required,
                })
            }
            Self::Range { min, max, required } => {
                if *min == 0 && *max == 0 {
                    return Ok(BoundEntityTypePropertiesDistribution::Empty);
                }
                if catalog.property_type_references().is_empty() {
                    return Err(Report::new(
                        EntityTypePropertiesBindingError::EmptyPropertyTypeCatalog,
                    )
                    .expand());
                }
                if min > max {
                    return Err(Report::new(EntityTypePropertiesBindingError::InvalidRange {
                        min: *min,
                        max: *max,
                    })
                    .expand());
                }
                Ok(BoundEntityTypePropertiesDistribution::Range {
                    catalog,
                    min: *min,
                    max: *max,
                    required: *required,
                })
            }
            Self::Empty => Ok(BoundEntityTypePropertiesDistribution::Empty),
        }
    }
}

/// A distribution bound to a specific [`PropertyType`] catalog for generating properties.
///
/// [`PropertyType`]: type_system::ontology::property_type::PropertyType
#[derive(Debug)]
pub enum BoundEntityTypePropertiesDistribution<C: PropertyTypeCatalog> {
    Fixed {
        catalog: C,
        count: usize,
        required: bool,
    },
    Range {
        catalog: C,
        min: usize,
        max: usize,
        required: bool,
    },
    Empty,
}

impl<C: PropertyTypeCatalog>
    Distribution<(
        HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
        HashSet<BaseUrl>,
    )> for BoundEntityTypePropertiesDistribution<C>
{
    fn sample<R: Rng + ?Sized>(
        &self,
        rng: &mut R,
    ) -> (
        HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
        HashSet<BaseUrl>,
    ) {
        match self {
            Self::Fixed {
                catalog,
                count,
                required,
            } => generate_properties(catalog, *count, *required, rng, 10),
            Self::Range {
                catalog,
                min,
                max,
                required,
            } => {
                let count = rng.random_range(*min..=*max);
                generate_properties(catalog, count, *required, rng, 10)
            }
            Self::Empty => (HashMap::new(), HashSet::new()),
        }
    }
}

/// Generate a properties map with the specified number of properties and required status.
fn generate_properties<R: Rng + ?Sized, C: PropertyTypeCatalog>(
    catalog: &C,
    count: usize,
    required: bool,
    rng: &mut R,
    max_attempts: usize,
) -> (
    HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    HashSet<BaseUrl>,
) {
    let mut properties = HashMap::new();
    let mut required_properties = HashSet::new();

    while properties.len() < count {
        let mut attempts = 0;
        while attempts < max_attempts {
            attempts += 1;
            let property_type_ref = catalog.sample_property_type(rng);
            if properties.contains_key(&property_type_ref.url.base_url) {
                continue;
            }

            // Use the PropertyType's base URL as the property key
            let property_base_url = property_type_ref.url.base_url.clone();

            // Create the property value - just reference the PropertyType directly
            let property_value = ValueOrArray::Value(property_type_ref.clone());

            properties.insert(property_base_url, property_value);

            if required {
                required_properties.insert(property_type_ref.url.base_url.clone());
            }

            break;
        }
        if attempts == max_attempts {
            break;
        }
    }

    (properties, required_properties)
}

#[cfg(test)]
pub(crate) mod tests {

    use super::*;
    use crate::seeding::producer::property_type::tests::create_test_property_type_catalog;

    #[test]
    fn fixed_properties_generation() {
        let config = EntityTypePropertiesDistributionConfig::Fixed {
            count: 1,
            required: true,
        };

        let distribution = config
            .bind(create_test_property_type_catalog())
            .expect("should bind successfully");
        let mut rng = rand::rng();

        let (properties, required) = distribution.sample(&mut rng);
        assert_eq!(properties.len(), 1);
        assert_eq!(required.len(), 1);
    }

    #[test]
    fn range_properties_generation() {
        let config = EntityTypePropertiesDistributionConfig::Range {
            min: 1,
            max: 3,
            required: false,
        };

        let distribution = config
            .bind(create_test_property_type_catalog())
            .expect("should bind successfully");
        let mut rng = rand::rng();

        let (properties, required) = distribution.sample(&mut rng);
        assert!(required.is_empty());
        assert!(!properties.is_empty() && properties.len() <= 3);
    }

    #[test]
    fn empty_properties_generation() {
        let config = EntityTypePropertiesDistributionConfig::Empty;

        let distribution = config
            .bind(create_test_property_type_catalog())
            .expect("should bind successfully");
        let mut rng = rand::rng();

        let (properties, required) = distribution.sample(&mut rng);
        assert!(properties.is_empty());
        assert!(required.is_empty());
    }

    #[test]
    fn empty_catalog_error() {
        // Create a mock empty catalog for testing
        #[derive(Debug)]
        struct EmptyTestCatalog;
        impl PropertyTypeCatalog for EmptyTestCatalog {
            fn property_type_references(&self) -> &[PropertyTypeReference] {
                &[]
            }

            fn sample_property_type<R: rand::Rng + ?Sized>(
                &self,
                _rng: &mut R,
            ) -> &PropertyTypeReference {
                panic!("Empty catalog cannot sample property types")
            }
        }

        let config = EntityTypePropertiesDistributionConfig::Fixed {
            count: 1,
            required: true,
        };

        let empty_catalog = EmptyTestCatalog;
        let result = config.bind(&empty_catalog);

        let _: Report<_> = result.expect_err("should error");
    }

    #[test]
    fn invalid_range_error() {
        let config = EntityTypePropertiesDistributionConfig::Range {
            min: 5,
            max: 2,
            required: true,
        };

        let result = config.bind(create_test_property_type_catalog());
        let _: Report<_> = result.expect_err("should error on invalid range");
    }
}
