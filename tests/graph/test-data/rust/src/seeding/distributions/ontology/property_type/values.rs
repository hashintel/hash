//! Distributions for generating `PropertyValues` structures.
//!
//! This module provides configurable distributions for generating [`PropertyValues`] that can
//! represent different value structures:
//!
//! - Simple data type references (currently implemented)
//! - Array structures (TODO: not yet implemented)
//! - Object structures with nested properties (TODO: not yet implemented)
//!
//! The core design uses a two-phase approach:
//! 1. **Configuration Phase**: JSON-serializable config objects define the structure
//! 2. **Binding Phase**: Configs are bound to actual catalogs/references to create distributions

use core::error::Error;

use error_stack::{Report, TryReportIteratorExt as _};
use rand::{
    Rng,
    distr::{Distribution, weighted::WeightedIndex},
    prelude::IndexedRandom as _,
};
use type_system::ontology::{
    data_type::schema::DataTypeReference, property_type::schema::PropertyValues,
};

use crate::seeding::distributions::adaptors::DistributionWeight;

/// Configuration for generating [`PropertyValues`] distributions.
///
/// This enum allows configuring different sampling strategies for property value structures.
/// Currently supports simple data type references, with placeholders for arrays and objects.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PropertyValuesDistributionConfig {
    /// Weighted selection between different property value types.
    Weighted {
        weights: Vec<DistributionWeight<PropertyValueTypeConfig>>,
    },
    /// Uniform selection between different property value types.
    Uniform { types: Vec<PropertyValueTypeConfig> },
    /// Always return the same property value type.
    Const { value: PropertyValueTypeConfig },
}

/// Configuration for different types of property value structures.
///
/// Represents the possible structural types that a property can have:
/// - Simple values (data type references)
/// - Arrays of values (TODO: not implemented)
/// - Objects with nested properties (TODO: not implemented)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PropertyValueTypeConfig {
    /// A simple data type reference.
    ///
    /// This will be resolved to an actual [`DataTypeReference`] during the binding phase
    /// based on the available data types in the catalog.
    Value,

    /// An array of property values.
    ///
    /// TODO: Not yet implemented. When implemented, this will contain configuration
    /// for the array item types.
    Array,

    /// An object with nested property structures.
    ///
    /// TODO: Not yet implemented. When implemented, this will contain configuration
    /// for the nested property type references.
    Object,
}

/// Catalog of available data types for binding property value configurations.
///
/// This trait provides access to available data type references that can be used
/// when resolving [`PropertyValueTypeConfig::Value`] configurations.
pub trait DataTypeCatalog {
    /// Returns all available data type references in this catalog.
    fn data_type_references(&self) -> &[DataTypeReference];

    /// Returns true if the catalog contains any data type references.
    fn is_empty(&self) -> bool {
        self.data_type_references().is_empty()
    }

    /// Sample a data type reference from the catalog.
    ///
    /// This method decides how to select a data type from the available options,
    /// allowing different catalog implementations to use different sampling strategies.
    ///
    /// # Panics
    ///
    /// May panic if the catalog is empty. Callers should check [`is_empty`] first.
    ///
    /// [`is_emtpy`]: Self::is_empty
    fn sample_data_type<R: Rng + ?Sized>(&self, rng: &mut R) -> &DataTypeReference;
}

/// Simple in-memory implementation of [`DataTypeCatalog`].
#[derive(Debug, Clone)]
pub struct InMemoryDataTypeCatalog {
    data_types: Vec<DataTypeReference>,
}

impl InMemoryDataTypeCatalog {
    /// Create a new catalog from a collection of data type references.
    ///
    /// # Errors
    ///
    /// Returns an error if the catalog is empty.
    pub fn new(data_types: Vec<DataTypeReference>) -> Result<Self, PropertyValuesBindingError> {
        if data_types.is_empty() {
            return Err(PropertyValuesBindingError::EmptyCatalog);
        }

        Ok(Self { data_types })
    }
}

impl DataTypeCatalog for InMemoryDataTypeCatalog {
    fn data_type_references(&self) -> &[DataTypeReference] {
        &self.data_types
    }

    fn sample_data_type<R: Rng + ?Sized>(&self, rng: &mut R) -> &DataTypeReference {
        // Uniform selection from available data types using SliceRandom::choose
        self.data_types
            .choose(rng)
            .expect("catalog should not be empty")
    }
}

