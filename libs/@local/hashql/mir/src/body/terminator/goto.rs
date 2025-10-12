use super::target::Target;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Goto<'heap> {
    pub target: Target<'heap>,
}
