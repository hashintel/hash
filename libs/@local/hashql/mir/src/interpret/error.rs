//! Interpreter error types and diagnostic conversion.
//!
//! This module defines the error types that can occur during MIR interpretation
//! and provides conversion to diagnostics for user-friendly error reporting.

use alloc::borrow::Cow;
use core::{
    alloc::Allocator,
    fmt::{self, Display},
};

use hashql_core::{span::SpanId, symbol::Symbol};
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};
use hashql_hir::node::operation::UnOp;

use super::value::{Ptr, Value, ValueTypeName};
use crate::body::{
    constant::Int,
    local::{Local, LocalDecl},
    place::FieldIndex,
    rvalue::BinOp,
};

/// Type alias for interpreter diagnostics.
///
/// The default severity kind is [`Severity`], which allows any severity level.
pub(crate) type InterpretDiagnostic<K = Severity> =
    Diagnostic<InterpretDiagnosticCategory, SpanId, K>;

// Terminal categories for ICEs
const LOCAL_ACCESS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "local-access",
    name: "Local Access",
};

const TYPE_INVARIANT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-invariant",
    name: "Type Invariant",
};

const STRUCTURAL_INVARIANT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "structural-invariant",
    name: "Structural Invariant",
};

const CONTROL_FLOW: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "control-flow",
    name: "Control Flow",
};

// Terminal categories for user-facing errors (some are temporarily Error, will become ICE)
const BOUNDS_CHECK: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "bounds-check",
    name: "Bounds Check",
};

const RUNTIME_LIMIT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "runtime-limit",
    name: "Runtime Limit",
};

const INPUT_RESOLUTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "input-resolution",
    name: "Input Resolution",
};

/// Diagnostic category for interpreter errors.
///
/// Each category corresponds to a specific class of error that can occur
/// during interpretation. Categories are used to organize and filter
/// diagnostics in error reporting.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum InterpretDiagnosticCategory {
    /// Error accessing a local variable (e.g., uninitialized local).
    LocalAccess,
    /// Type system invariant violation (should have been caught by typeck).
    TypeInvariant,
    /// MIR structural invariant violation (malformed MIR).
    StructuralInvariant,
    /// Invalid control flow (e.g., unreachable code reached).
    ControlFlow,
    /// Index out of bounds error.
    BoundsCheck,
    /// Resource limit exceeded (e.g., recursion limit).
    RuntimeLimit,
    /// Required input not provided.
    InputResolution,
}

impl DiagnosticCategory for InterpretDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("interpret")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Interpret")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::LocalAccess => Some(&LOCAL_ACCESS),
            Self::TypeInvariant => Some(&TYPE_INVARIANT),
            Self::StructuralInvariant => Some(&STRUCTURAL_INVARIANT),
            Self::ControlFlow => Some(&CONTROL_FLOW),
            Self::BoundsCheck => Some(&BOUNDS_CHECK),
            Self::RuntimeLimit => Some(&RUNTIME_LIMIT),
            Self::InputResolution => Some(&INPUT_RESOLUTION),
        }
    }
}

/// A type name for use in error messages.
///
/// This is a simplified type representation used in diagnostics. It captures
/// enough information to display a meaningful type name without requiring
/// the full type system infrastructure.
#[derive(Debug, Clone)]
pub enum TypeName {
    /// A static type name (e.g., "Integer", "String").
    Static(Cow<'static, str>),
    /// A function pointer type, displaying its definition ID.
    Pointer(Ptr),
}

impl TypeName {
    /// Creates a type name from a static string.
    ///
    /// Used for simple type names like "Integer", "String", etc.
    pub const fn terse(str: &'static str) -> Self {
        Self::Static(Cow::Borrowed(str))
    }
}

impl Display for TypeName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Static(name) => Display::fmt(name, fmt),
            Self::Pointer(ptr) => Display::fmt(ptr, fmt),
        }
    }
}

impl<A: Allocator> From<ValueTypeName<'_, '_, A>> for TypeName {
    fn from(value: ValueTypeName<'_, '_, A>) -> Self {
        value.into_type_name()
    }
}

/// Details of a binary operator type mismatch.
///
/// Contains the operator, expected types, and actual values for diagnostic
/// reporting when a binary operation receives operands of incorrect types.
#[derive(Debug, Clone)]
pub struct BinaryTypeMismatch<'heap> {
    /// The binary operator that was applied.
    pub op: BinOp,
    /// The expected type of the left-hand operand.
    pub lhs_expected: TypeName,
    /// The expected type of the right-hand operand.
    pub rhs_expected: TypeName,
    /// The actual left-hand value.
    pub lhs: Value<'heap>,
    /// The actual right-hand value.
    pub rhs: Value<'heap>,
}

