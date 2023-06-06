use core::fmt;

use serde::{Deserialize, Serialize};

use crate::{runner::JavaScriptError, Error, Result};

/// Supported languages
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Language {
    JavaScript = 0,
    Python = 1,
    Rust = 2,
    TypeScript = 3,
}

impl fmt::Display for Language {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Language {
    pub const NUM: usize = 4;
    pub const ORDERED: [Language; Self::NUM] = [
        Language::JavaScript,
        Language::Python,
        Language::Rust,
        Language::TypeScript,
    ];

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
            Some("ts") => Ok(Language::TypeScript),
            Some("rs") => Ok(Language::Rust),
            _ => Err(Error::ParseBehavior(file_name.to_string())),
        }
    }

    /// Add a compilation step if necessary, compiling from source code provided
    /// by the user to the code that the runners can execute.
    ///
    /// TODO: Check validity of types
    /// TODO: Add source map support
    pub fn compile_source(&self, filename: &str, source: &str) -> Result<String> {
        if *self != Language::TypeScript {
            return Ok(source.to_string());
        }

        strip_typescript(filename, source)
    }

    /// Whether one language uses the same execution environment as another.
    /// Useful for shared worker logic (the JavaScript worker is used for TypeScript support).
    pub fn uses_same_runner(&self, other: &Language) -> bool {
        match (self, other) {
            (Language::JavaScript, Language::TypeScript) => true,
            (Language::TypeScript, Language::JavaScript) => true,
            _ => self == other,
        }
    }
}

fn strip_typescript(filename: &str, source_code: &str) -> Result<String> {
    use std::sync::Arc;

    use swc::config::Options;
    use swc_common::{errors::Handler, Globals};

    eprintln!(
        "Stripping typescript from {filename} (source code: {})",
        source_code.len()
    );

    let source_map = Arc::new(Default::default());
    let compiler = swc::Compiler::new(Arc::clone(&source_map));
    let source_file = source_map.new_source_file(
        swc_common::FileName::Real(filename.into()),
        source_code.into(),
    );

    let handler = Handler::with_emitter_writer(Box::new(vec![]), Some(source_map));

    let options = Options::default();

    swc_common::GLOBALS.set(&Globals::default(), || {
        let s = compiler.process_js_file(source_file, &handler, &options);

        match s {
            Ok(v) => {
                if handler.has_errors() {
                    Err(Error::JavaScript(JavaScriptError::TypeScriptCompilation {
                        filename: filename.to_string(),
                        error: "Invalid TypeScript".to_string(),
                    }))
                } else {
                    Ok(v.code)
                }
            }
            Err(_e) => Err(Error::JavaScript(JavaScriptError::TypeScriptCompilation {
                filename: filename.to_string(),
                error: "Invalid TypeScript".to_string(),
            })),
        }
    })
}
