use core::fmt;
use std::fmt::Formatter;

use serde::Serialize;

use crate::simulation::package::PackageType;

#[derive(Copy, Clone, Debug, Hash, PartialEq, Eq, Serialize)]
pub struct PackageId(usize);

impl PackageId {
    #[inline]
    pub fn as_usize(&self) -> usize {
        self.0
    }
}

impl fmt::Display for PackageId {
    #[tracing::instrument(skip_all)]
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<usize> for PackageId {
    #[tracing::instrument(skip_all)]
    fn from(id: usize) -> Self {
        Self(id)
    }
}

pub struct PackageIdGenerator {
    cur: usize,
    multiplier: usize,
}

impl PackageIdGenerator {
    #[tracing::instrument(skip_all)]
    pub fn new(package_group: PackageType) -> PackageIdGenerator {
        let multiplier = match package_group {
            PackageType::Init => 3,
            PackageType::Context => 5,
            PackageType::State => 7,
            PackageType::Output => 11,
        };

        PackageIdGenerator { cur: 0, multiplier }
    }

    #[tracing::instrument(skip_all)]
    pub fn next(&mut self) -> PackageId {
        let id = PackageId(self.multiplier * (2 ^ self.cur));
        self.cur += 1;
        id
    }
}
