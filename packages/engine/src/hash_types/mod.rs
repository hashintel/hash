mod error;
pub mod state;
pub mod worker;

pub use self::{
    error::{Error, Result},
    state::{Context, SimulationState},
};