/// Distribution that has been bound to a specific data type catalog.
///
/// This is the result of calling [`PropertyValuesDistributionConfig::bind`] and can
/// be used to sample actual [`PropertyValues`].
#[derive(Debug)]
pub enum BoundPropertyValuesDistribution<'a, C: DataTypeCatalog> {
    /// Weighted selection between bound property value types.
    Weighted {
        index: WeightedIndex<u32>,
        types: Vec<BoundPropertyValueType>,
        catalog: &'a C,
    },
    /// Uniform selection between bound property value types.
    Uniform {
        types: Vec<BoundPropertyValueType>,
        catalog: &'a C,
    },
    /// Always return the same bound property value type.
    Const {
        value_type: BoundPropertyValueType,
        catalog: &'a C,
    },
}

/// A property value type that has been bound and validated.
#[derive(Debug, Clone)]
pub enum BoundPropertyValueType {
    /// A data type reference that will be sampled from the catalog at generation time.
    Value,

    /// Array type (not yet implemented).
    Array,

    /// Object type (not yet implemented).
    Object,
}

/// Errors that can occur during binding of property values configuration.
#[derive(Debug, derive_more::Display)]
pub enum PropertyValuesBindingError {
    #[display("Data type catalog is empty - cannot bind Value types")]
    EmptyCatalog,

    #[display("No property value types configured")]
    NoTypes,

    #[display("Invalid weights for weighted distribution")]
    InvalidWeights,

    #[display("Array property value types are not yet implemented")]
    ArrayNotImplemented,

    #[display("Object property value types are not yet implemented")]
    ObjectNotImplemented,
}

impl Error for PropertyValuesBindingError {}

impl PropertyValuesDistributionConfig {
    /// Bind this configuration to a data type catalog to create a usable distribution.
    ///
    /// # Arguments
    ///
    /// * `catalog` - The catalog of available data types for resolving references
    ///
    /// # Returns
    ///
    /// A [`BoundPropertyValuesDistribution`] that can sample [`PropertyValues`], or an error
    /// if binding fails.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The catalog is empty but Value types are configured
    /// - No property value types are configured
    /// - Invalid weights are provided for weighted distributions
    /// - Array or Object types are configured (not yet implemented)
    pub fn bind<'a, C: DataTypeCatalog>(
        &self,
        catalog: &'a C,
    ) -> Result<BoundPropertyValuesDistribution<'a, C>, Report<[PropertyValuesBindingError]>> {
        match self {
            Self::Weighted { weights } => {
                if weights.is_empty() {
                    return Err(Report::<[PropertyValuesBindingError]>::from(Report::new(
                        PropertyValuesBindingError::NoTypes,
                    )));
                }

                let (weight_values, bound_types): (Vec<_>, Vec<_>) = weights
                    .iter()
                    .map(|weight| {
                        bind_property_value_type_config(&weight.distribution, catalog)
                            .map(|bound| (weight.weight, bound))
                    })
                    .try_collect_reports()?;

                let index = WeightedIndex::new(weight_values).map_err(|error| {
                    let single_error =
                        Report::new(PropertyValuesBindingError::InvalidWeights).attach(error);
                    Report::<[PropertyValuesBindingError]>::from(single_error)
                })?;

                Ok(BoundPropertyValuesDistribution::Weighted {
                    index,
                    types: bound_types,
                    catalog,
                })
            }
            Self::Uniform { types } => {
                if types.is_empty() {
                    return Err(Report::<[PropertyValuesBindingError]>::from(Report::new(
                        PropertyValuesBindingError::NoTypes,
                    )));
                }

                let bound_types = types
                    .iter()
                    .map(|config| bind_property_value_type_config(config, catalog))
                    .try_collect_reports()?;

                Ok(BoundPropertyValuesDistribution::Uniform {
                    types: bound_types,
                    catalog,
                })
            }
            Self::Const { value } => {
                let bound_type = bind_property_value_type_config(value, catalog)?;

                Ok(BoundPropertyValuesDistribution::Const {
                    value_type: bound_type,
                    catalog,
                })
            }
        }
    }
}

