use core::ops::Deref;

use super::base::BaseBuilder;
use crate::body::{basic_block::BasicBlockId, operand::Operand, terminator::Target};

/// Builder for constructing switch targets.
///
/// Used within [`BasicBlockBuilder::switch`] to define cases and an optional default target.
///
/// [`BasicBlockBuilder::switch`]: super::BasicBlockBuilder::switch
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

#[doc(hidden)]
#[macro_export]
macro_rules! switch {
    ($resume:path; $payload:tt; [$($cases:tt)*]; $($rest:tt)*) => {
        $resume!(@switch |mut switch| {
            $crate::builder::_private::switch!(@case switch; $($cases)*);
            switch
        }; $payload; $($rest)*)
    };
    (@case $switch:ident;) => {};
    (@case $switch:ident; $value:literal => $block:ident($($args:tt),*) $(, $($rest:tt)+)?) => {
        let args = [$($crate::builder::_private::operand!(*$switch; $args)),*];
        $switch = $switch.case($value, $block, args);
        $crate::builder::_private::switch!(@case $switch; $($($rest)*)?);
    };
    (@case $switch:ident; _ => $block:ident($($args:tt),*) $(, $($rest:tt)+)?) => {
        let args = [$($crate::builder::_private::operand!(*$switch; $args)),*];
        $switch = $switch.otherwise($block, args);
        $crate::builder::_private::switch!(@case $switch; $($($rest)*)?);
    };
}

pub use switch;
