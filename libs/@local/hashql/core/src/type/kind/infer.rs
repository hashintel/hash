use crate::newtype;

newtype!(
    pub struct HoleId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Infer {
    pub hole: HoleId,
}
