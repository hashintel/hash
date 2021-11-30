use std::fmt::Display;

use serde::Serialize;
use strum_macros::IntoStaticStr;

use crate::simulation::package::deps::Dependencies;
use crate::simulation::package::{context, init, output, state, PackageMetadata};
use crate::simulation::{package::id::PackageId, Error, Result};

#[derive(Debug, Clone, PartialEq, Eq, IntoStaticStr, Hash)]
pub enum PackageName {
    Context(context::Name),
    Init(init::Name),
    State(state::Name),
    Output(output::Name),
}

impl Serialize for PackageName {
    fn serialize<S>(
        &self, serializer: S
    ) -> std::result::Result<S::Ok, S::Error> where S: serde::Serializer {
        format!("{}", self).serialize(serializer)
    }
}

impl PackageName {
    fn get_metadata(&self) -> Result<&PackageMetadata> {
        Ok(match self {
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
        })?)
    }

    pub fn get_id(&self) -> Result<PackageId> {
        let id = &self.get_metadata()?.id;
        Ok(id.clone())
    }

    pub fn get_dependencies(&self) -> Result<Dependencies> {
        let dependencies = &self.get_metadata()?.dependencies;
        Ok(dependencies.clone())
    }
}

impl Display for PackageName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let package_type: &str = self.into();
        let package_name: &str = match self {
            PackageName::Context(p) => p.into(),
            PackageName::Init(p) => p.into(),
            PackageName::State(p) => p.into(),
            PackageName::Output(p) => p.into(),
        };
        write!(f, "{}({})", package_type, package_name)
    }
}