/// Details of a unary operator type mismatch.
///
/// Contains the operator, expected type, and actual value for diagnostic
/// reporting when a unary operation receives an operand of incorrect type.
#[derive(Debug, Clone)]
pub struct UnaryTypeMismatch<'heap> {
    /// The unary operator that was applied.
    pub op: UnOp,
    /// The expected type of the operand.
    pub expected: TypeName,
    /// The actual value.
    pub value: Value<'heap>,
}

/// Errors that can occur during MIR interpretation.
///
/// Most variants represent Internal Compiler Errors (ICEs) that indicate bugs
/// in the compiler. These should never occur in correctly compiled code because
/// earlier phases (type checking, MIR construction) should prevent them.
///
/// A few variants represent legitimate runtime errors that can occur in valid
/// programs (marked in their documentation).
#[derive(Debug, Clone)]
pub enum RuntimeError<'heap> {
    /// Attempted to read an uninitialized local variable.
    ///
    /// This is an ICE: MIR construction should ensure locals are initialized
    /// before use, or HIR should have caught the use of undefined variables.
    UninitializedLocal {
        local: Local,
        decl: LocalDecl<'heap>,
    },

    /// Index operation used an invalid type for the index.
    ///
    /// This is an ICE: type checking should ensure index types are valid.
    InvalidIndexType { base: TypeName, index: TypeName },

    /// Subscript operation applied to a non-subscriptable type.
    ///
    /// This is an ICE: type checking should ensure subscript targets are
    /// lists or dicts.
    InvalidSubscriptType { base: TypeName },

    /// Field projection applied to a non-projectable type.
    ///
    /// This is an ICE: type checking should ensure projection targets are
    /// structs or tuples.
    InvalidProjectionType { base: TypeName },

    /// Named field projection applied to a non-struct type.
    ///
    /// This is an ICE: type checking should ensure named field access is
    /// only used on structs.
    InvalidProjectionByNameType { base: TypeName },

    /// Field index does not exist on the aggregate type.
    ///
    /// This is an ICE: type checking should validate field indices.
    UnknownField { base: TypeName, field: FieldIndex },

    /// Field name does not exist on the struct type.
    ///
    /// This is an ICE: type checking should validate field names.
    UnknownFieldByName {
        base: TypeName,
        field: Symbol<'heap>,
    },

    /// Struct aggregate has mismatched value and field counts.
    ///
    /// This is an ICE: MIR construction should ensure aggregates have the
    /// correct number of values for their fields.
    StructFieldLengthMismatch { values: usize, fields: usize },

    /// Switch discriminant has a non-integer type.
    ///
    /// This is an ICE: type checking should ensure switch discriminants
    /// are integers.
    InvalidDiscriminantType { r#type: TypeName },

    /// Switch discriminant value has no matching branch.
    ///
    /// This is an ICE: MIR construction should ensure all possible
    /// discriminant values have corresponding branches.
    InvalidDiscriminant { value: Int },

    /// Execution reached unreachable code.
    ///
    /// This is an ICE: control flow analysis should prevent reaching
    /// unreachable terminators.
    UnreachableReached,

    /// Binary operator received operands of incorrect types.
    ///
    /// This is an ICE: type checking should ensure operand types match
    /// the operator's requirements.
    BinaryTypeMismatch(Box<BinaryTypeMismatch<'heap>>),

    /// Unary operator received an operand of incorrect type.
    ///
    /// This is an ICE: type checking should ensure operand type matches
    /// the operator's requirements.
    UnaryTypeMismatch(Box<UnaryTypeMismatch<'heap>>),

    /// Function call applied to a non-pointer value.
    ///
    /// This is an ICE: type checking should ensure only function pointers
    /// are called.
    ApplyNonPointer { r#type: TypeName },

    /// Attempted to step execution with an empty callstack.
    ///
    /// This is an ICE: interpreter logic should prevent this state.
    CallstackEmpty,

    /// Index is out of bounds for the collection.
    ///
    /// This is currently a user-facing error but may become an ICE once
    /// bounds checking is implemented in program analysis.
    OutOfRange { length: usize, index: Int },

    /// Required input was not provided to the runtime.
    ///
    /// This is currently a user-facing error but may become an ICE once
    /// input validation is implemented in program analysis.
    InputNotFound { name: Symbol<'heap> },

    /// Recursion depth exceeded the configured limit.
    ///
    /// This is a user-facing error that occurs when a program recurses
    /// too deeply, likely due to infinite recursion or deeply nested
    /// data structures.
    RecursionLimitExceeded { limit: usize },
}

impl RuntimeError<'_> {
    /// Converts this runtime error into a diagnostic using the provided callstack.
    ///
    /// The callstack provides span information for error localization. The first
    /// frame's span is used as the primary label, and subsequent frames are added
    /// as secondary labels to show the call trace.
    pub fn into_diagnostic(
        self,
        callstack: impl IntoIterator<Item = SpanId>,
    ) -> InterpretDiagnostic {
        let mut spans = callstack.into_iter();
        let primary_span = spans.next().unwrap_or(SpanId::SYNTHETIC);

        let mut diagnostic = self.make_diagnostic(primary_span);

        // Add callstack frames as secondary labels
        for span in spans {
            diagnostic.add_label(Label::new(span, "called from here"));
        }

        diagnostic
    }

    fn make_diagnostic(self, span: SpanId) -> InterpretDiagnostic {
        match self {
            Self::UninitializedLocal { local, decl } => uninitialized_local(span, local, decl),
            Self::InvalidIndexType { base, index } => invalid_index_type(span, &base, &index),
            Self::InvalidSubscriptType { base } => invalid_subscript_type(span, &base),
            Self::InvalidProjectionType { base } => invalid_projection_type(span, &base),
            Self::InvalidProjectionByNameType { base } => {
                invalid_projection_by_name_type(span, &base)
            }
            Self::UnknownField { base, field } => unknown_field(span, &base, field),
            Self::UnknownFieldByName { base, field } => unknown_field_by_name(span, &base, field),
            Self::StructFieldLengthMismatch { values, fields } => {
                struct_field_length_mismatch(span, values, fields)
            }
            Self::InvalidDiscriminantType { r#type } => invalid_discriminant_type(span, &r#type),
            Self::InvalidDiscriminant { value } => invalid_discriminant(span, value),
            Self::UnreachableReached => unreachable_reached(span),
            Self::BinaryTypeMismatch(mismatch) => binary_type_mismatch(span, *mismatch),
            Self::UnaryTypeMismatch(mismatch) => unary_type_mismatch(span, *mismatch),
            Self::ApplyNonPointer { r#type } => apply_non_pointer(span, &r#type),
            Self::CallstackEmpty => callstack_empty(span),
            Self::OutOfRange { length, index } => out_of_range(span, length, index),
            Self::InputNotFound { name } => input_not_found(span, name),
            Self::RecursionLimitExceeded { limit } => recursion_limit_exceeded(span, limit),
        }
    }
}

#[coverage(off)]
fn uninitialized_local(span: SpanId, local: Local, decl: LocalDecl) -> InterpretDiagnostic {
    let name = core::fmt::from_fn(|fmt| {
        if let Some(symbol) = decl.name {
            Display::fmt(&symbol, fmt)
        } else {
            Display::fmt(&local, fmt)
        }
    });

    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::LocalAccess, Severity::Bug).primary(
            Label::new(span, format!("local `{name}` used before initialization")),
        );

    diagnostic.add_label(Label::new(decl.span, "local declared here"));

    diagnostic.add_message(Message::help(
        "MIR construction should ensure all locals are initialized before use",
    ));

    diagnostic
}

// =============================================================================
// ICE: Type Invariant
// =============================================================================

#[coverage(off)]
fn invalid_index_type(span: SpanId, base: &TypeName, index: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("cannot index `{base}` with `{index}`")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured valid index types",
    ));

    diagnostic
}

#[coverage(off)]
fn invalid_subscript_type(span: SpanId, base: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(span, format!("cannot subscript `{base}`")));

    diagnostic.add_message(Message::help(
        "type checking should have ensured only subscriptable types are subscripted",
    ));

    diagnostic
}

#[coverage(off)]
fn invalid_projection_type(span: SpanId, base: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("cannot project field from `{base}`")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured only projectable types are projected",
    ));

    diagnostic
}

