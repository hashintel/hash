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
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<usize> for PackageId {
    fn from(id: usize) -> Self {
        Self(id)
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
        let id = PackageId(self.multiplier * usize::pow(2, self.cur));
        self.cur += 1;
        id
    }
}
