use alloc::borrow::Cow;
use core::{
    fmt::{self, Display, Write as _},
    iter,
};

use hashql_core::{
    collection::FastHashSet,
    module::{
        ModuleRegistry,
        error::{ResolutionError, ResolutionSuggestion},
        import::Import,
        item::Universe,
    },
    span::SpanId,
    symbol::{Ident, Symbol},
};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    color::{AnsiColor, Color},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};
use strsim::jaro_winkler;

use crate::node::path::Path;

pub(crate) type ImportResolverDiagnostic = Diagnostic<ImportResolverDiagnosticCategory, SpanId>;

const GENERIC_ARGUMENTS_IN_USE_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-arguments-in-use-path",
    name: "Generic arguments not allowed in import paths",
};

const EMPTY_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty-path",
    name: "Empty path in import statement",
};

const GENERIC_ARGUMENTS_IN_MODULE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-arguments-in-module",
    name: "Generic arguments only allowed in final path segment",
};

const UNRESOLVED_IMPORT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unresolved-import",
    name: "Unresolved import",
};

const UNRESOLVED_VARIABLE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unresolved-variable",
    name: "Unresolved variable",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ImportResolverDiagnosticCategory {
    GenericArgumentsInUsePath,
    EmptyPath,
    GenericArgumentsInModule,
    UnresolvedImport,
    UnresolvedVariable,
}

impl DiagnosticCategory for ImportResolverDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("import-resolver")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Import Resolver")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::GenericArgumentsInUsePath => Some(&GENERIC_ARGUMENTS_IN_USE_PATH),
            Self::EmptyPath => Some(&EMPTY_PATH),
            Self::GenericArgumentsInModule => Some(&GENERIC_ARGUMENTS_IN_MODULE),
            Self::UnresolvedImport => Some(&UNRESOLVED_IMPORT),
            Self::UnresolvedVariable => Some(&UNRESOLVED_VARIABLE),
        }
    }
}

/// Error when generic arguments are used in a use path segment
pub(crate) fn generic_arguments_in_use_path(
    span: SpanId,
    use_span: SpanId,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInUsePath,
        Severity::Bug,
    );

    // Add primary and secondary labels
    diagnostic.labels.extend([
        Label::new(span, "Remove these generic arguments")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
        Label::new(use_span, "In this import statement")
            .with_order(1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    ]);

    diagnostic.add_help(Help::new(
        "Use statements don't accept generic type parameters. Remove the angle brackets and type \
         parameters.\n\nExample: Use `module::Type` instead of `module::Type<T>`.",
    ));

    diagnostic.add_note(Note::new(
        "This error is still valid, but should've been caught in an earlier stage of the compiler \
         pipeline.",
    ));

    diagnostic
}

/// Error when a path has no segments
pub(crate) fn empty_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ImportResolverDiagnosticCategory::EmptyPath, Severity::Bug);

    diagnostic.labels.push(
        Label::new(span, "Specify a path here")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.add_help(Help::new(
        "Add a valid path with at least one identifier, such as `module` or `module::item`.",
    ));

    diagnostic.add_note(Note::new(
        "Import statements require a non-empty path to identify what module or item you want to \
         bring into scope. This error is still valid, but should've been caught in an earlier \
         stage of the compiler pipeline.",
    ));

    diagnostic
}

/// Error when generic arguments are used in a module path segment
pub(crate) fn generic_arguments_in_module(
    spans: impl IntoIterator<Item = SpanId>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInModule,
        Severity::Error,
    );

    let mut spans = spans.into_iter();
    let primary = spans.next().expect("spans should be non-empty");

    // Primary label highlighting the invalid generic arguments
    diagnostic.labels.push(
        Label::new(primary, "Remove this generic argument")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
    for (index, secondary) in spans.enumerate() {
        diagnostic.labels.push(
            Label::new(secondary, "... and this generic argument")
                .with_order(-((index + 1) as i32))
                .with_color(Color::Ansi(AnsiColor::Red)),
        );
    }

    diagnostic.add_help(Help::new(
        "Generic arguments can only appear on the final type in a path. Remove them from this \
         module segment or move them to the final type in the path.\n\nCorrect: \
         `module::submodule::Type<T>`\nIncorrect: `module<T>::submodule::Type`",
    ));

    diagnostic.add_note(Note::new(
        "Module paths don't accept generic parameters because modules themselves aren't generic. \
         Only the final type in a path can have generic parameters.\n\nThe path resolution \
         happens before any generic type checking, so generic arguments can only be applied after \
         the item is found.",
    ));

    diagnostic
}

