use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use rand::{Rng, distr::weighted::WeightedIndex};
use rand_distr::Distribution;

use crate::seeding::distributions::DistributionConfig;

#[derive(Debug, Clone, PartialEq)]
pub struct WeightedDistribution<D> {
    index: WeightedIndex<u32>,
    distribution: Vec<D>,
}

impl<D, T> Distribution<T> for WeightedDistribution<D>
where
    D: Distribution<T>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> T {
        self.distribution
            .get(self.index.sample(rng))
            .expect("`WeightedIndex` should return a valid index")
            .sample(rng)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DistributionWeight<D> {
    pub weight: u32,
    pub distribution: D,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", deny_unknown_fields)]
pub struct WeightedDistributionConfig<D> {
    pub weights: Vec<DistributionWeight<D>>,
}

#[derive(Debug, derive_more::Display)]
pub enum WeightedDistributionConfigError {
    #[display("Invalid weight distribution config")]
    Weights,

    #[display("Weighted distribution could not be created")]
    Distribution,
}

impl Error for WeightedDistributionConfigError {}

impl<D> DistributionConfig for WeightedDistributionConfig<D>
where
    D: DistributionConfig,
{
    type Distribution = WeightedDistribution<D::Distribution>;
    type Error = Report<[WeightedDistributionConfigError]>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        let (weights, distribution) = self
            .weights
            .iter()
            .map(|distribution_weight| {
                distribution_weight
                    .distribution
                    .create_distribution()
                    .map(|distribution| (distribution_weight.weight, distribution))
                    .change_context(WeightedDistributionConfigError::Distribution)
            })
            .try_collect_reports::<(Vec<_>, Vec<_>)>()?;

        Ok(WeightedDistribution {
            index: WeightedIndex::new(weights)
                .change_context(WeightedDistributionConfigError::Weights)?,
            distribution,
        })
    }
}
