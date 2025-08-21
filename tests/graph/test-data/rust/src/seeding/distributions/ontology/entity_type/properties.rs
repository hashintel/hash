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

use crate::seeding::producer::entity_type::PropertyTypeCatalog;

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
                if catalog.is_empty() {
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
                if catalog.is_empty() {
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
            } => generate_properties(catalog, *count, *required, rng),
            Self::Range {
                catalog,
                min,
                max,
                required,
            } => {
                let count = rng.random_range(*min..=*max);
                generate_properties(catalog, count, *required, rng)
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
) -> (
    HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    HashSet<BaseUrl>,
) {
    let mut properties = HashMap::new();
    let mut required_properties = HashSet::new();

    for _ in 0..count {
        let property_type_ref = catalog.sample_property_type(rng);

        // Use the PropertyType's base URL as the property key
        let property_base_url = property_type_ref.url.base_url.clone();

        // Create the property value - just reference the PropertyType directly
        let property_value = ValueOrArray::Value(property_type_ref.clone());

        properties.insert(property_base_url, property_value);

        if required {
            required_properties.insert(property_type_ref.url.base_url.clone());
        }
    }

    (properties, required_properties)
}

/// In-memory implementation of [`PropertyTypeCatalog`] for testing and benchmarking.
#[derive(Debug, Clone)]
pub struct InMemoryPropertyTypeCatalog {
    property_types: Vec<PropertyTypeReference>,
}

#[derive(Debug, derive_more::Display)]
#[display("Empty PropertyType collection")]
pub struct EmptyPropertyTypeCatalogError;

impl Error for EmptyPropertyTypeCatalogError {}

impl InMemoryPropertyTypeCatalog {
    /// Create a new [`PropertyTypeCatalog`] from a collection of [`PropertyTypeReference`]s.
    ///
    /// [`PropertyType`]: type_system::ontology::property_type::PropertyType
    ///
    /// # Errors
    ///
    /// Returns an error if the collection is empty, as empty catalogs cannot be used
    /// for sampling.
    pub fn new(
        property_types: Vec<PropertyTypeReference>,
    ) -> Result<Self, Report<[EmptyPropertyTypeCatalogError]>> {
        if property_types.is_empty() {
            return Err(Report::new(EmptyPropertyTypeCatalogError).expand());
        }

        Ok(Self { property_types })
    }
}

impl PropertyTypeCatalog for InMemoryPropertyTypeCatalog {
    fn property_type_references(&self) -> &[PropertyTypeReference] {
        &self.property_types
    }
}

#[cfg(test)]
mod tests {
    use type_system::ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion};

    use super::*;

    fn test_property_types() -> Vec<PropertyTypeReference> {
        vec![
            PropertyTypeReference {
                url: VersionedUrl {
                    base_url: BaseUrl::new(
                        "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
                            .to_owned(),
                    )
                    .expect("should parse a base URL"),
                    version: OntologyTypeVersion::new(1),
                },
            },
            PropertyTypeReference {
                url: VersionedUrl {
                    base_url: BaseUrl::new(
                        "https://blockprotocol.org/@blockprotocol/types/property-type/description/"
                            .to_owned(),
                    )
                    .expect("should parse a base URL"),
                    version: OntologyTypeVersion::new(1),
                },
            },
            PropertyTypeReference {
                url: VersionedUrl {
                    base_url: BaseUrl::new(
                        "https://blockprotocol.org/@blockprotocol/types/property-type/age/"
                            .to_owned(),
                    )
                    .expect("should parse a base URL"),
                    version: OntologyTypeVersion::new(1),
                },
            },
        ]
    }

    #[test]
    fn fixed_properties_generation() {
        let catalog =
            InMemoryPropertyTypeCatalog::new(test_property_types()).expect("should create catalog");
        let config = EntityTypePropertiesDistributionConfig::Fixed {
            count: 2,
            required: true,
        };

        let distribution = config.bind(&catalog).expect("should bind successfully");
        let mut rng = rand::rng();

        let (properties, required) = distribution.sample(&mut rng);
        assert_eq!(properties.len(), 2);

        // Check that properties have the expected structure - should be PropertyTypeReferences
        for (key, value) in properties {
            match value {
                ValueOrArray::Value(property_ref) => {
                    assert!(
                        property_ref
                            .url
                            .base_url
                            .as_str()
                            .contains("blockprotocol.org")
                    );
                }
                ValueOrArray::Array(_) => panic!("Expected single value, not array"),
            }
            assert!(required.contains(&key));
        }
    }

    #[test]
    fn range_properties_generation() {
        let catalog =
            InMemoryPropertyTypeCatalog::new(test_property_types()).expect("should create catalog");
        let config = EntityTypePropertiesDistributionConfig::Range {
            min: 2,
            max: 4,
            required: false,
        };

        let distribution = config.bind(&catalog).expect("should bind successfully");
        let mut rng = rand::rng();

        let (properties, required) = distribution.sample(&mut rng);
        assert!(required.is_empty());
        assert!(properties.len() >= 2 && properties.len() <= 4);

        // Check that properties are PropertyTypeReferences
        for value in properties.values() {
            match value {
                ValueOrArray::Value(property_ref) => {
                    assert!(
                        property_ref
                            .url
                            .base_url
                            .as_str()
                            .contains("blockprotocol.org")
                    );
                }
                ValueOrArray::Array(_) => panic!("Expected single value, not array"),
            }
        }
    }

    #[test]
    fn empty_properties_generation() {
        let config = EntityTypePropertiesDistributionConfig::Empty;
        let catalog =
            InMemoryPropertyTypeCatalog::new(test_property_types()).expect("should create catalog");

        let distribution = config.bind(&catalog).expect("should bind successfully");
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
        let catalog =
            InMemoryPropertyTypeCatalog::new(test_property_types()).expect("should create catalog");
        let config = EntityTypePropertiesDistributionConfig::Range {
            min: 5,
            max: 2,
            required: true,
        };

        let result = config.bind(&catalog);
        let _: Report<_> = result.expect_err("should error on invalid range");
    }
}
