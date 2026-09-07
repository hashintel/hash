use std::{fs, path::PathBuf};

use error_stack::{Report, ResultExt as _};
use figment::{
    Metadata, Profile, Provider, Source,
    error::Error as FigmentError,
    value::{Dict, Map},
};

use crate::LoadError;

/// A required TOML file contributing one configuration layer.
pub(crate) struct File {
    path: PathBuf,
    values: Dict,
}

impl File {
    pub(crate) fn read(path: PathBuf) -> Result<Self, Report<LoadError>> {
        let text = fs::read_to_string(&path)
            .change_context_lazy(|| LoadError::ReadFile { path: path.clone() })?;
        let values = toml::from_str(&text).map_err(|error: toml::de::Error| {
            // TOML errors retain the source document and may quote its values. Keep only the
            // position so neither the report nor its underlying frames can expose that input.
            let mut report = Report::new(LoadError::ParseFile { path: path.clone() });
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

        Ok(Self { path, values })
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
