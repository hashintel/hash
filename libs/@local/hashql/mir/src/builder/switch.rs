use core::ops::Deref;

use super::base::BaseBuilder;
use crate::body::{basic_block::BasicBlockId, operand::Operand, terminator::Target};

/// Builder for constructing switch targets.
///
/// Used within [`BasicBlockBuilder::switch`] to define cases and an optional default target.
pub struct SwitchBuilder<'env, 'heap> {
    pub(super) base: BaseBuilder<'env, 'heap>,
    pub(super) cases: Vec<(u128, Target<'heap>)>,
    pub(super) otherwise: Option<Target<'heap>>,
}

impl<'env, 'heap> SwitchBuilder<'env, 'heap> {
    pub(super) const fn new(base: BaseBuilder<'env, 'heap>) -> Self {
        Self {
            base,
            cases: Vec::new(),
            otherwise: None,
        }
    }

    /// Adds a case to the switch.
    ///
    /// Each case maps a discriminant value to a target block with optional arguments.
    /// Cases can be chained fluently.
    #[must_use]
    pub fn case(
        mut self,
        value: u128,
        block: BasicBlockId,
        args: impl AsRef<[Operand<'heap>]>,
    ) -> Self {
        self.cases.push((value, self.base.target(block, args)));
        self
    }

    /// Sets the otherwise (default) case.
    ///
    /// The otherwise case is taken when no explicit case matches the discriminant.
    #[must_use]
    pub fn otherwise(mut self, block: BasicBlockId, args: impl AsRef<[Operand<'heap>]>) -> Self {
        self.otherwise = Some(self.base.target(block, args));
        self
    }
}

impl<'env, 'heap> Deref for SwitchBuilder<'env, 'heap> {
    type Target = BaseBuilder<'env, 'heap>;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}
