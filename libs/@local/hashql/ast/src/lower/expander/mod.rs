mod error;

use hashql_core::{
    heap,
    module::{
        self, Reference, Universe,
        error::ResolutionError,
        namespace::{ModuleNamespace, ResolutionMode, ResolveOptions},
    },
    span::SpanId,
    symbol::Ident,
};

use self::error::ExpanderDiagnosticIssues;
use crate::{
    node::{self, id::NodeId},
    visit::{self, Visitor},
};

// What does the expander do?
// The expander does the following:
// 1. it resolves imports
// 2. once resolved, it expands special forms
pub struct Expander<'env, 'heap> {
    namespace: ModuleNamespace<'env, 'heap>,
    current_universe: Universe,
    diagnostics: ExpanderDiagnosticIssues,
    current_item: Option<module::item::Item<'heap>>,
    replace_with_dummy: bool,
}

impl<'env, 'heap> Expander<'env, 'heap> {
    pub const fn new(namespace: ModuleNamespace<'env, 'heap>) -> Self {
        Self {
            namespace,
            current_universe: Universe::Value,
            diagnostics: ExpanderDiagnosticIssues::new(),
            current_item: None,
            replace_with_dummy: false,
        }
    }
}

impl<'heap> Visitor<'heap> for Expander<'_, 'heap> {
    fn visit_path(&mut self, path: &mut node::path::Path<'heap>) {
        self.current_item = None;
        visit::walk_path(self, path);

        let [modules @ .., _] = &*path.segments else {
            todo!("BUG diagnostic: empty path, should never happen");
            self.replace_with_dummy = true;
            return;
        };

        // We don't support generics except for the *last* segment
        let mut should_continue = true;
        for module in modules {
            if !module.arguments.is_empty() {
                todo!(
                    "ERROR: generic arguments in module path, not supported (yet) – module items \
                     with self don't exist yet"
                );

                should_continue = false;
            }
        }

        if !should_continue {
            self.replace_with_dummy = true;
            return;
        }

        let reference = self.namespace.resolve(
            path.segments.iter().map(|segment| segment.name.value),
            ResolveOptions {
                universe: self.current_universe,
                mode: if path.rooted {
                    ResolutionMode::Absolute
                } else {
                    ResolutionMode::Relative
                },
            },
        );

        let reference = match reference {
            Ok(reference) => reference,
            Err(error) => {
                todo!("ERROR: convert from resolution error")
            }
        };

        let item = match reference {
            Reference::Binding(_) => {
                debug_assert_eq!(
                    path.segments.len(),
                    1,
                    "a binding should always only have a single segment"
                );

                return;
            }
            Reference::Item(item) => item,
        };

        self.current_item = Some(item);

        let absolute_path = item.absolute_path_rev(self.namespace.registry());
        path.segments.reverse();
        let mut last_span = path.span;

        for (index, name) in absolute_path.into_iter().enumerate() {
            if let Some(segment) = path.segments.get_mut(index) {
                last_span = path.span;
                segment.name.value = name;
            } else {
                path.segments.push(node::path::PathSegment {
                    id: NodeId::PLACEHOLDER,
                    span: last_span,
                    name: Ident {
                        span: last_span,
                        value: name,
                        kind: hashql_core::symbol::IdentKind::Lexical,
                    },
                    arguments: heap::Vec::new_in(self.namespace.registry().heap),
                });
            }
        }

        path.segments.reverse();
        path.rooted = true;
    }
}
