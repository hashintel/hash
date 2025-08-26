use error_stack::IntoReport;

pub mod adaptors;
pub mod entity;
pub mod ontology;
pub mod property;
pub mod value;

pub trait DistributionConfig {
    type Error: IntoReport;
    type Distribution;

    /// Create a distribution from the configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the distribution cannot be created.
    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error>;
}
