// TODO: DOC: Describing this crate containing stateful things like agents, context, etc. and the
//            `field` and `proxy` interface
pub mod agent;
pub mod context;
pub mod dataset;
pub mod field;
pub mod globals;
pub mod message;
pub mod proxy;
pub mod state;

mod error;
mod vec;

pub use self::{
    error::{Error, Result},
    vec::Vec3,
};
