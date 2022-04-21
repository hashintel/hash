use execution::package::PackageType;
use stateful::field::PackageId;

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
