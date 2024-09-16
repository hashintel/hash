use orx_selfref_col::{Node, NodeRefs};
use smallvec::SmallVec;

use crate::{frame::BoxedFrameImpl, Frame};

const INLINE_CAPACITY: usize = 4;

type InnerVec<'a> = SmallVec<[Frame<'a>; INLINE_CAPACITY]>;

pub(crate) struct NodeRefsSmallVec<'a>(InnerVec<'a>);

impl<'a> NodeRefsSmallVec<'a> {
    pub(crate) fn new(initial: &'a FrameNode<'a>) -> Self {
        let mut vec = SmallVec::new();
        vec.push(Frame::new(initial));

        Self(vec)
    }

    pub(crate) fn with(mut self, other: Self) -> Self {
        self.0.extend(other.0);
        self
    }

    pub(crate) fn as_slice(&self) -> &[Frame<'a>] {
        self.0.as_slice()
    }
}

impl<'a> NodeRefs<'a, ReportVariant, BoxedFrameImpl> for NodeRefsSmallVec<'a> {
    type References = InnerVec<'a>;

    #[inline]
    fn new(references: Self::References) -> Self {
        Self(references)
    }

    #[inline]
    fn get(&self) -> &Self::References {
        &self.0
    }

    #[inline]
    fn get_mut(&mut self) -> &mut Self::References {
        &mut self.0
    }

    fn update_reference(
        &mut self,
        prior_reference: &'a Node<'a, ReportVariant, BoxedFrameImpl>,
        new_reference: &'a Node<'a, ReportVariant, BoxedFrameImpl>,
    ) {
        for current_reference in &mut self.0 {
            if current_reference.node().ref_eq(prior_reference) {
                *current_reference = Frame::new(new_reference);
            }
        }
    }

    fn referenced_nodes(
        &self,
    ) -> impl Iterator<Item = &'a Node<'a, ReportVariant, BoxedFrameImpl>> {
        self.0.iter().map(|frame| frame.into_node())
    }
}

impl<'a> Default for NodeRefsSmallVec<'a> {
    fn default() -> Self {
        Self(SmallVec::new())
    }
}

impl<'a> Clone for NodeRefsSmallVec<'a> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}
