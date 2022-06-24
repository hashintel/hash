use execution::package::experiment::ExperimentName;

/// Specific configuration needed for either Experiments or single runs of Simulations.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Parser))]
pub enum ExperimentType {
    /// Run a single simulation without an experiment.
    SingleRun {
        /// Number of steps to run
        #[cfg_attr(feature = "clap", clap(short, long))]
        num_steps: usize,
    },
    /// Run a simple experiment.
    Simple {
        /// Name of the experiment specified in _experiments.json_
        #[cfg_attr(feature = "clap", clap(short, long))]
        name: ExperimentName,
    },
}
