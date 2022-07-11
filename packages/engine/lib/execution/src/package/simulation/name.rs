use std::fmt;

use serde::Serialize;
use stateful::field::PackageId;

use crate::{
    package::simulation::{
        context::ContextPackageName, init::InitPackageName, output::OutputPackageName,
        state::StatePackageName, Dependencies, PackageType,
    },
    Result,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PackageName {
    Context(ContextPackageName),
    Init(InitPackageName),
    State(StatePackageName),
    Output(OutputPackageName),
}

impl fmt::Display for PackageName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
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

pub struct PackageMetadata {
    pub id: PackageId,
    pub dependencies: Dependencies,
}

impl PackageName {
    pub fn get_id(&self) -> Result<PackageId> {
        match self {
            Self::Context(name) => name.id(),
            Self::Init(name) => name.id(),
            Self::State(name) => name.id(),
            Self::Output(name) => name.id(),
        }
    }

    pub fn get_dependencies(&self) -> Result<&Dependencies> {
        match self {
            Self::Context(name) => name.dependencies(),
            Self::Init(name) => name.dependencies(),
            Self::State(name) => name.dependencies(),
            Self::Output(name) => name.dependencies(),
        }
    }
}

pub struct PackageIdGenerator {
    cur: u32,
    multiplier: usize,
}

impl PackageIdGenerator {
    pub fn new(package_group: PackageType) -> PackageIdGenerator {
        let multiplier = match package_group {
            PackageType::Init => 3,
            PackageType::Context => 5,
            PackageType::State => 7,
            PackageType::Output => 11,
        };

        PackageIdGenerator { cur: 0, multiplier }
    }

    pub fn next(&mut self) -> PackageId {
        let id = PackageId::from(self.multiplier * usize::pow(2, self.cur));
        self.cur += 1;
        id
    }
}
