//! Internal implementation of the self referential structure using orx

use orx_selfref_col::{
    MemoryReclaimNever, Node, NodeDataLazyClose, NodeRefNone, SelfRefCol, Variant,
};
use orx_split_vec::{Recursive, SplitVec};

use super::r#ref::NodeRefsSmallVec;
use crate::frame::BoxedFrameImpl;

const INLINE_CAPACITY: usize = 4;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct ReportVariant;

impl<'a> Variant<'a, BoxedFrameImpl> for ReportVariant {
    /// The current set of frames
    type Ends = NodeRefsSmallVec<'a>;
    type MemoryReclaim = MemoryReclaimNever;
    /// The sources of the frame
    type Next = NodeRefsSmallVec<'a>;
    type Prev = NodeRefNone;
    type Storage = NodeDataLazyClose<BoxedFrameImpl>;
}

type Storage<'a> = SplitVec<Node<'static, ReportVariant, BoxedFrameImpl>, Recursive>;
type Collection<'a> = SelfRefCol<'static, ReportVariant, BoxedFrameImpl, Storage<'a>>;
pub(crate) type FrameNode<'a> = Node<'a, ReportVariant, BoxedFrameImpl>;

pub(crate) struct ReportImpl {
    frames: Collection<'static>,
}

impl ReportImpl {
    fn new() -> Self {
        Self {
            frames: Collection::new(),
        }
    }

    pub(crate) fn push_frame(&mut self, frame: BoxedFrameImpl) {
        self.frames.mutate(frame, |vec, frame| {
            let reference = vec.push_get_ref(frame);
            vec.set_ends_refs(NodeRefsSmallVec::new(reference));
        })
    }

    pub(crate) fn stack_frame(&mut self, frame: BoxedFrameImpl) {
        self.frames.mutate(frame, |mut vec, frame| {
            let node = vec.push_get_ref(frame);
            let ends = vec.ends().clone();

            // set the ends to the node, then for the node set the next to ends
            node.set_next(&mut vec, ends);
            vec.set_ends_refs(NodeRefsSmallVec::new(node));
        })
    }

    pub(crate) fn combine(&mut self, other: Self) {
        self.frames.append_mutate(other.frames, (), |x, y, ()| {
            // I'd like to avoid the clone here, but I am unsure how that could be achieved without
            // direct access to `ends_mut`
            let x_ends = x.ends().clone();
            let y_ends = y.ends().clone();

            x.set_ends_refs(x_ends.with(y_ends));
        })
    }
}
