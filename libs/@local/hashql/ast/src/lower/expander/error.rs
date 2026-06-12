use alloc::borrow::Cow;
use core::fmt::{self, Display, Write as _};

use hashql_core::{
    algorithms::did_you_mean,
    collections::FastHashSet,
    module::{
        ModuleId, ModuleRegistry, Universe,
        error::{ResolutionError, ResolutionSuggestion},
        import::Import,
        item::Item,
        namespace::ModuleNamespace,
    },
    span::{SpanId, Spanned},
    symbol::Symbol,
};
use hashql_diagnostics::{
    Diagnostic, DiagnosticIssues, Label, Patch, Suggestions,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

use crate::node::path::{Path, PathSegment, PathSegmentArgument};

pub(crate) type ExpanderDiagnostic = Diagnostic<ExpanderDiagnosticCategory, SpanId>;

pub(crate) type ExpanderDiagnosticIssues = DiagnosticIssues<ExpanderDiagnosticCategory, SpanId>;

const EMPTY_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty-path",
    name: "Empty path",
};

const ABSOLUTE_PATH_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "absolute-path-mismatch",
    name: "Absolute path length mismatch",
};

const GENERIC_ARGUMENTS_IN_MODULE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-arguments-in-module",
    name: "Generic arguments in module path",
};

const UNRESOLVED_VARIABLE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unresolved-variable",
    name: "Unresolved variable",
};

const PACKAGE_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "package-not-found",
    name: "Package not found",
};

const MODULE_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "module-not-found",
    name: "Module not found",
};

const IMPORT_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "import-not-found",
    name: "Import not found",
};

const ITEM_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "item-not-found",
    name: "Item not found",
};

const MODULE_REQUIRED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "module-required",
    name: "Module required",
};

const AMBIGUOUS_NAME: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "ambiguous-name",
    name: "Ambiguous name",
};

const EMPTY_MODULE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty-module",
    name: "Empty module",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ExpanderDiagnosticCategory {
    EmptyPath,
    AbsolutePathMismatch,
    GenericArgumentsInModule,
    UnresolvedVariable,
    PackageNotFound,
    ModuleNotFound,
    ImportNotFound,
    ItemNotFound,
    ModuleRequired,
    AmbiguousName,
    EmptyModule,
}

impl DiagnosticCategory for ExpanderDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("expander")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Expander")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::EmptyPath => Some(&EMPTY_PATH),
            Self::AbsolutePathMismatch => Some(&ABSOLUTE_PATH_MISMATCH),
            Self::GenericArgumentsInModule => Some(&GENERIC_ARGUMENTS_IN_MODULE),
            Self::UnresolvedVariable => Some(&UNRESOLVED_VARIABLE),
            Self::PackageNotFound => Some(&PACKAGE_NOT_FOUND),
            Self::ModuleNotFound => Some(&MODULE_NOT_FOUND),
            Self::ImportNotFound => Some(&IMPORT_NOT_FOUND),
            Self::ItemNotFound => Some(&ITEM_NOT_FOUND),
            Self::ModuleRequired => Some(&MODULE_REQUIRED),
            Self::AmbiguousName => Some(&AMBIGUOUS_NAME),
            Self::EmptyModule => Some(&EMPTY_MODULE),
        }
    }
}

/// Formats a user-written path prefix up to (and including) a given depth.
struct FormatUserPath<'a, 'heap> {
    rooted: bool,
    segments: &'a [PathSegment<'heap>],
    up_to: Option<usize>,
}

impl Display for FormatUserPath<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.rooted {
            fmt.write_str("::")?;
        }

        let segments = match self.up_to {
            Some(depth) => &self.segments[..=depth],
            None => self.segments,
        };

        for (index, segment) in segments.iter().enumerate() {
            if index > 0 {
                fmt.write_str("::")?;
            }

            Display::fmt(&segment.name.value, fmt)?;
        }

        Ok(())
    }
}

/// Formats a canonical absolute path (always `::` prefixed) for an item in the registry.
fn format_absolute_path<'heap>(item: &Item<'heap>, registry: &ModuleRegistry<'heap>) -> String {
    use core::iter;

    let path = item.absolute_path(registry).into_iter().map(Symbol::unwrap);

    iter::once("").chain(path).intersperse("::").collect()
}

