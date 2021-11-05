use std::fmt::Display;
use strum_macros::IntoStaticStr;

use crate::simulation::package::{context, init, output, state};
use crate::simulation::{package::id::PackageId, Error, Result};

#[derive(Debug, Clone, PartialEq, Eq, IntoStaticStr, Hash)]
pub enum PackageName {
    Context(context::Name),
    Init(init::Name),
    State(state::Name),
    Output(output::Name),
}

impl PackageName {
    pub fn get_id(&self) -> Result<PackageId> {
        let err = || {
            Error::from(format!("Package Id not registered: {}", self));
        };
        let id = match self {
            PackageName::Context(name) => super::context::packages::IDS.get(name),
            PackageName::Init(name) => super::init::packages::IDS.get(name),
            PackageName::State(name) => super::state::packages::IDS.get(name),
            PackageName::Output(name) => super::output::packages::IDS.get(name),
        }
        .ok_or_else(|| Error::from(format!("Package Id not registered: {}", self)))?;
        Ok(id.clone())
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
