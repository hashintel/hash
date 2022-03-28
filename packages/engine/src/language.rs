use serde::{Deserialize, Serialize};
use strum_macros::Display;

use crate::{Error, Result};

/// Supported languages
#[derive(Serialize, Deserialize, PartialEq, Eq, Hash, Copy, Clone, Debug, Display)]
pub enum Language {
    JavaScript = 0,
    Python = 1,
    Rust = 2,
}

impl Language {
    pub const NUM: usize = 3;
    pub const ORDERED: [Language; Self::NUM] =
        [Language::JavaScript, Language::Python, Language::Rust];

    pub fn as_index(self) -> usize {
        self as usize
    }

    pub fn from_index(i: usize) -> Self {
        Self::ORDERED[i]
    }

    pub fn from_file_name(file_name: &str) -> Result<Language> {
        if !(file_name.contains('.') || file_name.contains('/')) {
            // This is so we're on-par w/ the web-engine, see `extract_hash_builtin` in
            // the hash repo
            return Ok(Language::Rust);
        }

        let file_path = std::path::Path::new(file_name);

        match file_path.extension().and_then(std::ffi::OsStr::to_str) {
            Some("py") => Ok(Language::Python),
            Some("js") => Ok(Language::JavaScript),
            Some("rs") => Ok(Language::Rust),
            _ => Err(Error::ParseBehavior(file_name.to_string())),
        }
    }
}
