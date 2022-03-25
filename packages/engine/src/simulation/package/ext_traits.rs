use crate::simulation::error::Result;

pub trait GetWorkerExpStartMsg {
    // TODO: maybe the Ok(Null) return should be impl by default
    //      if packages don't use this often
    //      Leaving default unimplemented for now since the forced impls
    //      are good to demonstrate what can be done with package-design
    //      until we create documentation on writing packages
    /// This allows package creators to pass any kind of configuration from their
    /// Rust runtime to their Language Runner counterpart for the experiment.
    /// Compared to [GetWorkerSimStartMsg], the data returned with this method
    /// will be available for all simulations. Also, this should not be implemented
    /// for packages but their respective package creator.
    /// If a package creator doesn't want to pass anything it should return a
    /// `Ok(serde_json::Value::Null)`.
    fn get_worker_exp_start_msg(&self) -> Result<serde_json::Value>;
}

pub trait GetWorkerSimStartMsg {
    // TODO: maybe the Ok(Null) return should be impl by default
    //      if packages don't use this often
    /// This allows packages to pass any kind of configuration from their
    /// Rust runtime to their Language Runner counterpart for a specific simulation.
    /// Compared to [GetWorkerExpStartMsg], the data returned with this method
    /// will only be available for that specific simulation where the package
    /// has been instantiated.
    /// If a package doesn't want to pass anything it should return a
    /// `Ok(serde_json::Value::Null)`.
    fn get_worker_sim_start_msg(&self) -> Result<serde_json::Value>;
}

pub trait MaybeCpuBound {
    fn cpu_bound(&self) -> bool;
}
