use alloc::borrow::Cow;
use core::{fmt, fmt::Display};

use hashql_core::{
    module::{
        ModuleRegistry,
        error::{ResolutionError, ResolutionSuggestion},
        item::Universe,
    },
    span::SpanId,
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ImportResolverDiagnosticCategory {
    GenericArgumentsInUsePath,
    EmptyPath,
    GenericArgumentsInModule,
    UnresolvedImport,
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
        Severity::ERROR,
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

    diagnostic.help = Some(Help::new(
        "Use statements don't accept generic type parameters. Remove the angle brackets and type \
         parameters.\n\nExample: Use `module::Type` instead of `module::Type<T>`.",
    ));

    diagnostic.note = Some(Note::new(
        "Import paths only identify modules and items to bring into scope, not specific generic \
         instantiations. Generic type parameters are applied when using the type, not when \
         importing it.",
    ));

    diagnostic
}

/// Error when a path has no segments
pub(crate) fn empty_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ImportResolverDiagnosticCategory::EmptyPath, Severity::ERROR);

    diagnostic.labels.push(
        Label::new(span, "Specify a path here")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.help = Some(Help::new(
        "Add a valid path with at least one identifier, such as `module` or `module::item`.",
    ));

    diagnostic.note = Some(Note::new(
        "Import statements require a non-empty path to identify what module or item you want to \
         bring into scope.",
    ));

    diagnostic
}

