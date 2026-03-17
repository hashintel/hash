use crate::{id::newtype, newtype_producer};

newtype!(
    #[id(crate = crate)]
    pub struct HoleId(u32 is 0..=0xFFFF_FF00)
);

newtype_producer!(pub struct HoleIdProducer(HoleId));

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Infer {
    pub hole: HoleId,
}
