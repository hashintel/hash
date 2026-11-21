use core::{fmt, marker::PhantomData};

use jsonptr::PointerBuf;
use rowan::GreenNode;
use text_size::{TextRange, TextSize};

use crate::{
    cst,
    error::SyntaxError,
    pointer,
    syntax_kind::{SyntaxKind, SyntaxNode},
};

/// Lossless Rowan parse tree whose root marker `R` selects the item from [`Document::tree`].
pub struct Document<R> {
    tree: GreenNode,
    errors: Vec<SyntaxError>,
    _root: PhantomData<fn() -> R>,
}

impl<R> Document<R> {
    pub(crate) fn new(tree: GreenNode, errors: Vec<SyntaxError>) -> Self {
        debug_assert_eq!(SyntaxKind::from_raw(tree.kind()), SyntaxKind::Root);

        Self {
            tree,
            errors,
            _root: PhantomData,
        }
    }

    #[must_use]
    pub const fn green(&self) -> &GreenNode {
        &self.tree
    }

    /// Builds an owned red-tree [`SyntaxNode`] root on demand.
    #[must_use]
    pub fn syntax(&self) -> SyntaxNode {
        SyntaxNode::new_root(self.tree.clone())
    }

    #[must_use]
    pub const fn errors(&self) -> &[SyntaxError] {
        self.errors.as_slice()
    }

    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }

    /// Derives the RFC 6901 JSON Pointer for `range`, or `None` outside the source bounds.
    #[must_use]
    pub fn json_pointer(&self, range: TextRange) -> Option<PointerBuf> {
        pointer::json_pointer_for_range(
            cst::SyntaxNodeData {
                data: &self.tree,
                offset: TextSize::new(0),
            },
            range,
        )
    }
}

impl<R> Document<R>
where
    R: cst::TreeRoot,
{
    #[inline]
    #[must_use]
    pub fn tree(&self) -> cst::Root<'_, R::Item<'_>> {
        cst::Root::from_root(&self.tree)
    }
}

impl<R> fmt::Debug for Document<R> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Document")
            .field("tree", &self.tree)
            .field("errors", &self.errors)
            .finish()
    }
}

impl<R> Clone for Document<R> {
    fn clone(&self) -> Self {
        Self {
            tree: self.tree.clone(),
            errors: self.errors.clone(),
            _root: PhantomData,
        }
    }
}

impl<R> PartialEq for Document<R> {
    fn eq(&self, other: &Self) -> bool {
        self.tree == other.tree && self.errors == other.errors
    }
}

impl<R> Eq for Document<R> {}