pub struct SpellingSuggestions<'heap, I> {
    name: Spanned<Symbol<'heap>>,
    candidates: I,
    context: &'static str,

    top_n: usize = 5,
    cutoff: Option<f64> = None,
}

impl<'heap, I> SpellingSuggestions<'heap, I> {
    fn emit(self, diagnostic: &mut ExpanderDiagnostic) -> Vec<Symbol<'heap>>
    where
        I: IntoIterator<Item = Symbol<'heap>> + Clone,
    {
        let similar = did_you_mean(
            self.name.value,
            self.candidates,
            Some(self.top_n),
            self.cutoff,
        );

        let len = similar.len();

        let patches: Vec<_> = similar
            .iter()
            .copied()
            .map(|candidate| Patch::new(self.name.span, candidate.as_str().to_owned()))
            .collect();

        let Some(suggestions) = Suggestions::try_from_iter(patches) else {
            debug_assert_eq!(len, 0);
            return similar;
        };

        diagnostic.add_message(Message::help(self.context).with_suggestions(suggestions));
        similar
    }
}

pub(crate) fn empty_path(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::EmptyPath, Severity::Bug)
        .primary(Label::new(span, "path has no segments"));

    diagnostic.add_message(Message::note(
        "after parsing and lowering, every path must contain at least one segment",
    ));

    diagnostic
}

pub(crate) fn absolute_path_mismatch(
    path_span: SpanId,
    path_length: usize,
    absolute_length: usize,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::AbsolutePathMismatch,
        Severity::Bug,
    )
    .primary(Label::new(
        path_span,
        format!("path has {path_length} segments but resolved to only {absolute_length}"),
    ));

    diagnostic.add_message(Message::note(
        "expansion can only prepend omitted ancestors, so the resolved absolute path must be at \
         least as long as the user's path",
    ));

    diagnostic
}

pub(crate) fn generic_arguments_in_module(
    module_segments: &[PathSegment<'_>],
    path_span: SpanId,
) -> ExpanderDiagnostic {
    let mut arguments = module_segments
        .iter()
        .flat_map(|segment| &segment.arguments);

    let primary_span = arguments
        .next()
        .map_or(path_span, PathSegmentArgument::span);

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::GenericArgumentsInModule,
        Severity::Error,
    )
    .primary(Label::new(
        primary_span,
        "generic argument not allowed here",
    ));

    for argument in arguments {
        diagnostic.add_label(Label::new(argument.span(), "neither is this"));
    }

    diagnostic.add_message(Message::help(
        "move the generic arguments to the final segment of the path, or remove them",
    ));

    diagnostic.add_message(Message::note(
        "modules are not generic; only the final item in a path can be parameterized",
    ));

    diagnostic
}

/// Converts a `ResolutionError` into an expander diagnostic.
pub(crate) fn from_resolution_error<'heap>(
    path: &Path<'heap>,
    namespace: &ModuleNamespace<'_, 'heap>,
    universe: Universe,
    error: ResolutionError<'heap>,
) -> ExpanderDiagnostic {
    match error {
        ResolutionError::InvalidQueryLength { expected } => invalid_query_length(path, expected),
        ResolutionError::ModuleRequired { depth, found } => module_required(path, depth, found),
        ResolutionError::PackageNotFound {
            depth,
            name,
            suggestions,
        } => package_not_found(path, depth, name, &suggestions),
        ResolutionError::ModuleNotFound {
            depth,
            name,
            suggestions,
        } => module_not_found(path, depth, name, &suggestions),
        ResolutionError::ImportNotFound {
            depth,
            name,
            suggestions,
        } => {
            if depth == 0 && path.segments.len() == 1 {
                unresolved_variable(path, name, namespace, universe, &suggestions)
            } else {
                import_not_found(path, depth, name, &suggestions)
            }
        }
        ResolutionError::ItemNotFound {
            depth,
            name,
            suggestions,
        } => item_not_found(path, depth, name, &suggestions),
        ResolutionError::Ambiguous(reference) => ambiguous_name(path, reference.name()),
        ResolutionError::ModuleEmpty { depth } => empty_module(path, depth),
    }
}