/// Error when generic arguments are used in a module path segment
pub(crate) fn generic_arguments_in_module(
    span: SpanId,
    path_span: SpanId,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInModule,
        Severity::ERROR,
    );

    // Primary label highlighting the invalid generic arguments
    diagnostic.labels.push(
        Label::new(span, "Remove these generic arguments")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    // Secondary label showing the context of the entire path
    diagnostic.labels.push(
        Label::new(
            path_span,
            "Generic arguments are only allowed in the final segment",
        )
        .with_order(1)
        .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.help = Some(Help::new(
        "Generic arguments can only appear on the final type in a path. Remove them from this \
         module segment or move them to the final type in the path.\n\nCorrect: \
         `module::submodule::Type<T>`\nIncorrect: `module<T>::submodule::Type`",
    ));

    diagnostic.note = Some(Note::new(
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

        return Some(format!("\n\nPossible alternatives: `{suggestion}`"));
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

struct FormatPath<'a, 'heap>(&'a Path<'heap>, Option<usize>);

impl Display for FormatPath<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let &Self(path, depth) = self;

        if path.rooted {
            fmt.write_str("::")?;
        }

        let segments = depth.map_or_else(|| &*path.segments, |depth| &path.segments[..depth]);

        for (index, segment) in segments.iter().enumerate() {
            if index > 0 {
                fmt.write_str("::")?;
            }

            fmt.write_str(segment.name.value.as_str())?;
        }

        Ok(())
    }
}

/// Convert a resolution error to a diagnostic
#[expect(clippy::too_many_lines)]
pub(crate) fn from_resolution_error<'heap>(
    use_span: Option<SpanId>,
    registry: &ModuleRegistry<'heap>,
    path: &Path<'heap>,
    mut error: ResolutionError<'heap>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::UnresolvedImport,
        Severity::ERROR,
    );

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

            diagnostic.help = Some(Help::new(format!(
                "This import path needs at least {expected} segments to be valid. Add the missing \
                 segments to complete the path."
            )));

            diagnostic.note = Some(Note::new(
                "Import paths must be complete to properly identify the item you want to import. \
                 Incomplete paths cannot be resolved.",
            ));
        }

        &mut ResolutionError::ModuleRequired { depth, found } => {
            let path_segment_span = path.segments[depth].span;

            diagnostic.labels.extend([
                // Primary label showing the item that can't contain other items
                Label::new(
                    path_segment_span,
                    format!(
                        "'{}' cannot contain other items",
                        FormatPath(path, Some(depth))
                    ),
                )
                .with_order(0)
                .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label showing the full path context
                Label::new(path.span, "Invalid path structure")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            let universe = match found {
                Some(Universe::Value) => "a value",
                Some(Universe::Type) => "a type",
                None => "not a module",
            };

            diagnostic.help = Some(Help::new(format!(
                "'{}' is {universe}, not a module. Only modules can contain other items. Check \
                 your import path.",
                FormatPath(path, Some(depth))
            )));

            diagnostic.note = Some(Note::new(
                "The '::' syntax can only be used with modules to access their members. Values \
                 and types cannot contain other items.",
            ));
        }

        ResolutionError::PackageNotFound { depth, suggestions } => {
            let depth = *depth;
            let package_name = path.segments[depth].name.value.clone();
            let package_span = path.segments[depth].span;

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

            diagnostic.help = Some(Help::new(help));

            diagnostic.note = Some(Note::new(
                "Packages must be installed and properly configured in your project dependencies \
                 before they can be imported.",
            ));
        }

        ResolutionError::ImportNotFound { depth, suggestions } => {
            let depth = *depth;
            let import = path.segments[depth].name.value.clone();
            let import_span = path.segments[depth].span;

            diagnostic.labels.push(
                Label::new(
                    import_span,
                    format!("'{import}' needs to be imported first"),
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
                "Add an import statement for '{import}' before using it. Check if the name is \
                 spelled correctly."
            );

            if let Some(suggestion) =
                format_suggestions(suggestions, |import| Cow::Borrowed(import.name.as_str()))
            {
                help.push_str(&suggestion);
            }

            diagnostic.help = Some(Help::new(help));

            diagnostic.note = Some(Note::new(
                "Before using an item from another module, you must import it with a 'use' \
                 statement or access it with a fully qualified path.",
            ));
        }

        ResolutionError::ModuleNotFound { depth, suggestions } => {
            let depth = *depth;
            let module = path.segments[depth].name.value.clone();
            let module_span = path.segments[depth].span;

            diagnostic.labels.extend([
                Label::new(module_span, format!("Module '{module}' not found"))
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
                FormatPath(path, Some(depth))
            );

            if let Some(suggestion) =
                format_suggestions(suggestions, |item| Cow::Borrowed(item.name.as_str()))
            {
                help.push_str(&suggestion);
            }

            diagnostic.help = Some(Help::new(help));

            diagnostic.note = Some(Note::new(
                "Modules must be properly defined and exported from their parent module to be \
                 accessible.",
            ));
        }

        ResolutionError::ItemNotFound { depth, suggestions } => {
            let depth = *depth;
            let item = path.segments[depth].name.value.clone();
            let item_span = path.segments[depth].span;

            let label_text = if depth == 0 {
                format!("'{item}' not found in current scope")
            } else {
                format!(
                    "'{item}' not found in module '{}'",
                    FormatPath(path, Some(depth - 1))
                )
            };

            diagnostic.labels.push(
                Label::new(item_span, label_text)
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
            );

            // Add a secondary label highlighting the module
            if depth > 0 {
                let module_span = path.segments[depth - 1].span;
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

            diagnostic.help = Some(Help::new(help));

            diagnostic.note = Some(Note::new(
                "Items must be defined and accessible from the importing location. Make sure the \
                 item exists and is public.",
            ));
        }

        ResolutionError::Ambiguous(item) => {
            let name = item.name.as_str();

            // Find the span for the ambiguous name in the path
            let item_span = path
                .segments
                .iter()
                .find_map(|segment| (segment.name.value.as_str() == name).then_some(segment.span))
                .unwrap_or(path.span);

            diagnostic.labels.extend([
                // Primary label, pointing to the problem
                Label::new(item_span, format!("'{name}' is ambiguous"))
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label, pointing to the path
                Label::new(path.span, "In this path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            diagnostic.help = Some(Help::new(format!(
                "The name '{name}' could refer to multiple different items in {}. Use a fully \
                 qualified path to specify which one you want.",
                FormatPath(path, Some(path.segments.len() - 1))
            )));

            diagnostic.note = Some(Note::new(
                "When multiple items with the same name are in scope, you must use a fully \
                 qualified path to avoid ambiguity. Consider using explicit imports instead of \
                 glob imports to prevent name conflicts.",
            ));
        }

        &mut ResolutionError::ModuleEmpty { depth } => {
            let module_span = path.segments[depth].span;

            diagnostic.labels.extend([
                // Primary label, pointing to the module
                Label::new(
                    module_span,
                    format!(
                        "Module '{}' has no exported members",
                        FormatPath(path, Some(depth))
                    ),
                )
                .with_order(0)
                .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label, pointing to the path
                Label::new(path.span, "In this import path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            diagnostic.help = Some(Help::new(
                "This module exists but doesn't expose any items that can be imported. Check if \
                 you're importing the correct module or if the module has any public exports.",
            ));

            diagnostic.note = Some(Note::new(
                "To use items from a module, they must be marked as public/exported. If you're \
                 using a glob import pattern like 'module::*', try using specific imports instead \
                 to see what's available.",
            ));
        }
    }

    diagnostic
}
