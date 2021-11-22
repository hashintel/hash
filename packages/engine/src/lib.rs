#![feature(test)]
#![feature(map_try_insert)]
#![feature(box_patterns)]
#[macro_use]
extern crate lazy_static;
extern crate derivative;

#[macro_use]
extern crate derive_new;

pub mod config;
pub mod datastore;
pub mod error;
pub mod experiment;
pub mod fetch;
pub mod gen;
pub mod hash_types;
pub mod language;
pub mod nano;
pub mod output;
pub mod proto;
pub mod simulation;
pub mod types;
pub mod worker;
pub mod workerpool;

mod args;
pub mod env;
mod utils;

pub use error::{Error, Result};

pub use args::{args, Args};
pub use config::{experiment_config, ExperimentConfig, SimRunConfig, SimulationConfig};
pub use env::{env, Environment};
pub use experiment::init_exp_package;
pub use language::Language;
pub use utils::init_logger;
