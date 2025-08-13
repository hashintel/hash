pub mod constraints;

use core::ops::Add;

use error_stack::Report;
use rand::{
    Rng,
    distr::weighted::{Error as WeightError, WeightedIndex},
};
use rand_distr::{Bernoulli, BernoulliError, Distribution, uniform::SampleBorrow};

pub struct ConsistentMinMax<M, S, F> {
    pub min: M,
    pub span: S,
    pub fallback_max: F,
}

impl<M, S, F, T> Distribution<(Option<T>, Option<T::Output>)> for ConsistentMinMax<M, S, F>
where
    M: Distribution<Option<T>>,
    S: Distribution<Option<T>>,
    F: Distribution<Option<T::Output>>,
    T: Copy + Add,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> (Option<T>, Option<T::Output>) {
        let min = self.min.sample(rng);
        if let Some(min) = min {
            let max = self.span.sample(rng).map(|span| min + span);
            (Some(min), max)
        } else {
            (None, self.fallback_max.sample(rng))
        }
    }
}

pub struct WeightedChoose<T> {
    weights: WeightedIndex<usize>,
    choices: Vec<T>,
}

impl<T> WeightedChoose<T> {
    /// Create a new weighted choose distribution.
    ///
    /// # Example
    ///
    /// ```
    /// use hash_graph_test_data::seeding::distributions::WeightedChoose;
    /// use rand::distr::Distribution as _;
    ///
    /// let weighted_choose = WeightedChoose::new([('a', 2), ('b', 1), ('c', 1)])?;
    ///
    /// let mut rng = rand::rng();
    /// for choice in weighted_choose.sample_iter(rng).take(100) {
    ///     // 50% chance to print 'a', 25% chance to print 'b', 25% chance to print 'c'
    ///     println!("{choice:?}");
    /// }
    /// # Ok::<(), Box<dyn core::error::Error>>(())
    /// ```
    ///
    /// # Errors
    ///
    /// Returns a report with the error if the weights are not valid.
    pub fn new<I, W>(weighted_choices: I) -> Result<Self, Report<WeightError>>
    where
        I: IntoIterator<Item = (T, W)>,
        W: SampleBorrow<usize>,
    {
        let (choices, weights) = weighted_choices.into_iter().collect::<(Vec<_>, Vec<_>)>();
        Ok(Self {
            weights: WeightedIndex::new(weights)?,
            choices,
        })
    }
}

impl<T: Clone> Distribution<T> for WeightedChoose<T> {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> T {
        #[expect(
            clippy::indexing_slicing,
            reason = "the weights are guaranteed to be valid"
        )]
        self.choices[self.weights.sample(rng)].clone()
    }
}

pub struct OptionalDistribution<D> {
    coin: Bernoulli,
    distribution: D,
}

impl<D> OptionalDistribution<D> {
    /// Create a new optional distribution with a given probability of a value being present.
    ///
    /// # Example
    ///
    /// ```
    /// use hash_graph_test_data::seeding::distributions::OptionalDistribution;
    /// use rand::distr::{Distribution as _, Uniform};
    ///
    /// let optional_distribution = OptionalDistribution::new(0.5, Uniform::new(0, 100)?)?;
    ///
    /// let mut rng = rand::rng();
    /// for value in optional_distribution.sample_iter(rng).take(100) {
    ///     // 50% chance to print a value between 0 and 100, 50% chance to print None
    ///     println!("{value:?}");
    /// }
    /// # Ok::<(), Box<dyn core::error::Error>>(())
    /// ```
    ///
    /// # Errors
    ///
    /// Returns a report with the error if the probability is not in the range [0, 1].
    pub fn new(value_probability: f64, distribution: D) -> Result<Self, Report<BernoulliError>> {
        Ok(Self {
            coin: Bernoulli::new(value_probability)?,
            distribution,
        })
    }

    /// Create a new optional distribution with a given ratio of a value being present.
    ///
    /// # Example
    ///
    /// ```
    /// use hash_graph_test_data::seeding::distributions::OptionalDistribution;
    /// use rand::distr::{Distribution as _, Uniform};
    ///
    /// let optional_distribution = OptionalDistribution::from_ratio(2, 3, Uniform::new(0, 100)?)?;
    ///
    /// let mut rng = rand::rng();
    /// for value in optional_distribution.sample_iter(rng).take(100) {
    ///     // 67% chance to print a value between 0 and 100, 33% chance to print None
    ///     println!("{value:?}");
    /// }
    /// # Ok::<(), Box<dyn core::error::Error>>(())
    /// ```
    ///
    /// # Errors
    ///
    /// Returns a report with the error if the ratio is not in the range [0, 1].
    pub fn from_ratio(
        numerator: u32,
        denominator: u32,
        distribution: D,
    ) -> Result<Self, Report<BernoulliError>> {
        Ok(Self {
            coin: Bernoulli::from_ratio(numerator, denominator)?,
            distribution,
        })
    }
}

impl<D, T> Distribution<Option<T>> for OptionalDistribution<D>
where
    D: Distribution<T>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Option<T> {
        self.coin.sample(rng).then(|| self.distribution.sample(rng))
    }
}

pub struct VectorDistribution<L, V> {
    pub len: L,
    pub value: V,
}

impl<L, V, E> Distribution<Vec<E>> for VectorDistribution<L, V>
where
    L: Distribution<usize>,
    V: Distribution<E>,
{
    fn sample<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> Vec<E> {
        let len = self.len.sample(rng);
        (&self.value).sample_iter(rng).take(len).collect()
    }
}
