mod error;
mod field;
mod json;
mod keys;

use std::fmt;

use serde::{Deserialize, Serialize};

pub use self::{error::BehaviorKeyJsonError, field::BehaviorMap};
use crate::{runner::Language, Result};

#[derive(Deserialize, Serialize, Clone)]
pub struct Behavior {
    /// This is the unique identifier (also the file/path) that, in the case of Cloud runs, is used
    /// by the HASH API
    pub id: String,
    /// This is the full name of the file (can be used to refer to the behavior).
    /// It is often the case that self.id = self.name (except sometimes for dependencies by
    /// `@hash`).
    pub name: String,
    /// These are alternative representations on how one can refer to this behavior
    pub shortnames: Vec<String>,
    /// Source code for the behaviors
    pub behavior_src: Option<String>,
    /// Behavior key definition for this behavior
    pub behavior_keys_src: Option<String>,
}

impl Behavior {
    pub fn language(&self) -> Result<Language> {
        Language::from_file_name(&self.name)
    }
}

impl fmt::Debug for Behavior {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SharedBehavior")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("shortnames", &self.shortnames)
            .field(
                "behavior_src",
                if self.behavior_src.is_some() {
                    &"Some(...)"
                } else {
                    &"None"
                },
            )
            .field(
                "behavior_keys_src",
                if self.behavior_keys_src.is_some() {
                    &"Some(...)"
                } else {
                    &"None"
                },
            )
            .finish()
    }
}