/// Format suggestions for display in diagnostics
fn format_suggestions<T>(
    suggestions: &mut [ResolutionSuggestion<T>],
    mut render: impl for<'a> FnMut(&'a T) -> Cow<'a, str>,
) -> Option<String> {
    if suggestions.is_empty() {
        return None;
    }

    // Sort by score (descending)
    suggestions.sort_by(
        |ResolutionSuggestion { score: lhs, .. }, ResolutionSuggestion { score: rhs, .. }| {
            rhs.total_cmp(lhs)
        },
    );

    // Good suggestions have a score above 0.7
    let good_suggestions_len =
        suggestions.partition_point(|&ResolutionSuggestion { score, .. }| score > 0.7);

    if good_suggestions_len == 0 {
        // Fall back to taking the top 3 suggestions regardless of score, these are never empty, due
        // to the check above
        let suggestion: String = suggestions
            .iter()
            .take(3)
            .map(|suggestion| render(&suggestion.item))
            .intersperse(Cow::Borrowed("`, `"))
            .collect();

        let remaining = suggestions.len().saturating_sub(3);
        let suffix = match remaining {
            0 => String::new(),
            1 => format!(" and `{}`", render(&suggestions[3].item)),
            _ => format!(" and {remaining} others"),
        };

        return Some(format!(
            "\n\nPossible alternatives are `{suggestion}`{suffix}."
        ));
    }

    // Format the good suggestions with markdown-style backticks
    let suggestion: String = suggestions
        .iter()
        .take_while(|&&ResolutionSuggestion { score, .. }| score > 0.7)
        .map(|suggestion| render(&suggestion.item))
        .intersperse(Cow::Borrowed("`, `"))
        .collect();

    Some(format!("\n\nDid you mean: `{suggestion}`?"))
}

struct FormatPath<'a, 'heap>(bool, &'a [(SpanId, Symbol<'heap>)], Option<usize>);

impl Display for FormatPath<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let &Self(rooted, segments, depth) = self;

        if rooted {
            fmt.write_str("::")?;
        }

        let segments = depth.map_or(segments, |depth| &segments[..=depth]);

        for (index, (_, segment)) in segments.iter().enumerate() {
            if index > 0 {
                fmt.write_str("::")?;
            }

            Display::fmt(segment, fmt)?;
        }

        Ok(())
    }
}

