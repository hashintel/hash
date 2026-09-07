use std::{fs, io, path::PathBuf};

use error_stack::{Report, ResultExt as _};
use figment::{
    Metadata, Profile, Provider, Source,
    error::Error as FigmentError,
    value::{Dict, Map},
};

use crate::LoadError;

/// The format used to parse a configuration file.
#[derive(Debug, derive_more::Display)]
#[non_exhaustive]
pub enum FileFormat {
    #[display("TOML")]
    Toml,
}

/// A file to read when loading the configuration.
#[derive(Debug)]
pub(crate) enum FileSource {
    Required(PathBuf),
    Optional(PathBuf),
}

/// A parsed file contributing one configuration layer.
pub(crate) struct File {
    path: PathBuf,
    values: Dict,
}

impl FileSource {
    pub(crate) fn read(self) -> Result<Option<File>, Report<LoadError>> {
        let (path, required) = match self {
            Self::Required(path) => (path, true),
            Self::Optional(path) => (path, false),
        };
        let text = match fs::read_to_string(&path) {
            Err(error) if !required && error.kind() == io::ErrorKind::NotFound => return Ok(None),
            result => result.change_context_lazy(|| LoadError::ReadFile { path: path.clone() })?,
        };
        let values = toml::from_str(&text).map_err(|error: toml::de::Error| {
            // TOML errors retain the source document and may quote its values. Keep only the
            // position so neither the report nor its underlying frames can expose that input.
            let mut report = Report::new(LoadError::ParseFile {
                path: path.clone(),
                format: FileFormat::Toml,
            });
            if let Some(prefix) = error.span().and_then(|span| text.get(..span.start)) {
                let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
                let column = prefix
                    .rsplit('\n')
                    .next()
                    .map_or(1, |line| line.chars().count() + 1);
                report = report.attach(format!("at line {line}, column {column}"));
            }
            report
        })?;

        Ok(Some(File { path, values }))
    }
}

impl Provider for File {
    fn metadata(&self) -> Metadata {
        Metadata::named("file")
            .source(Source::File(self.path.clone()))
            .interpolater(|_profile, keys| keys.join("."))
    }

    fn data(&self) -> Result<Map<Profile, Dict>, FigmentError> {
        Ok(Map::from([(Profile::Default, self.values.clone())]))
    }
}
