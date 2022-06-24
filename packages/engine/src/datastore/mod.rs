//! The `datastore` module includes logic about handling creation, modification, and access of
//! simulation data that's shared across the engine and runtimes.
//!
//! It contains the logic relating to storing data within Arrow, which allows us to efficiently
//! share large quantities of data between runtimes. It also includes the functionalities we use to
//! dynamically initialize data from schemas, and logic around data access and safety.
// TODO: DOC improve wording of above, and signpost the key modules
mod error;
pub mod table;

pub use self::error::{Error, Result};
