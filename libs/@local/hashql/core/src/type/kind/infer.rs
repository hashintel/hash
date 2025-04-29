use crate::{newtype, newtype_producer};

newtype!(
    pub struct HoleId(u32 is 0..=0xFFFF_FF00)
);

newtype_producer!(pub struct HoleIdProducer(HoleId));

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Infer {
    pub hole: HoleId,
}