fn invalid_query_length(path: &Path<'_>, expected: usize) -> ExpanderDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::ImportNotFound, Severity::Error)
            .primary(Label::new(path.span, "path is too short to resolve"));

    diagnostic.add_message(Message::help(format!(
        "provide a path with at least {expected} segments, for example `module::item`",
    )));

    diagnostic
}

fn module_required(path: &Path<'_>, depth: usize, found: Option<Universe>) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];
    let user_path = FormatUserPath {
        rooted: path.rooted,
        segments: &path.segments,
        up_to: Some(depth),
    };

    let kind_description = match found {
        Some(Universe::Value) => "a value",
        Some(Universe::Type) => "a type",
        None => "not a module",
    };

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::ModuleRequired, Severity::Error).primary(
            Label::new(
                segment.name.span,
                format!("`{user_path}` is {kind_description}, not a module"),
            ),
        );

    if depth + 1 < path.segments.len() {
        diagnostic.add_label(Label::new(
            path.segments[depth + 1].name.span,
            "cannot access items inside a non-module",
        ));
    }

    let help = match found {
        Some(Universe::Value) => "if you meant to access a field, use `.` instead of `::`",
        Some(Universe::Type) | None => "only modules can contain sub-items accessible via `::`",
    };

    diagnostic.add_message(Message::help(help));

    diagnostic.add_message(Message::note(
        "the `::` separator navigates into modules; values and types do not contain sub-items",
    ));

    diagnostic
}

fn package_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, ModuleId>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::PackageNotFound, Severity::Error).primary(
            Label::new(segment.name.span, format!("cannot find package `{name}`")),
        );

    diagnostic.add_label(Label::new(path.span, "in this path"));

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a package with a similar name exists",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() {
        diagnostic.add_message(Message::help(
            "check the package name, or add it to the project dependencies",
        ));
    }

    diagnostic.add_message(Message::note(
        "absolute paths start from an installed package",
    ));

    diagnostic
}

fn module_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, Item<'heap>>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];
    let parent_path = FormatUserPath {
        rooted: path.rooted,
        segments: &path.segments,
        up_to: (depth > 0).then_some(depth - 1),
    };

    let primary_message = if depth > 0 {
        format!("cannot find module `{name}` in `{parent_path}`")
    } else {
        format!("cannot find module `{name}`")
    };

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::ModuleNotFound, Severity::Error)
            .primary(Label::new(segment.name.span, primary_message));

    if depth > 0 {
        diagnostic.add_label(Label::new(
            path.segments[depth - 1].name.span,
            "looked in this module",
        ));
    }

    SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a module with a similar name exists",
        ..
    }
    .emit(&mut diagnostic);

    diagnostic.add_message(Message::note(
        "only exported sub-modules are reachable via `::`",
    ));

    diagnostic
}

fn import_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, Import<'heap>>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::ImportNotFound, Severity::Error).primary(
            Label::new(segment.name.span, format!("`{name}` is not imported")),
        );

    diagnostic.add_label(Label::new(path.span, "in this path"));

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a similar name is available",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() {
        diagnostic.add_message(Message::help(
            "import the name with a `use` statement, or qualify it with a full path",
        ));
    }

    diagnostic
}

fn item_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, Item<'heap>>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];

    let primary_message = if depth > 0 {
        let parent_path = FormatUserPath {
            rooted: path.rooted,
            segments: &path.segments,
            up_to: Some(depth - 1),
        };

        format!("cannot find `{name}` in module `{parent_path}`")
    } else {
        format!("cannot find `{name}` in this scope")
    };

    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::ItemNotFound, Severity::Error)
        .primary(Label::new(segment.name.span, primary_message));

    if depth > 0 {
        diagnostic.add_label(Label::new(
            path.segments[depth - 1].name.span,
            "looked in this module",
        ));
    }

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a similar item exists in this module",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() {
        diagnostic.add_message(Message::help(
            "check the spelling and ensure the item is exported",
        ));
    }

    diagnostic
}

