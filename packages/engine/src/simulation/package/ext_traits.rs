use crate::simulation::{error::Result, package::deps::Dependencies};

pub trait PackageCreator: Sync + Send {
    /// A message sent to all workers before running any packages.
    ///
    /// This allows package creators to pass any kind of configuration from their Rust runtime to
    /// their Language Runner counterpart all.
    ///
    /// Compared to [`Package::start_message()`], the data returned with this method will be
    /// available for all simulations. Also, this should not be implemented for packages but
    /// their respective package creator.
    fn init_message(&self) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
    }

    /// Get the package names that packages created by this creator will depend on.
    fn dependencies() -> Dependencies
    where
        Self: Sized,
    {
        Dependencies::empty()
    }
}

// Generics for packages
//
// Note that generalization cannot be done for all package traits.
// See https://github.com/rust-lang/rust/issues/20400 for why Init, Context, State and Output
// package (and other respective) traits cannot be (sensibly) generalized into one even though they
// are clearly disjoint.

pub trait Package: Send + Sync {
    /// A message sent to the workers before the package is running.
    ///
    /// This allows packages to pass any kind of configuration from their Rust runtime to their
    /// Language Runner counterpart for a specific simulation.
    ///
    /// Compared to [`PackageCreator::init_message()`], the data returned with this method will only
    /// be available for that specific simulation where the package has been instantiated.
    fn start_message(&self) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
    }
}

pub trait MaybeCpuBound {
    fn cpu_bound(&self) -> bool;
}
