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

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum TraversalResult {
    Path(TraversalPath),
    Complete,
}

// TODO: Each consumer (statement placement per target, island placement) resolves traversal paths
//   independently. Consider caching resolved paths per body to avoid redundant work.
//   See: https://linear.app/hash/issue/BE-435
pub(crate) struct TraversalAnalysisVisitor<F> {
    vertex: VertexType,
    on_traversal: F,
}

impl<F> TraversalAnalysisVisitor<F> {
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
