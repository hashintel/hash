//! The third stage, which writes a run's rows of the sync table to the Graph.

mod client;
mod request;

pub use self::client::{GraphClient, GraphError};
