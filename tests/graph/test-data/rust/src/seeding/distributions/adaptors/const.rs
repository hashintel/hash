use rand::{Rng, distr::Distribution};

use crate::seeding::distributions::DistributionConfig;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]

pub struct ConstDistribution<T> {
    value: T,
}

impl<T> ConstDistribution<T> {
    pub const fn new(value: T) -> Self {
        Self { value }
    }
}

impl<T: Clone> Distribution<T> for ConstDistribution<T> {
    fn sample<R: Rng + ?Sized>(&self, _rng: &mut R) -> T {
        self.value.clone()
    }
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ConstDistributionConfig<T> {
    pub value: T,
}

impl<T> DistributionConfig for ConstDistributionConfig<T>
where
    T: Clone,
{
    type Distribution = ConstDistribution<T>;
    type Error = !;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(ConstDistribution::new(self.value.clone()))
    }
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct ConstInlineDistributionConfig<T> {
    pub value: T,
}

impl<T> DistributionConfig for ConstInlineDistributionConfig<T>
where
    T: Clone,
{
    type Distribution = ConstDistribution<T>;
    type Error = !;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(ConstDistribution::new(self.value.clone()))
    }
}