/// Bind a single property value type configuration to actual references.
fn bind_property_value_type_config<C: DataTypeCatalog>(
    config: &PropertyValueTypeConfig,
    catalog: &C,
) -> Result<BoundPropertyValueType, Report<PropertyValuesBindingError>> {
    match config {
        PropertyValueTypeConfig::Value => {
            if catalog.is_empty() {
                return Err(Report::new(PropertyValuesBindingError::EmptyCatalog));
            }

            // We don't select a specific data type here - that happens at sample time
            // using the catalog's sample_data_type method. This allows the catalog
            // to decide the sampling strategy (uniform, weighted, etc.)
            Ok(BoundPropertyValueType::Value)
        }
        PropertyValueTypeConfig::Array => {
            Err(Report::new(PropertyValuesBindingError::ArrayNotImplemented))
        }
        PropertyValueTypeConfig::Object => Err(Report::new(
            PropertyValuesBindingError::ObjectNotImplemented,
        )),
    }
}

impl<C: DataTypeCatalog> Distribution<PropertyValues> for BoundPropertyValuesDistribution<'_, C> {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> PropertyValues {
        let bound_type = match self {
            Self::Weighted { index, types, .. } => {
                let idx = index.sample(rng);
                types
                    .get(idx)
                    .expect("should have valid index from WeightedIndex")
            }
            Self::Uniform { types, .. } => types.choose(rng).expect("types should not be empty"),
            Self::Const { value_type, .. } => value_type,
        };

        match bound_type {
            BoundPropertyValueType::Value => {
                // Sample a data type from the catalog at generation time
                let catalog = match self {
                    Self::Weighted { catalog, .. }
                    | Self::Uniform { catalog, .. }
                    | Self::Const { catalog, .. } => catalog,
                };
                let data_type_ref = catalog.sample_data_type(rng);
                // TODO: Consider using Arc<DataTypeReference> to avoid cloning in hot path
                PropertyValues::Value(data_type_ref.clone())
            }
            #[expect(clippy::todo)]
            BoundPropertyValueType::Array => {
                todo!("Array PropertyValues not yet implemented")
            }
            #[expect(clippy::todo)]
            BoundPropertyValueType::Object => {
                todo!("Object PropertyValues not yet implemented")
            }
        }
    }
}

// For now, we don't implement DistributionConfig for PropertyValuesDistributionConfig
// because it requires binding to a catalog first. This is different from other distributions
// that are self-contained. We may add this later if needed.

#[cfg(test)]
mod tests {
    use core::iter;
    use std::collections::HashSet;

