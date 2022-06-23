use thiserror::Error as ThisError;
pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Simulation error: {0}")]
    Simulation(#[from] crate::simulation::Error),
}
