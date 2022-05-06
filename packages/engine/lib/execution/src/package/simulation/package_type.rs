use std::fmt;

use serde::Serialize;

#[derive(Clone, Copy, Debug)]
pub enum PackageType {
    Init,
    Context,
    State,
    Output,
}

impl PackageType {
    fn as_str(&self) -> &str {
        match *self {
            PackageType::Init => "init",
            PackageType::Context => "context",
            PackageType::State => "state",
            PackageType::Output => "output",
        }
    }
}

impl fmt::Display for PackageType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Serialize for PackageType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.as_str().serialize(serializer)
    }
}

impl From<PackageType> for flatbuffers_gen::package_config_generated::PackageType {
    fn from(package_type: PackageType) -> Self {
        match package_type {
            PackageType::Init => flatbuffers_gen::package_config_generated::PackageType::Init,
            PackageType::Context => flatbuffers_gen::package_config_generated::PackageType::Context,
            PackageType::State => flatbuffers_gen::package_config_generated::PackageType::State,
            PackageType::Output => flatbuffers_gen::package_config_generated::PackageType::Output,
        }
    }
}
