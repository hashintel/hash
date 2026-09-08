#[derive(Debug)]
pub(crate) struct NodeImportanceDelta {
    lookup: !,
    reverse: !,
}

impl Clone for NodeImportanceDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            lookup: self.lookup.clone(),
            reverse: self.reverse.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self { lookup, reverse } = self;

        lookup.clone_from(&source.lookup);
        reverse.clone_from(&source.reverse);
    }
}

#[derive(Debug)]
pub(crate) struct GeometryDelta {
    positions: !,
    spatial_index: !, // do we need these in the delta?
    morton_order: !,  // do we need these in the delta?
}

impl Clone for GeometryDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            positions: self.positions.clone(),
            spatial_index: self.spatial_index.clone(),
            morton_order: self.morton_order.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self {
            positions,
            spatial_index,
            morton_order,
        } = self;

        positions.clone_from(&source.positions);
        spatial_index.clone_from(&source.spatial_index);
        morton_order.clone_from(&source.morton_order);
    }
}

#[derive(Debug)]
pub(crate) struct LayoutDelta {
    importance: NodeImportanceDelta,
}

impl Clone for LayoutDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            importance: self.importance.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self { importance } = self;

        importance.clone_from(&source.importance);
    }
}
