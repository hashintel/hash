use core::{error::Error, iter};
use std::collections::HashMap;

use error_stack::Report;
use rand::{Rng, distr::Distribution};
use type_system::ontology::{
    VersionedUrl, entity_type::schema::EntityTypeReference, json_schema::OneOfSchema,
    property_type::schema::PropertyValueArray,
};

use crate::seeding::producer::entity_type::EntityTypeCatalog;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EntityTypeLinksDistributionConfig {
    Fixed { count: usize },
    Range { min: usize, max: usize },
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid links distribution")]
pub enum EntityTypeLinksBindingError {
    #[display("Empty EntityType catalog")]
    EmptyEntityTypeCatalog,
    #[display("Invalid range: min ({min}) > max ({max})")]
    InvalidRange { min: usize, max: usize },
    #[display("Weighted distribution error")]
    WeightedDistribution,
}

impl Error for EntityTypeLinksBindingError {}

impl EntityTypeLinksDistributionConfig {
    /// Bind this configuration to a [`EntityTypeCatalog`] to create a distribution.
    ///
    /// # Errors
    ///
    /// Returns an error if the catalog is empty or if the configuration is invalid.
    pub fn bind<L: EntityTypeCatalog, T: EntityTypeCatalog>(
        &self,
        link_type_catalog: L,
        target_entity_type_catalog: Option<T>,
    ) -> Result<BoundEntityTypeLinksDistribution<L, T>, Report<[EntityTypeLinksBindingError]>> {
        if link_type_catalog.entity_type_references().is_empty() {
            return Err(Report::new(EntityTypeLinksBindingError::EmptyEntityTypeCatalog).expand());
        }
        if let Some(target_catalog) = &target_entity_type_catalog
            && target_catalog.entity_type_references().is_empty()
        {
            return Err(Report::new(EntityTypeLinksBindingError::EmptyEntityTypeCatalog).expand());
        }

        match self {
            Self::Fixed { count } => Ok(BoundEntityTypeLinksDistribution::Fixed {
                link_type_catalog,
                target_entity_type_catalog,
                count: *count,
            }),
            Self::Range { min, max } => {
                if min > max {
                    return Err(Report::new(EntityTypeLinksBindingError::InvalidRange {
                        min: *min,
                        max: *max,
                    })
                    .expand());
                }
                Ok(BoundEntityTypeLinksDistribution::Range {
                    link_type_catalog,
                    target_entity_type_catalog,
                    min: *min,
                    max: *max,
                })
            }
        }
    }
}

#[derive(Debug)]
pub enum BoundEntityTypeLinksDistribution<L: EntityTypeCatalog, T: EntityTypeCatalog> {
    Fixed {
        link_type_catalog: L,
        target_entity_type_catalog: Option<T>,
        count: usize,
    },
    Range {
        link_type_catalog: L,
        target_entity_type_catalog: Option<T>,
        min: usize,
        max: usize,
    },
}

impl<L: EntityTypeCatalog, T: EntityTypeCatalog>
    Distribution<
        HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
    > for BoundEntityTypeLinksDistribution<L, T>
{
    fn sample<R: Rng + ?Sized>(
        &self,
        rng: &mut R,
    ) -> HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>> {
        match self {
            Self::Fixed {
                link_type_catalog,
                target_entity_type_catalog,
                count,
            } => generate_links(
                link_type_catalog,
                target_entity_type_catalog.as_ref(),
                *count,
                rng,
                10,
            ),
            Self::Range {
                link_type_catalog,
                target_entity_type_catalog,
                min,
                max,
            } => {
                let count = rng.random_range(*min..=*max);
                generate_links(
                    link_type_catalog,
                    target_entity_type_catalog.as_ref(),
                    count,
                    rng,
                    10,
                )
            }
        }
    }
}

fn generate_links<R: Rng + ?Sized, L: EntityTypeCatalog, T: EntityTypeCatalog>(
    link_type_catalog: &L,
    target_entity_type_catalog: Option<&T>,
    count: usize,
    rng: &mut R,
    max_attempts: usize,
) -> HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>> {
    let mut links = HashMap::new();

    while links.len() < count {
        let mut attempts = 0;
        while attempts < max_attempts {
            attempts += 1;
            let link_type_ref = link_type_catalog.sample_entity_type(rng);
            if links.contains_key(&link_type_ref.url) {
                continue;
            }

            let target = target_entity_type_catalog.map(|target_catalog| OneOfSchema {
                possibilities: iter::from_fn(|| Some(target_catalog.sample_entity_type(rng)))
                    .take(1)
                    .cloned()
                    .collect(),
            });

            links.insert(
                link_type_ref.url.clone(),
                PropertyValueArray {
                    items: target,
                    min_items: None,
                    max_items: None,
                },
            );

            break;
        }
        if attempts == max_attempts {
            break;
        }
    }

    links
}
