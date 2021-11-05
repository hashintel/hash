use crate::simulation::package::PackageType;

#[derive(Copy, Clone, Debug, Hash, PartialEq, Eq)]
pub struct PackageId(usize);

impl PackageId {
    #[inline]
    pub fn as_usize(&self) -> usize {
        self.0
    }

    pub fn to_string(&self) -> String {
        self.0.to_string()
    }
}

pub struct PackageIdCreator {
    cur: usize,
    multiplier: usize,
}

impl PackageIdCreator {
    pub fn new(package_group: PackageType) -> PackageIdCreator {
        let multiplier = match package_group {
            PackageType::Init => 3,
            PackageType::Context => 5,
            PackageType::State => 7,
            PackageType::Output => 11,
        };

        PackageIdCreator { cur: 0, multiplier }
    }

    pub fn next(&mut self) -> PackageId {
        let id = PackageId(self.multiplier * (2 ^ self.cur));
        self.cur += 1;
        id
    }
}