    use type_system::ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion};

    use super::*;

    /// Helper to create test data type references.
    fn test_data_types() -> Vec<DataTypeReference> {
        vec![
            DataTypeReference {
                url: VersionedUrl {
                    base_url: BaseUrl::new(
                        "https://example.com/@test/types/data-type/text/".to_owned(),
                    )
                    .expect("valid URL"),
                    version: OntologyTypeVersion::new(1),
                },
            },
            DataTypeReference {
                url: VersionedUrl {
                    base_url: BaseUrl::new(
                        "https://example.com/@test/types/data-type/number/".to_owned(),
                    )
                    .expect("valid URL"),
                    version: OntologyTypeVersion::new(1),
                },
            },
        ]
    }

    #[test]
    fn const_value_binding_and_sampling() {
        let config = PropertyValuesDistributionConfig::Const {
            value: PropertyValueTypeConfig::Value,
        };

        let catalog =
            InMemoryDataTypeCatalog::new(test_data_types()).expect("should create catalog");
        let distribution = config.bind(&catalog).expect("should bind successfully");

        let mut rng = rand::rng();
        let sample = distribution.sample(&mut rng);

        // Should sample a data type from the catalog
        if let PropertyValues::Value(ref data_type_ref) = sample {
            let url_string = data_type_ref.url.to_string();
            // Should be one of our test data types
            assert!(
                url_string.contains("text") || url_string.contains("number"),
                "URL should contain 'text' or 'number', got: {url_string}",
            );
        } else {
            panic!("Expected PropertyValues::Value");
        }
    }

    #[test]
    fn weighted_value_binding() {
        let config = PropertyValuesDistributionConfig::Weighted {
            weights: vec![DistributionWeight {
                weight: 1,
                distribution: PropertyValueTypeConfig::Value,
            }],
        };

        let catalog =
            InMemoryDataTypeCatalog::new(test_data_types()).expect("should create catalog");
        let distribution = config.bind(&catalog).expect("should bind successfully");

        let mut rng = rand::rng();
        let _sample = distribution.sample(&mut rng); // Should not panic
    }

    #[test]
    fn uniform_value_binding() {
        let config = PropertyValuesDistributionConfig::Uniform {
            types: vec![PropertyValueTypeConfig::Value],
        };

        let catalog =
            InMemoryDataTypeCatalog::new(test_data_types()).expect("should create catalog");
        let distribution = config.bind(&catalog).expect("should bind successfully");

        let mut rng = rand::rng();
        let _sample = distribution.sample(&mut rng); // Should not panic
    }

    #[test]
    fn empty_catalog_error() {
        // Create a mock empty catalog for testing by binding against a config that requires one
        #[derive(Debug)]
        struct EmptyTestCatalog;
        impl DataTypeCatalog for EmptyTestCatalog {
            fn data_type_references(&self) -> &[DataTypeReference] {
                &[]
            }

            fn sample_data_type<R: Rng + ?Sized>(&self, _rng: &mut R) -> &DataTypeReference {
                panic!("Empty catalog cannot sample data types")
            }
        }
        let empty_catalog = EmptyTestCatalog;

        let config = PropertyValuesDistributionConfig::Const {
            value: PropertyValueTypeConfig::Value,
        };
        let result = config.bind(&empty_catalog);

        let _: Report<_> = result.expect_err("should error");
    }

    #[test]
    fn array_not_implemented_error() {
        let config = PropertyValuesDistributionConfig::Const {
            value: PropertyValueTypeConfig::Array,
        };

        let catalog =
            InMemoryDataTypeCatalog::new(test_data_types()).expect("should create catalog");
        let result = config.bind(&catalog);

        let _: Report<_> = result.expect_err("should error");
    }

    #[test]
    fn object_not_implemented_error() {
        let config = PropertyValuesDistributionConfig::Const {
            value: PropertyValueTypeConfig::Object,
        };

        let catalog =
            InMemoryDataTypeCatalog::new(test_data_types()).expect("should create catalog");
        let result = config.bind(&catalog);

        let _: Report<_> = result.expect_err("should error");
    }

    #[test]
    fn json_serialization_deserialization() {
        // Test that our config can be serialized/deserialized properly
        let config = PropertyValuesDistributionConfig::Weighted {
            weights: vec![
                DistributionWeight {
                    weight: 80,
                    distribution: PropertyValueTypeConfig::Value,
                },
                DistributionWeight {
                    weight: 20,
                    distribution: PropertyValueTypeConfig::Array,
                },
            ],
        };

        // Serialize to JSON
        let json = serde_json::to_string_pretty(&config).expect("should serialize");

        // Deserialize back
        let deserialized: PropertyValuesDistributionConfig =
            serde_json::from_str(&json).expect("should deserialize");

        // Verify it's the same (we can't use PartialEq because the JSON value doesn't implement it)
        match (&config, &deserialized) {
            (
                PropertyValuesDistributionConfig::Weighted { weights: w1 },
                PropertyValuesDistributionConfig::Weighted { weights: w2 },
            ) => {
                assert_eq!(w1.len(), w2.len());
                assert_eq!(w1[0].weight, w2[0].weight);
            }
            _ => panic!("Config structure should match"),
        }
    }

    #[test]
    fn catalog_decides_data_type_sampling() {
        // Test that the catalog's sampling strategy is used at distribution time
        let config = PropertyValuesDistributionConfig::Const {
            value: PropertyValueTypeConfig::Value,
        };

        let catalog =
            InMemoryDataTypeCatalog::new(test_data_types()).expect("should create catalog");
        let distribution = config.bind(&catalog).expect("should bind successfully");

        let mut rng = rand::rng();

        // Sample multiple times - should get different data types due to uniform sampling
        let samples: Vec<_> = iter::repeat_with(|| match distribution.sample(&mut rng) {
            PropertyValues::Value(data_type_ref) => data_type_ref.url.to_string(),
            PropertyValues::Object(_) | PropertyValues::Array(_) => {
                panic!("Expected PropertyValues::Value")
            }
        })
        .take(20)
        .collect();

        // With uniform sampling from 2 data types over 20 samples, we should see both types
        let unique_types: HashSet<_> = samples.into_iter().collect();
        assert!(
            unique_types.len() > 1,
            "Should sample different data types from catalog"
        );
    }
}
