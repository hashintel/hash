use alloc::sync::Arc;
use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use rand::distr::weighted::WeightedIndex;
use rand_distr::Distribution;

use super::{ShortnameDistribution, ShortnameDistributionConfig};
use crate::seeding::distributions::DistributionConfig as _;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", deny_unknown_fields)]
pub enum DomainDistributionConfig {
    Weighted {
        distribution: Vec<WeightedDomainListDistributionConfig>,
    },
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
/// A domain with a weight and shortname weights.
pub struct WeightedDomainListDistributionConfig {
    pub name: Arc<str>,
    pub weight: u32,
    pub shortnames: ShortnameDistributionConfig,
}

#[derive(Debug, derive_more::Display)]
pub enum DomainDistributionError {
    #[display("Invalid weights")]
    Weight,
    #[display("Could not create shortname distribution")]
    Shortname,
}

impl Error for DomainDistributionError {}

#[derive(Debug, Clone, PartialEq)]
pub struct DomainDistribution {
    pub index: WeightedIndex<u32>,
    pub shortnames: Vec<(Arc<str>, ShortnameDistribution)>,
}

impl DomainDistribution {
    /// Creates a distribution that samples a domain and shortname.
    ///
    /// # Errors
    ///
    /// Returns a [`Report`] containing all errors encountered while creating the distribution.
    pub fn new(config: &DomainDistributionConfig) -> Result<Self, Report<DomainDistributionError>> {
        match config {
            DomainDistributionConfig::Weighted { distribution } => {
                let (weights, domain_shortnames) = distribution
                    .iter()
                    .map(|domain| {
                        domain
                            .shortnames
                            .create_distribution()
                            .change_context(DomainDistributionError::Shortname)
                            .map(|shortname_distr| {
                                (domain.weight, (Arc::clone(&domain.name), shortname_distr))
                            })
                    })
                    .try_collect_reports::<(Vec<_>, Vec<_>)>()
                    .change_context(DomainDistributionError::Shortname)?;

                Ok(Self {
                    index: WeightedIndex::new(weights)
                        .change_context(DomainDistributionError::Weight)?,
                    shortnames: domain_shortnames,
                })
            }
        }
    }
}

impl Distribution<(Arc<str>, Arc<str>)> for DomainDistribution {
    fn sample<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> (Arc<str>, Arc<str>) {
        let index = self.index.sample(rng);
        let (domain, shortname_distr) = &self
            .shortnames
            .get(index)
            .expect("`WeightedIndex::sample()` returned an index out of bounds");
        (Arc::clone(domain), shortname_distr.sample(rng))
    }
}