#[expect(clippy::too_many_lines)]
pub(crate) fn unresolved_variable<'heap>(
    registry: &ModuleRegistry<'heap>,
    universe: Universe,
    ident: Ident<'heap>,
    locals: &FastHashSet<Symbol<'heap>>,
    mut suggestions: Vec<ResolutionSuggestion<Import<'heap>>>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::UnresolvedVariable,
        Severity::Error,
    );

    diagnostic.labels.push(
        Label::new(
            ident.span,
            format!("Cannot find variable '{}'", ident.value),
        )
        .with_order(0)
        .with_color(Color::Ansi(AnsiColor::Red)),
    );

    // Remove any suggestions that are already in the locals set
    suggestions.retain(|suggestion| !locals.contains(&suggestion.item.name));
    let import_suggestions: FastHashSet<_> = suggestions
        .iter()
        .map(|suggestion| suggestion.item.name)
        .collect();

    // Find similar local variables
    let mut local_suggestions: Vec<_> = locals
        .into_iter()
        .filter_map(|&local| {
            let score = jaro_winkler(ident.value.as_str(), local.as_str());
            // Only include suggestions with a reasonably high similarity
            (score > 0.7).then_some((local, score))
        })
        .collect();

    // Sort by similarity score (highest first)
    local_suggestions.sort_unstable_by(|&(_, lhs), &(_, rhs)| rhs.total_cmp(&lhs));

    let mut help = format!("The name '{}' doesn't exist in this scope.", ident.value);

    // Local variable suggestions section
    if !local_suggestions.is_empty() {
        help.push_str("\n\nDid you mean one of these local variables?\n");

        for (local, _) in local_suggestions.iter().take(3) {
            let _: fmt::Result = writeln!(help, "  - `{local}`");
        }

        if local_suggestions.len() > 3 {
            let remaining = local_suggestions.len() - 3;
            let _: fmt::Result = writeln!(help, "  - and {remaining} more similar variables");
        }
    }

    // Imported item suggestions section
    if !suggestions.is_empty() {
        // Add a connector if we've already shown local suggestions
        if local_suggestions.is_empty() {
            help.push_str("\n\nPerhaps you meant ");
        } else {
            help.push_str("\nOr perhaps you meant ");
        }

        help.push_str("one of these imported items?\n");

        // Sort and filter imported item suggestions by score
        suggestions.sort_by(|lhs, rhs| rhs.score.total_cmp(&lhs.score));
        let good_suggestions: Vec<_> = suggestions
            .iter()
            .filter(|suggestion| suggestion.score > 0.7)
            .take(3)
            .collect();

        if good_suggestions.is_empty() {
            // Fall back to showing any suggestions if none have high similarity
            for suggestion in suggestions.iter().take(3) {
                let _: fmt::Result = writeln!(help, "  - `{}`", suggestion.item.name);
            }

            if suggestions.len() > 3 {
                let remaining = suggestions.len() - 3;
                let _: fmt::Result = writeln!(help, "  - and {remaining} more imported items");
            }
        } else {
            for suggestion in &good_suggestions {
                let _: fmt::Result = writeln!(help, "  - `{}`", suggestion.item.name);
            }
        }
    }

    // Check if there are any importable items by the same name (that aren't already imported)
    let importable: Vec<_> = registry
        .search_by_name(ident.value, universe)
        .into_iter()
        .filter(|item| !locals.contains(&item.name) && !import_suggestions.contains(&item.name))
        .collect();

    if !importable.is_empty() {
        help.push_str("\nAdditionally, items with a similar name exist in other modules:\n");

        // Display up to 3 importable items with their full paths
        for item in importable.iter().take(3) {
            let absolute_path: String = iter::once("") // Start with an empty string for leading "::"
                .chain(item.absolute_path(registry).map(|symbol| symbol.unwrap()))
                .intersperse("::")
                .collect();

            let _: fmt::Result = writeln!(help, "  - `{absolute_path}`");
        }

        if importable.len() > 3 {
            let remaining = importable.len() - 3;
            let _: fmt::Result =
                writeln!(help, "  - and {remaining} more items available for import");
        }
    }

    // Suggest how to use the first (best) match from the importable items
    if let Some(item) = importable.first() {
        let absolute_path: String = iter::once("")
            .chain(item.absolute_path(registry).map(|symbol| symbol.unwrap()))
            .intersperse("::")
            .collect();

        help.push_str("\nTo use an item like ");
        let _: fmt::Result = write!(help, "`{absolute_path}`");
        help.push_str(", you can either:\n");

        // Option 1: Import statement
        help.push_str("1. Add an import at the beginning of your file:\n");
        let _: fmt::Result = writeln!(help, "     use {absolute_path} in");

        // Option 2: Fully qualified path
        help.push_str("2. Use its fully qualified path directly in your code:\n");
        let _: fmt::Result = writeln!(help, "     {absolute_path}");
    }

    diagnostic.add_help(Help::new(help));

    diagnostic.add_note(Note::new(
        "Variables must be defined before they can be used. This could be a typo, a variable used \
         outside its scope, or a missing declaration. If it's a function or type from another \
         module, you might need to import it first.",
    ));

    diagnostic
}