/// A single unqualified name could not be found in scope.
///
/// This is the most common resolution failure. Suggestions are tiered:
///
/// 1. **Local bindings**: names bound by `let`, `fn` parameters, etc.
/// 2. **Imported names**: names brought into scope by `use`
/// 3. **Registry items**: names available in the module registry but not yet imported
///
/// Each tier produces Patches: tiers 1 and 2 replace the identifier with the
/// corrected spelling; tier 3 replaces it with the fully qualified path.
fn unresolved_variable<'heap>(
    path: &Path<'heap>,
    name: Symbol<'heap>,
    namespace: &ModuleNamespace<'_, 'heap>,
    universe: Universe,
    import_suggestions: &[ResolutionSuggestion<'heap, Import<'heap>>],
) -> ExpanderDiagnostic {
    let registry = namespace.registry();
    let locals = namespace.locals(universe);
    let name_span = path.segments[0].name.span;

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::UnresolvedVariable,
        Severity::Error,
    )
    .primary(Label::new(
        name_span,
        format!("cannot find `{name}` in this scope"),
    ));

    let mut has_suggestions = false;

    // ---- tier 1: local bindings ----
    let emitted = SpellingSuggestions {
        name: Spanned {
            span: name_span,
            value: name,
        },
        candidates: locals.iter().copied(),
        context: "a similar local binding exists",
        ..
    }
    .emit(&mut diagnostic);
    has_suggestions |= !emitted.is_empty();

    // ---- tier 2: already-imported names ----
    let emitted = SpellingSuggestions {
        name: Spanned {
            span: name_span,
            value: name,
        },
        candidates: import_suggestions.iter().map(|suggestion| suggestion.name),
        context: "a similar imported name exists",
        ..
    }
    .emit(&mut diagnostic);
    has_suggestions |= !emitted.is_empty();

    // ---- tier 3: items available elsewhere in the registry ----
    let importable: Vec<_> = registry
        .search_by_name(name, universe)
        .into_iter()
        .collect();

    if let Some(suggestions) = Suggestions::try_from_iter(
        importable
            .iter()
            .take(5)
            .map(|item| Patch::new(name_span, format_absolute_path(item, registry))),
    ) {
        diagnostic.add_message(
            Message::help("this item is available in another module").with_suggestions(suggestions),
        );
    }

    if let Some(first) = importable.first() {
        // Show how to import instead (text-only, no insertion span available)
        let absolute = format_absolute_path(first, registry);
        diagnostic.add_message(Message::note(format!(
            "alternatively, bring it into scope: `use {absolute} in`",
        )));
    }

    let remaining = importable.len().saturating_sub(5);
    if remaining > 0 {
        diagnostic.add_message(Message::note(format!(
            "{remaining} more items with this name exist in other modules",
        )));
        has_suggestions = true;
    }

    if !has_suggestions {
        diagnostic.add_message(Message::help(
            "check the spelling, or import the name with a `use` statement",
        ));
    }

    diagnostic.add_message(Message::note(
        "this could be a typo, a name used outside its scope, or a missing declaration; if it is \
         a function or type from another module, you may need to import it first",
    ));

    diagnostic
}

fn ambiguous_name(path: &Path<'_>, name: Symbol<'_>) -> ExpanderDiagnostic {
    let name_span = path
        .segments
        .iter()
        .find_map(|segment| (segment.name.value == name).then_some(segment.name.span))
        .unwrap_or(path.span);

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::AmbiguousName, Severity::Error).primary(
            Label::new(name_span, format!("`{name}` refers to multiple items")),
        );

    diagnostic.add_label(Label::new(path.span, "in this path"));

    diagnostic.add_message(Message::help(
        "use a fully qualified path to specify which item you mean",
    ));

    diagnostic.add_message(Message::note(
        "multiple items with this name are in scope; consider using explicit imports instead of \
         globs to prevent conflicts",
    ));

    diagnostic
}

fn empty_module(path: &Path<'_>, depth: usize) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];
    let user_path = FormatUserPath {
        rooted: path.rooted,
        segments: &path.segments,
        up_to: Some(depth),
    };

    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::EmptyModule, Severity::Error)
        .primary(Label::new(
            segment.name.span,
            format!("module `{user_path}` has no exported items"),
        ));

    diagnostic.add_label(Label::new(path.span, "in this path"));

    diagnostic.add_message(Message::help(
        "check that the module path is correct, or import a specific item instead of the module",
    ));

    diagnostic
}