#[coverage(off)]
fn invalid_projection_by_name_type(span: SpanId, base: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("cannot project named field from `{base}`")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured only struct types are projected by name",
    ));

    diagnostic
}

#[coverage(off)]
fn unknown_field(span: SpanId, base: &TypeName, field: FieldIndex) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(
            span,
            format!("field index {field} does not exist on `{base}`"),
        ));

    diagnostic.add_message(Message::help(
        "type checking should have ensured field indices are valid",
    ));

    diagnostic
}

#[coverage(off)]
fn unknown_field_by_name(span: SpanId, base: &TypeName, field: Symbol) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("field `{field}` does not exist on `{base}`")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured field names are valid",
    ));

    diagnostic
}

#[coverage(off)]
fn invalid_discriminant_type(span: SpanId, r#type: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(
            span,
            format!("switch discriminant has type `{type}`, expected `Integer`"),
        ));

    diagnostic.add_message(Message::help(
        "type checking should have ensured discriminants are integers",
    ));

    diagnostic
}

#[coverage(off)]
fn binary_type_mismatch(span: SpanId, mismatch: BinaryTypeMismatch) -> InterpretDiagnostic {
    let BinaryTypeMismatch {
        op,
        lhs_expected,
        rhs_expected,
        lhs,
        rhs,
    } = mismatch;

    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(
            span,
            format!(
                "cannot apply `{}` to `{}` and `{}`",
                op.as_str(),
                lhs.type_name(),
                rhs.type_name()
            ),
        ));

    diagnostic.add_message(Message::note(format!(
        "expected `{lhs_expected}` and `{rhs_expected}`"
    )));

    diagnostic.add_message(Message::help(
        "type checking should have ensured operand types match the operator",
    ));

    diagnostic
}

