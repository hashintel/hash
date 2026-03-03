#[cfg(test)]
mod tests;

use super::TraversalPath;
use crate::{
    body::{
        local::Local,
        location::Location,
        place::{DefUse, Place, PlaceContext},
    },
    pass::execution::{VertexType, traversal::EntityPath},
    visit::{self, Visitor},
};

/// Outcome of resolving a vertex access to a storage path.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum TraversalResult {
    /// The access resolved to a specific storage location.
    Path(TraversalPath),
    /// The access could not be resolved; full entity hydration is required.
    Complete,
}

/// MIR visitor that resolves vertex field accesses to [`TraversalResult`]s.
///
/// Walks a body's places, finds uses of [`Local::VERTEX`], resolves the projection chain
/// via [`EntityPath::resolve`], and calls `on_traversal` with the [`Location`] and result.
// TODO: Each consumer (statement placement per target, island placement) resolves traversal paths
//   independently. Consider caching resolved paths per body to avoid redundant work.
//   See: https://linear.app/hash/issue/BE-435
pub(crate) struct TraversalAnalysisVisitor<F> {
    vertex: VertexType,
    on_traversal: F,
}

impl<F> TraversalAnalysisVisitor<F> {
    /// Creates a visitor for the given vertex type, calling `on_traversal` for each resolved
    /// vertex access.
    pub(crate) const fn new(vertex: VertexType, on_traversal: F) -> Self
    where
        F: FnMut(Location, TraversalResult),
    {
        Self {
            vertex,
            on_traversal,
        }
    }
}

impl<'heap, F> Visitor<'heap> for TraversalAnalysisVisitor<F>
where
    F: FnMut(Location, TraversalResult),
{
    type Result = Result<(), !>;

    fn visit_place(
        &mut self,
        location: Location,
        context: PlaceContext,
        place: &Place<'heap>,
    ) -> Self::Result {
        if place.local != Local::VERTEX {
            // We do not target the vertex itself, so no traversals need to be recorded.
            return Ok(());
        }

        if context.into_def_use() != Some(DefUse::Use) {
            // We're only interested in `DefUse::Use`
            return Ok(());
        }

        match self.vertex {
            VertexType::Entity => {
                let path = EntityPath::resolve(&place.projections);

                if let Some((path, _)) = path {
                    (self.on_traversal)(
                        location,
                        TraversalResult::Path(TraversalPath::Entity(path)),
                    );
                } else {
                    // The path doesn't map to any known storage location (e.g.
                    // `link_data.*.draft_id` is synthesized, not stored). To use the value at
                    // runtime we must fully hydrate the entity so the runtime can construct it.
                    (self.on_traversal)(location, TraversalResult::Complete);
                }
            }
        }

        visit::r#ref::walk_place(self, location, context, place)
    }
}
