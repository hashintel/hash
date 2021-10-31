#[allow(clippy::module_name_repetitions)]
pub trait DistanceFn: Fn(&[f64], &[f64]) -> f64 + Send + Sync + 'static {}
impl<T> DistanceFn for T where T: Fn(&[f64], &[f64]) -> f64 + Send + Sync + 'static {}

pub mod functions {

    /// The distance function associated with the infinite norm
    /// In simpler terms - the distance function that returns the largest distance in any given axes
    ///
    /// Takes two positions as an array of coordinates
    #[must_use]
    pub fn conway(a: &[f64], b: &[f64]) -> f64 {
        debug_assert!(a.len() == b.len());
        a.iter()
            .zip(b.iter()) // Line the two coordinates up in a set of hstacked pairs
            .map(|(x1, x2)| (*x1 - *x2).abs()) // pull in each hstack pair and return the abs of their difference
            .fold(0_f64, |a, b| a.max(b)) //
    }

    /// The distance function associated with the L-1 norm
    /// Also known as the Taxicab distance - returns the total distance traveled in all axes
    ///
    /// Takes two positions as an array of coordinates
    #[must_use]
    pub fn manhattan(a: &[f64], b: &[f64]) -> f64 {
        debug_assert!(a.len() == b.len());
        a.iter()
            .zip(b.iter())
            .map(|(x1, x2)| (*x1 - *x2).abs())
            .fold(0_f64, |acc, add| acc + add)
    }

    /// The distance function associated with the L-2 norm
    /// Most familiar distance function - is the straightline distance between two points
    /// Results are left squared for efficient comparisons
    ///
    /// Takes two positions as an array of coordinates
    #[must_use]
    pub fn euclidean_squared(a: &[f64], b: &[f64]) -> f64 {
        debug_assert!(a.len() == b.len());
        a.iter()
            .zip(b.iter())
            .map(|(x1, x2)| (*x1 - *x2).powi(2))
            .fold(0_f64, |acc, add| acc + add)
    }

    /// The distance function associated with the L-2 norm
    /// Most familiar distance function - is the straightline distance between two points
    ///
    /// Takes two positions as an array of coordinates
    #[must_use]
    pub fn euclidean(a: &[f64], b: &[f64]) -> f64 {
        debug_assert!(a.len() == b.len());
        a.iter()
            .zip(b.iter())
            .map(|(x1, x2)| (*x1 - *x2).powi(2))
            .fold(0_f64, |acc, add| acc + add)
            .sqrt()
    }
}
