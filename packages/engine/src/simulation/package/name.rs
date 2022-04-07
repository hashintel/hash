use std::fmt::Display;

use serde::Serialize;

use crate::simulation::{
    package::{context, deps::Dependencies, id::PackageId, init, output, state, PackageMetadata},
    Error, Result,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PackageName {
    Context(context::Name),
    Init(init::Name),
    State(state::Name),
    Output(output::Name),
}

impl Display for PackageName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = serde_json::to_string(self).map_err(|_| std::fmt::Error)?;
        // serde_json puts quotes around the string for some reason, so remove them.
        // TODO: Is there some serde/serde_json option to not put the quotes in the first place?
        debug_assert!(s.len() >= 2);
        debug_assert!(s.as_bytes()[0] == (b'"'));
        debug_assert!(s.as_bytes()[s.len() - 1] == (b'"'));
        let substr = &s.as_bytes()[1..s.len() - 1];
        let substr = std::str::from_utf8(substr);
        write!(f, "{}", substr.map_err(|_| std::fmt::Error)?)
    }
}

impl Serialize for PackageName {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::Context(name) => name.serialize(serializer),
            Self::Init(name) => name.serialize(serializer),
            Self::State(name) => name.serialize(serializer),
            Self::Output(name) => name.serialize(serializer),
        }
    }
}

impl PackageName {
    fn get_metadata(&self) -> Result<&PackageMetadata> {
        match self {
            PackageName::Context(name) => super::context::packages::METADATA.get(name),
            PackageName::Init(name) => super::init::packages::METADATA.get(name),
            PackageName::State(name) => super::state::packages::METADATA.get(name),
            PackageName::Output(name) => super::output::packages::METADATA.get(name),
        }
        .ok_or_else(|| {
            Error::from(format!(
                "Package Metadata not registered for package: {}",
                self
            ))
        })
    }

    pub fn get_id(&self) -> Result<PackageId> {
        Ok(self.get_metadata()?.id)
    }

    pub fn get_dependencies(&self) -> Result<Dependencies> {
        let dependencies = &self.get_metadata()?.dependencies;
        Ok(dependencies.clone())
    }
}