#[coverage(off)]
fn unary_type_mismatch(span: SpanId, mismatch: UnaryTypeMismatch) -> InterpretDiagnostic {
    let UnaryTypeMismatch {
        op,
        expected,
        value,
    } = mismatch;

    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(
            span,
            format!("cannot apply `{}` to `{}`", op.as_str(), value.type_name()),
        ));

    diagnostic.add_message(Message::note(format!("expected `{expected}`")));

    diagnostic.add_message(Message::help(
        "type checking should have ensured operand type matches the operator",
    ));

    diagnostic
}

#[coverage(off)]
fn apply_non_pointer(span: SpanId, r#type: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("cannot call `{type}` as a function")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured only function pointers are called",
    ));

    diagnostic
}

// =============================================================================
// ICE: Structural Invariant
// =============================================================================

#[coverage(off)]
fn struct_field_length_mismatch(span: SpanId, values: usize, fields: usize) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(
        InterpretDiagnosticCategory::StructuralInvariant,
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        format!("struct aggregate has {values} values but {fields} fields"),
    ));

    diagnostic.add_message(Message::help(
        "MIR construction should ensure aggregate value counts match field counts",
    ));

    diagnostic
}

// =============================================================================
// ICE: Control Flow
// =============================================================================

#[coverage(off)]
fn invalid_discriminant(span: SpanId, value: Int) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::ControlFlow, Severity::Bug)
        .primary(Label::new(
            span,
            format!("switch discriminant `{value}` has no matching branch"),
        ));

    diagnostic.add_message(Message::help(
        "MIR construction should ensure all discriminant values have corresponding branches",
    ));

    diagnostic
}

#[coverage(off)]
fn unreachable_reached(span: SpanId) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::ControlFlow, Severity::Bug)
        .primary(Label::new(span, "reached unreachable code"));

    diagnostic.add_message(Message::help(
        "control flow analysis should have ensured this code is never reached",
    ));

    diagnostic
}

#[coverage(off)]
fn callstack_empty(span: SpanId) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::ControlFlow, Severity::Bug)
        .primary(Label::new(span, "attempted to step with empty callstack"));

    diagnostic.add_message(Message::help(
        "interpreter logic error: callstack should never be empty during execution",
    ));

    diagnostic
}

// =============================================================================
// Error: Bounds Check (ICE in the future)
// =============================================================================

#[coverage(off)]
fn out_of_range(span: SpanId, length: usize, index: Int) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::BoundsCheck, Severity::Error)
        .primary(Label::new(
            span,
            format!("index `{index}` is out of bounds for length {length}"),
        ));

    diagnostic.add_message(Message::note(format!("valid indices are 0..{length}")));

    diagnostic
}

// =============================================================================
// Error: Input Resolution (ICE in the future)
// =============================================================================

#[coverage(off)]
fn input_not_found(span: SpanId, name: Symbol) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(
        InterpretDiagnosticCategory::InputResolution,
        Severity::Error,
    )
    .primary(Label::new(span, format!("input `{name}` not found")));

    diagnostic.add_message(Message::help("ensure the input is provided to the runtime"));

    diagnostic
}

// =============================================================================
// Error: Runtime Limit
// =============================================================================

#[coverage(off)]
fn recursion_limit_exceeded(span: SpanId, limit: usize) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::RuntimeLimit, Severity::Error).primary(
            Label::new(span, format!("recursion limit of {limit} exceeded")),
        );

    diagnostic.add_message(Message::help(
        "consider refactoring to reduce recursion depth or increasing the limit",
    ));

    diagnostic
}