#[expect(clippy::too_many_lines)]
pub(crate) fn from_resolution_error<'heap>(
    use_span: Option<SpanId>,
    registry: &ModuleRegistry<'heap>,
    path: &Path<'heap>,
    name: Option<(SpanId, Symbol<'heap>)>,
    mut error: ResolutionError<'heap>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::UnresolvedImport,
        Severity::Error,
    );

    let segments: Vec<_> = path
        .segments
        .iter()
        .map(|segment| (segment.span, segment.name.value))
        .chain(name)
        .collect();

    match &mut error {
        &mut ResolutionError::InvalidQueryLength { expected } => {
            diagnostic.labels.push(
                // Primary label highlighting the problematic path
                Label::new(path.span, "Expected more path segments")
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
            );

            if let Some(use_span) = use_span {
                // Secondary label showing the context of the use statement
                diagnostic.labels.push(
                    Label::new(use_span, "In this import statement")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            }

            diagnostic.add_help(Help::new(format!(
                "This import path needs at least {expected} segments to be valid. Add the missing \
                 segments to complete the path."
            )));

            diagnostic.add_note(Note::new(
                "Import paths must be complete to properly identify the item you want to import. \
                 Incomplete paths cannot be resolved.",
            ));
        }

        &mut ResolutionError::ModuleRequired { depth, found } => {
            let (path_segment_span, _) = segments[depth];

            diagnostic.labels.extend([
                // Primary label showing the item that can't contain other items
                Label::new(
                    path_segment_span,
                    format!(
                        "'{}' cannot contain other items",
                        FormatPath(path.rooted, &segments, Some(depth))
                    ),
                )
                .with_order(0)
                .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label showing the full path context
                Label::new(path.span, "In this path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            let universe = match found {
                Some(Universe::Value) => "a value",
                Some(Universe::Type) => "a type",
                None => "not a module",
            };

            diagnostic.add_help(Help::new(format!(
                "'{}' is {universe}. Only modules can contain other items. Check your import path.",
                FormatPath(path.rooted, &segments, Some(depth))
            )));

            diagnostic.add_note(Note::new(
                "The '::' syntax can only be used with modules to access their members. Values \
                 and types cannot contain other items.",
            ));
        }

        ResolutionError::PackageNotFound { depth, suggestions } => {
            let depth = *depth;
            let (package_span, package_name) = segments[depth];

            diagnostic.labels.push(
                // Primary label highlighting the missing package
                Label::new(package_span, format!("Missing package '{package_name}'"))
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
            );

            if let Some(use_span) = use_span {
                diagnostic.labels.push(
                    // Secondary label showing the context
                    Label::new(use_span, "In this import statement")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            }

            let mut help = "This package couldn't be found. Make sure it is spelled correctly and \
                            installed."
                .to_owned();

            if let Some(suggestion) = format_suggestions(suggestions, |&module| {
                Cow::Owned(registry.modules.index(module).name.as_str().to_owned())
            }) {
                help.push_str(&suggestion);
            }

            diagnostic.add_help(Help::new(help));

            diagnostic.add_note(Note::new(
                "Packages must be installed and properly configured in your project dependencies \
                 before they can be imported.",
            ));
        }

        ResolutionError::ImportNotFound { depth, suggestions } => {
            let depth = *depth;
            let (import_span, import_name) = segments[depth];

            diagnostic.labels.push(
                Label::new(
                    import_span,
                    format!("'{import_name}' needs to be imported first"),
                )
                .with_order(0)
                .with_color(Color::Ansi(AnsiColor::Red)),
            );

            if let Some(use_span) = use_span {
                diagnostic.labels.push(
                    // Add a secondary label for context
                    Label::new(use_span, "In this import statement")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            }

            let mut help = format!(
                "Add an import statement for '{import_name}' before using it. Check if the name \
                 is spelled correctly."
            );

            if let Some(suggestion) =
                format_suggestions(suggestions, |import| Cow::Borrowed(import.name.as_str()))
            {
                help.push_str(&suggestion);
            }

            diagnostic.add_help(Help::new(help));

            diagnostic.add_note(Note::new(
                "Before using an item from another module, you must import it with a 'use' \
                 statement or access it with a fully qualified path.",
            ));
        }

        ResolutionError::ModuleNotFound { depth, suggestions } => {
            let depth = *depth;
            let (module_span, module_name) = segments[depth];

            diagnostic.labels.extend([
                Label::new(module_span, format!("Module '{module_name}' not found"))
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
                // Add secondary label for context
                Label::new(path.span, "In this path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            let mut help = format!(
                "The module '{}' doesn't exist in this scope. Check the spelling and ensure the \
                 module is available.",
                FormatPath(path.rooted, &segments, Some(depth))
            );

            if let Some(suggestion) =
                format_suggestions(suggestions, |item| Cow::Borrowed(item.name.as_str()))
            {
                help.push_str(&suggestion);
            }

            diagnostic.add_help(Help::new(help));

            diagnostic.add_note(Note::new(
                "Modules must be properly defined and exported from their parent module to be \
                 accessible.",
            ));
        }

        ResolutionError::ItemNotFound { depth, suggestions } => {
            let depth = *depth;
            let (item_span, item_name) = segments[depth];

            let label_text = if depth == 0 {
                format!("'{item_name}' not found in current scope")
            } else {
                format!(
                    "'{item_name}' not found in module '{}'",
                    FormatPath(path.rooted, &segments, Some(depth - 1))
                )
            };

            diagnostic.labels.push(
                Label::new(item_span, label_text)
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
            );

            // Add a secondary label highlighting the module
            if depth > 0 {
                let module_span = segments[depth - 1].0;
                diagnostic.labels.push(
                    Label::new(module_span, "This module")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            } else if let Some(use_span) = use_span {
                diagnostic.labels.push(
                    Label::new(use_span, "In this import")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            }

            let mut help = "Check the spelling and ensure the item is exported and available in \
                            this context."
                .to_owned();

            if let Some(suggestion) =
                format_suggestions(suggestions, |item| Cow::Borrowed(item.name.as_str()))
            {
                help.push_str(&suggestion);
            }

            diagnostic.add_help(Help::new(help));

            diagnostic.add_note(Note::new(
                "Items must be defined and accessible from the importing location. Make sure the \
                 item exists and is public.",
            ));
        }

        ResolutionError::Ambiguous(item) => {
            // Find the span for the ambiguous name in the path
            let item_span = segments
                .iter()
                .find_map(|&(segment_span, segment_name)| {
                    (segment_name == item.name).then_some(segment_span)
                })
                .unwrap_or(path.span);

            diagnostic.labels.extend([
                // Primary label, pointing to the problem
                Label::new(item_span, format!("'{}' is ambiguous", item.name))
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label, pointing to the path
                Label::new(path.span, "In this path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            diagnostic.add_help(Help::new(format!(
                "The name '{}' could refer to multiple different items in {}. Use a fully \
                 qualified path to specify which one you want.",
                item.name,
                FormatPath(path.rooted, &segments, None)
            )));

            diagnostic.add_note(Note::new(
                "When multiple items with the same name are in scope, you must use a fully \
                 qualified path to avoid ambiguity. Consider using explicit imports instead of \
                 glob imports to prevent name conflicts.",
            ));
        }

        &mut ResolutionError::ModuleEmpty { depth } => {
            let (module_span, _) = segments[depth];

            diagnostic.labels.extend([
                // Primary label, pointing to the module
                Label::new(
                    module_span,
                    format!(
                        "Module '{}' has no exported members",
                        FormatPath(path.rooted, &segments, Some(depth))
                    ),
                )
                .with_order(0)
                .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label, pointing to the path
                Label::new(path.span, "In this import path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            diagnostic.add_help(Help::new(
                "This module exists but doesn't expose any items that can be imported. Check if \
                 you're importing the correct module or if the module has any public exports.",
            ));

            diagnostic.add_note(Note::new(
                "To use items from a module, they must be marked as public/exported. If you're \
                 using a glob import pattern like 'module::*', try using specific imports instead \
                 to see what's available.",
            ));
        }
    }

    diagnostic
}
