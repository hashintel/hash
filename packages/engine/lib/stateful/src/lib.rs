// TODO: DOC: Describing this crate containing stateful things like agents, context, etc. and the
//            `field` interface
pub mod agent;
pub mod dataset;
pub mod field;
pub mod globals;
pub mod message;
pub mod proxy;
pub mod state;

pub mod context;
mod error;
mod vec;

pub use self::{
    error::{Error, Result},
    vec::Vec3,
};
