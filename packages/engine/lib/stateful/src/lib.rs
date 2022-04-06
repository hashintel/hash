// TODO: DOC: Describing this crate containing stateful things like agents, context, etc. and the
//            `field` interface
pub mod agent;
pub mod field;
pub mod message;
pub mod proxy;

mod error;

pub use self::error::{Error, Result};
