use core::fmt::Display;
use std::{borrow::Cow, fmt};

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
pub(crate) fn generic_arguments_in_use_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInUsePath,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove these generic arguments"));

    diagnostic.help = Some(Help::new(
        "Use statements don't accept generic type parameters. Remove the angle brackets and type \
         parameters.",
    ));

    diagnostic.note = Some(Note::new(
        "Import paths only identify modules and items to bring into scope, not specific generic \
         instantiations.",
    ));

    diagnostic
}

/// Error when a path has no segments
pub(crate) fn empty_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ImportResolverDiagnosticCategory::EmptyPath, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Specify a path here"));

    diagnostic.help = Some(Help::new(
        "Add a valid path with at least one identifier, such as `module` or `module::item`.",
    ));

    diagnostic
}

/// Error when generic arguments are used in a module path segment
pub(crate) fn generic_arguments_in_module(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInModule,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove these generic arguments"));

    diagnostic.help = Some(Help::new(
        "Generic arguments can only appear on the final type in a path. Remove them from this \
         module segment.",
    ));

    diagnostic.note = Some(Note::new(
        "To use generic parameters, apply them only to the final type: \
         `module::submodule::Type<T>`.",
    ));

    diagnostic
}

/// Format suggestions for display in diagnostics
fn format_suggestions<T>(
    suggestions: &mut [ResolutionSuggestion<T>],
    mut render: impl for<'a> FnMut(&'a T) -> Cow<'a, str>,
) -> Option<String> {
    suggestions.sort_by(
        |ResolutionSuggestion { score: lhs, .. }, ResolutionSuggestion { score: rhs, .. }| {
            lhs.total_cmp(&rhs)
        },
    );

    let partition = suggestions.partition_point(|&ResolutionSuggestion { score, .. }| score > 0.7);

    let top_suggestions = &suggestions[partition..];
    // Take the last 3 items of top_suggestions
    let top_suggestions = match top_suggestions {
        [.., a, b, c] => [Some(c), Some(b), Some(a)],
        [.., a, b] => [None, Some(b), Some(a)],
        [.., a] => [None, None, Some(a)],
        _ => return None,
    };

    let suggestion = top_suggestions
        .into_iter()
        .flatten()
        .map(|ResolutionSuggestion { item, .. }| render(item))
        .intersperse(Cow::Borrowed("', '"))
        .collect::<String>();

    Some(format!("\n\nDid you mean: '{suggestion}'?"))
}

struct FormatPath<'a, 'heap>(&'a Path<'heap>, Option<usize>);

impl Display for FormatPath<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let &Self(path, depth) = self;

        if path.rooted {
            fmt.write_str("::")?;
        };

        let segments = if let Some(depth) = depth {
            &path.segments[..depth]
        } else {
            &path.segments[..]
        };

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
pub(crate) fn from_resolution_error<'heap>(
    span: SpanId,
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
            diagnostic
                .labels
                .push(Label::new(span, "Expected more path segments"));

            diagnostic.help = Some(Help::new(format!(
                "This import path needs at least {expected} segments to be valid."
            )));
        }

        &mut ResolutionError::ModuleRequired { depth, found } => {
            diagnostic.labels.push(Label::new(
                span,
                format!(
                    "'{}' cannot contain other items",
                    FormatPath(path, Some(depth))
                ),
            ));

            let universe = match found {
                Some(Universe::Value) => "a value",
                Some(Universe::Type) => "a type",
                None => "not a module",
            };

            diagnostic.help = Some(Help::new(format!(
                "'{}' is {universe}, not a module. Only modules can contain other items.",
                FormatPath(path, Some(depth))
            )));

            diagnostic.note = Some(Note::new(
                "The '::' syntax can only be used with modules to access their members.",
            ));
        }

        ResolutionError::PackageNotFound { depth, suggestions } => {
            let depth = *depth;
            let package_name = path.segments[depth].name.value.clone();

            diagnostic.labels.push(Label::new(
                span,
                format!("Missing package '{package_name}'"),
            ));

            let mut help = format!(
                "This package couldn't be found, make sure it is spelled correctly and installed."
            );

            if let Some(suggestion) = format_suggestions(suggestions, |&module| {
                Cow::Owned(registry.modules.index(module).name.as_str().to_owned())
            }) {
                help.push_str(&suggestion);
            }

            diagnostic.help = Some(Help::new(help));
        }

        ResolutionError::ImportNotFound { depth, suggestions } => {
            let depth = *depth;
            let import = path.segments[depth].name.value.clone();

            diagnostic.labels.push(Label::new(
                span,
                format!("'{import}' needs to be imported first"),
            ));

            let mut help = format!("Add an import statement for '{import}' before using it.");

            if let Some(suggestion) =
                format_suggestions(suggestions, |import| Cow::Borrowed(import.name.as_str()))
            {
                help.push_str(&suggestion);
            }

            diagnostic.help = Some(Help::new(help));
        }

        ResolutionError::ModuleNotFound { depth, suggestions } => {
            let depth = *depth;
            let module = path.segments[depth].name.value.clone();

            diagnostic
                .labels
                .push(Label::new(span, format!("Module '{module}' not found")));

            let mut help = format!(
                "The module '{}' doesn't exist in this scope.",
                FormatPath(path, Some(depth))
            );

            if let Some(suggestion) =
                format_suggestions(suggestions, |item| Cow::Borrowed(item.name.as_str()))
            {
                help.push_str(&suggestion);
            }

            diagnostic.help = Some(Help::new(help));
        }

        ResolutionError::ItemNotFound { depth, suggestions } => {
            let depth = *depth;
            let item = path.segments[depth].name.value.clone();

            let label_text = if depth == 0 {
                format!("'{item}' not found in current scope")
            } else {
                format!(
                    "'{item}' not found in module '{}'",
                    FormatPath(path, Some(depth - 1))
                )
            };

            diagnostic.labels.push(Label::new(span, label_text));

            let mut help = "Check the spelling and ensure the item is exported.".to_owned();

            if let Some(suggestion) =
                format_suggestions(suggestions, |item| Cow::Borrowed(item.name.as_str()))
            {
                help.push_str(&suggestion);
            }

            diagnostic.help = Some(Help::new(help));
        }

        ResolutionError::Ambiguous(item) => {
            let name = item.name.as_str();

            diagnostic
                .labels
                .push(Label::new(span, format!("'{name}' is ambiguous")));

            diagnostic.help = Some(Help::new(format!(
                "The name '{name}' could refer to multiple different items in {}. [add some more \
                 context here]",
                FormatPath(path, Some(path.segments.len() - 1))
            )));

            diagnostic.note = Some(Note::new("[TODO]"));
        }

        &mut ResolutionError::ModuleEmpty { depth } => {
            diagnostic.labels.push(Label::new(
                span,
                format!(
                    "Module '{}' has no exported members",
                    FormatPath(path, Some(depth))
                ),
            ));

            diagnostic.help = Some(Help::new(
                "This module exists but doesn't expose any items that can be imported.",
            ));

            diagnostic.note = Some(Note::new(
                "Try using specific imports instead of a glob pattern, or check that the module \
                 exports what you need.",
            ));
        }
    }

    diagnostic
}
