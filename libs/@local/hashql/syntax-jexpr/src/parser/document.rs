use core::{alloc::Allocator, fmt, marker::PhantomData};

use rowan::GreenNode;

use crate::{cst, error::SyntaxError, syntax_kind::SyntaxKind};

/// Lossless Rowan parse tree whose root marker `R` selects the item from [`Document::tree`].
pub(crate) struct Document<R, A: Allocator> {
    tree: GreenNode,
    errors: Vec<SyntaxError<A>, A>,
    _root: PhantomData<fn() -> R>,
}

impl<R, A: Allocator> Document<R, A> {
    pub(crate) fn new(tree: GreenNode, errors: Vec<SyntaxError<A>, A>) -> Self {
        debug_assert_eq!(SyntaxKind::from_raw(tree.kind()), SyntaxKind::Root);

        Self {
            tree,
            errors,
            _root: PhantomData,
        }
    }

    #[must_use]
    pub(crate) fn into_green(self) -> GreenNode {
        self.tree
    }

    #[cfg(test)] // Consumed by lossless round-trip assertions in crate tests.
    #[must_use]
    pub(crate) const fn green(&self) -> &GreenNode {
        &self.tree
    }

    #[must_use]
    pub(crate) const fn errors(&self) -> &[SyntaxError<A>] {
        self.errors.as_slice()
    }

    #[cfg(any(test, feature = "bench"))] // Consumed by benchmark and crate test validity assertions.
    #[must_use]
    pub(crate) const fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }
}

impl<R, A: Allocator> Document<R, A>
where
    R: cst::TreeRoot,
{
    #[inline]
    #[must_use]
    pub(crate) fn tree(&self) -> cst::Root<'_, R::Item<'_>> {
        cst::Root::from_root(&self.tree)
    }
}

impl<R, A: Allocator> fmt::Debug for Document<R, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Document")
            .field("tree", &self.tree)
            .field("error_count", &self.errors.len())
            .finish()
    }
}
