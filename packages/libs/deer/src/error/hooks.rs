use alloc::{
    boxed::Box,
    collections::{BTreeMap, BTreeSet, VecDeque},
    format,
    string::String,
    vec,
    vec::Vec,
};
use core::{
    any::TypeId,
    cell::Cell,
    fmt,
    fmt::{Display, Formatter},
};

use error_stack::{Context, Frame, Report};
use serde::{
    ser::{Error as _, SerializeMap},
    Serialize, Serializer,
};

use crate::error::{
    ArrayLengthError, Error, ErrorProperties, Id, MissingError, Namespace, ObjectItemsExtraError,
    TypeError, UnknownFieldError, UnknownVariantError, ValueError,
};

struct ErrorMessage<'a, 'b, E: Error> {
    context: &'a E,
    properties: &'b <E::Properties as ErrorProperties>::Value<'a>,
}

impl<'a, 'b, E: Error> Display for ErrorMessage<'a, 'b, E> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        self.context.message(f, self.properties)
    }
}

struct SerializeErrorProperties<'a, E: Error>(
    Cell<Option<<E::Properties as ErrorProperties>::Value<'a>>>,
);

impl<'a, E: Error> SerializeErrorProperties<'a, E> {
    const fn new(value: <E::Properties as ErrorProperties>::Value<'a>) -> Self {
        Self(Cell::new(Some(value)))
    }
}

impl<'a, E: Error> Serialize for SerializeErrorProperties<'a, E> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(None)?;

        let value = self
            .0
            .replace(None)
            .expect("serialize cannot be called multiple times");

        E::Properties::output(value, &mut map).map_err(|err| S::Error::custom(format!("{err}")))?;

        map.end()
    }
}

#[derive(serde::Serialize)]
struct SerializeError<'a> {
    namespace: &'static Namespace,
    id: &'static Id,

    properties: Box<dyn erased_serde::Serialize + 'a>,
    message: String,
}

fn register_inner<'a, E: Error>(
    stack: &[&'a Frame],
) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
    let context = *stack.last()?;
    let context: &E = context.downcast_ref::<E>()?;

    let properties = E::Properties::value(stack);

    let fmt = ErrorMessage {
        context,
        properties: &properties,
    };

    let message = format!("{fmt}");

    Some(Box::new(SerializeError {
        namespace: &E::NAMESPACE,
        id: &E::ID,
        properties: Box::new(SerializeErrorProperties::<E>::new(properties)),
        message,
    }))
}

/// Split the Report into "strains", which are just linear frames, which are used to determine
/// the different errors.
///
/// Example:
///
/// ```text
///     A
///    / \
///   B   C
///  / \  |
/// D   E F
/// ```
///
/// will output:
///
/// ```text
/// [A, B, D]
/// [A, B, E]
/// [A, C, F]
/// ```
fn split_report(report: &Report<impl Context>) -> impl IntoIterator<Item = Vec<&Frame>> {
    fn rsplit(mut next: &Frame) -> Vec<VecDeque<&Frame>> {
        let mut head = VecDeque::new();

        // TODO: in theory what we could do is push_front and then reverse?
        // "unroll" recursion if there's only a single straight path
        while next.sources().len() == 1 {
            head.push_back(next);
            next = &next.sources()[0];
        }

        head.push_back(next);

        // we now either have 0 or more than 1 source, depending on the count we need to recurse
        // deeper or stop recursion and go "up" again.
        match next.sources().len() {
            0 => vec![head],
            // while loop ensures that this never happens
            1 => unreachable!(),
            _ => {
                let len = head.len();
                let head = head.into_iter();

                next.sources()
                    .iter()
                    .flat_map(rsplit)
                    .map(|mut tail| {
                        // now that we have the tail we need to prepend our head
                        // This is a bit counter-intuitive, but basically we do:
                        // Tail: [D, E, F, G]
                        // Head: [A, B, C]
                        //
                        // Tail.extend(Head): [D, E, F, G, A, B, C]
                        //
                        // [D, E, G, G, A, B, C] (rotate right)
                        // [C, D, E, G, A, B] (rotate right)
                        // [B, C, D, E, G, A] (rotate right)
                        // [A, B, C, D, E, G]
                        tail.extend(head.clone());
                        tail.rotate_right(len);

                        tail
                    })
                    .collect()
            }
        }
    }

    report
        .current_frames()
        .iter()
        .flat_map(rsplit)
        .map(Into::into)
}

type HookFn = for<'a> fn(&[&'a Frame]) -> Option<Box<dyn erased_serde::Serialize + 'a>>;

#[derive(Copy, Clone)]
pub struct Hook {
    id: TypeId,
    hook: HookFn,
}

impl Hook {
    pub fn new<E: Error>() -> Self {
        Self {
            id: TypeId::of::<E>(),
            hook: register_inner::<E>,
        }
    }
}

#[cfg(not(feature = "std"))]
type RwLock<T> = spin::RwLock<T>;

#[cfg(feature = "std")]
type RwLock<T> = std::sync::RwLock<T>;

pub(crate) struct Hooks {
    // we need to use `Option<BTreeMap<..>>` because `BTreeMap::new` is only const on nightly
    inner: RwLock<Option<BTreeMap<TypeId, HookFn>>>,
    init: spin::Once,
}

impl Hooks {
    const fn new() -> Self {
        Self {
            inner: RwLock::new(None),
            init: spin::Once::new(),
        }
    }

    fn init(&self) {
        // `spin::Once` has (in contrast to `std::sync::Once`, which - if called recursively -
        // creates a deadlock or panic)
        self.init.call_once(|| {
            // TODO: can we remove this?
            self.push(&[
                Hook::new::<TypeError>(),
                Hook::new::<ValueError>(),
                Hook::new::<MissingError>(),
                Hook::new::<UnknownVariantError>(),
                Hook::new::<UnknownFieldError>(),
                Hook::new::<ObjectItemsExtraError>(),
                Hook::new::<ArrayLengthError>(),
            ]);
        });
    }

    fn push(&self, hooks: &[Hook]) {
        // TODO: we need to check if the combination of Namespace and Id already exists, if that is
        //  the case panic?
        #[cfg(feature = "std")]
        let mut inner = self.inner.write().expect("lock has not been poisoned");
        #[cfg(not(feature = "std"))]
        let mut inner = self.inner.write();
        let inner = inner.get_or_insert(BTreeMap::new());

        for hook in hooks {
            inner.insert(hook.id, hook.hook);
        }
    }

    fn read_hooks_with<T>(&self, f: impl FnOnce(Option<&BTreeMap<TypeId, HookFn>>) -> T) -> T {
        #[cfg(feature = "std")]
        let hooks = self.inner.read().expect("should not be poisoned");
        #[cfg(not(feature = "std"))]
        let hooks = self.inner.read();

        f(hooks.as_ref())
    }

    /// Divide frames, this looks a every strain and checks and finds the underlying variants
    /// Those variants then are extracted, meaning:
    ///
    /// ```text
    /// [A, B (Error), C, D (Error)]
    /// ```
    ///
    /// turns into:
    ///
    /// ```text
    /// [A, B (Error)]
    /// [A, B, C, D (Error)]
    /// ```
    fn divide_frames<'a>(
        &self,
        frames: impl IntoIterator<Item = Vec<&'a Frame>>,
    ) -> impl IntoIterator<Item = Vec<&'a Frame>> {
        let ids: BTreeSet<_> = self.read_hooks_with(|inner| {
            inner.map_or_else(BTreeSet::new, |inner| inner.keys().copied().collect())
        });

        frames.into_iter().flat_map(move |path| {
            let mut div = vec![];
            let mut walked = vec![];

            for frame in path {
                walked.push(frame);

                if ids.contains(&Frame::type_id(frame)) {
                    div.push(walked.clone());
                }
            }

            div
        })
    }

    fn serialize_report<S: Serializer>(
        &self,
        report: &Report<impl Context>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        self.init();

        let frames = split_report(report);
        let frames = self.divide_frames(frames);

        serializer.collect_seq(frames.into_iter().filter_map(|stack| {
            let last = stack.last()?;
            let type_id = Frame::type_id(last);

            // TODO: potentially we'd want to move this out, depending on performance
            //  but this is an RwLock, which means that usually speed should not be of concern.
            let hook: HookFn =
                self.read_hooks_with(|hooks| hooks.and_then(|hooks| hooks.get(&type_id).copied()))?;

            hook(stack.as_slice())
        }))
    }
}

static HOOKS: Hooks = Hooks::new();

#[macro_export]
macro_rules! register {
    (($ty:ident,)*) => {
        $crate::error::__private::register(&[$($crate::error::Hook::new::<$ty>(),)*])
    };
}

pub use register;

pub fn register_hooks(hooks: &[Hook]) {
    HOOKS.push(hooks);
}

pub struct Export<C: Context>(Report<C>);

impl<C: Context> Export<C> {
    pub(crate) const fn new(report: Report<C>) -> Self {
        Self(report)
    }
}

impl<C: Context> Serialize for Export<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        HOOKS.serialize_report(&self.0, serializer)
    }
}

#[cfg(test)]
mod tests {
    use alloc::{format, vec, vec::Vec};
    use core::fmt::{Display, Formatter};

    use error_stack::{AttachmentKind, Context, Frame, FrameKind, Report};
    use serde_json::{json, to_value};

    use crate::{
        error::{
            hooks::{split_report, Hook, HOOKS},
            Error, ErrorProperties, ExpectedType, Id, Location, MissingError, Namespace,
            ReceivedValue, ReportExt, Schema, ValueError, VisitorError, NAMESPACE,
        },
        id,
    };

    #[derive(Debug)]
    struct Printable(&'static str);

    impl Display for Printable {
        fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
            f.write_str(self.0)
        }
    }

    #[derive(Debug)]
    struct Root;

    impl Display for Root {
        fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
            f.write_str("Root Error")
        }
    }

    impl Context for Root {}

    fn assert_stack(frames: &[&Frame], expect: &[&'static str]) {
        let frames: Vec<_> = frames
            .iter()
            .filter_map(|frame| match frame.kind() {
                FrameKind::Context(context) => Some(format!("{context}")),
                FrameKind::Attachment(AttachmentKind::Printable(printable)) => {
                    Some(format!("{printable}"))
                }
                FrameKind::Attachment(_) => None,
            })
            .collect();

        assert_eq!(frames, expect);
    }

    /// ```text
    ///     A -
    ///    / \  \
    ///   B   C  G
    ///  / \  |
    /// D   E F
    /// ```
    ///
    /// will output:
    ///
    /// ```text
    /// [A, B, D]
    /// [A, B, E]
    /// [A, C, F]
    /// [A, G]
    /// ```
    #[test]
    #[allow(clippy::many_single_char_names)]
    fn split() {
        let f = Report::new(Root).attach_printable(Printable("F"));
        let e = Report::new(Root).attach_printable(Printable("E"));
        let mut d = Report::new(Root).attach_printable(Printable("D"));

        d.extend_one(e);

        let mut b = d.attach_printable(Printable("B"));
        let c = f.attach_printable(Printable("C"));

        let g = Report::new(Root).attach_printable(Printable("G"));

        b.extend_one(c);
        b.extend_one(g);

        let a = b.attach_printable(Printable("A"));

        let stacks: Vec<_> = split_report(&a).into_iter().collect();

        assert_stack(&stacks[0], &["A", "B", "D", "Root Error"]);
        assert_stack(&stacks[1], &["A", "B", "E", "Root Error"]);
        assert_stack(&stacks[2], &["A", "C", "F", "Root Error"]);
        assert_stack(&stacks[3], &["A", "G", "Root Error"]);
    }

    #[derive(Debug)]
    struct Y;

    impl Display for Y {
        fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
            f.write_str("Y Error")
        }
    }

    impl Context for Y {}

    #[derive(Debug)]
    struct Z;

    impl Display for Z {
        fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
            f.write_str("Z Error")
        }
    }

    impl Context for Z {}

    impl Error for Z {
        type Properties = ();

        const ID: Id = id!["custom"];
        const NAMESPACE: Namespace = NAMESPACE;

        fn message<'a>(
            &self,
            fmt: &mut Formatter,
            _: &<Self::Properties as ErrorProperties>::Value<'a>,
        ) -> core::fmt::Result {
            fmt.write_str("Z Error")
        }
    }

    /// ```text
    ///     A - -
    ///    / \  \ \
    ///   B   C  G H
    ///  / \  |  | |
    /// Y   Y Y  Y Y
    /// |   | |  |
    /// Z   E |  Z
    /// |   | |  |
    /// D   Z F  Z
    /// |   | |
    /// Z   Y Z
    /// ```
    ///
    /// Y: `Context`, `!Error`
    /// Z: `Context`, `Error`
    ///
    /// will output:
    ///
    /// ```text
    /// [A, B, Y Error, Z Error]
    /// [A, B, Y Error, Z Error, D, Z Error]
    /// [A, B, Y Error, E, Z Error]
    /// [A, C, Y Error, F, Z Error]
    /// [A, G, Y Error, Z Error]
    /// [A, G, Y Error, Z Error, Z Error]
    /// ```
    #[test]
    #[allow(clippy::many_single_char_names)]
    fn divide_integration() {
        let mut b = Report::new(Z)
            .attach_printable(Printable("D"))
            .change_context(Z)
            .change_context(Y);

        let e = Report::new(Y)
            .change_context(Z)
            .attach_printable(Printable("E"))
            .change_context(Y);
        b.extend_one(e);

        let mut b = b.attach_printable(Printable("B"));

        let c = Report::new(Z)
            .attach_printable(Printable("F"))
            .change_context(Y)
            .attach_printable(Printable("C"));

        let g = Report::new(Z)
            .change_context(Z)
            .change_context(Y)
            .attach_printable(Printable("G"));

        let h = Report::new(Y).attach_printable(Printable("H"));

        b.extend_one(c);
        b.extend_one(g);
        b.extend_one(h);

        let a = b.attach_printable(Printable("A"));

        HOOKS.push(&[Hook::new::<Z>()]);

        let split = split_report(&a);
        let frames = HOOKS.divide_frames(split);

        let stacks: Vec<_> = frames.into_iter().collect();

        // [A, B, Y Error, Z Error]
        // [A, B, Y Error, Z Error, D, Z Error]
        // [A, B, Y Error, E, Z Error]
        // [A, C, Y Error, F, Z Error]
        // [A, G, Y Error, Z Error]
        // [A, G, Y Error, Z Error, Z Error]
        assert_stack(&stacks[0], &["A", "B", "Y Error", "Z Error"]);
        assert_stack(&stacks[1], &[
            "A", "B", "Y Error", "Z Error", "D", "Z Error",
        ]);
        assert_stack(&stacks[2], &["A", "B", "Y Error", "E", "Z Error"]);
        assert_stack(&stacks[3], &["A", "C", "Y Error", "F", "Z Error"]);
        assert_stack(&stacks[4], &["A", "G", "Y Error", "Z Error"]);
        assert_stack(&stacks[5], &["A", "G", "Y Error", "Z Error", "Z Error"]);
    }

    #[test]
    fn divide_ignore() {
        let report = Report::new(Y).attach(Printable("A"));
        let split = split_report(&report);
        let frames = HOOKS.divide_frames(split);

        assert_eq!(frames.into_iter().count(), 0);
    }

    #[test]
    fn divide_division() {
        let report = Report::new(Z)
            .attach_printable(Printable("A"))
            .attach_printable(Printable("B"))
            .change_context(Z)
            .attach_printable(Printable("C"))
            .attach_printable(Printable("D"));

        HOOKS.push(&[Hook::new::<Z>()]);

        let split = split_report(&report);
        let mut frames = HOOKS.divide_frames(split).into_iter();

        assert_stack(&frames.next().unwrap(), &["D", "C", "Z Error"]);
        assert_stack(&frames.next().unwrap(), &[
            "D", "C", "Z Error", "B", "A", "Z Error",
        ]);
    }

    #[test]
    fn serialize_single() {
        // simulates that we expected to receive `id` (of type int) at `.0.a.b`, but did not
        let report = Report::new(MissingError)
            .attach(Location::Field("b"))
            .attach(Location::Field("a"))
            .attach(Location::Array(0))
            .attach(ExpectedType::new(Schema::new("integer")));

        let export = report.export();
        let export = to_value(export).expect("should be ok");

        assert_eq!(
            export,
            json!([{
                "namespace": "deer",
                "id": ["value", "missing"],
                "message": "received no value, but expected value of type integer",
                "properties": {
                    "location": [
                        {"type": "array", "value": 0},
                        {"type": "field", "value": "a"},
                        {"type": "field", "value": "b"}
                    ],
                    "expected": {
                        "type": "integer"
                    }
                }
            }])
        );
    }

    #[test]
    fn serialize_multiple() {
        // simulates that we have two errors:
        // * ValueError: u8 @ `.0.a`, received 256
        // * MissingError: String @`.0.b`, received nothing

        let mut missing = Report::new(MissingError)
            .attach(ExpectedType::new(Schema::new("string")))
            .attach(Location::Field("b"))
            .change_context(VisitorError);

        let value = Report::new(ValueError)
            .attach(ReceivedValue::new(256u16))
            .attach(ExpectedType::new(
                Schema::new("integer")
                    .with("minimum", u8::MIN)
                    .with("maximum", u8::MAX),
            ))
            .attach(Location::Field("a"))
            .change_context(VisitorError);

        missing.extend_one(value);

        let report = missing.attach(Location::Array(0));

        let export = report.export();
        let export = to_value(export).expect("should be ok");

        assert_eq!(
            export,
            json!([{
                "namespace": "deer",
                "id": ["value", "missing"],
                "message": "received no value, but expected value of type string",
                "properties": {
                    "location": [
                        {"type": "array", "value": 0},
                        {"type": "field", "value": "b"}
                    ],
                    "expected": {
                        "type": "string"
                    }
                }
            }, {
                "namespace": "deer",
                "id": ["value"],
                "message": "received value is of correct type (integer), but does not fit constraints",
                "properties": {
                    "location": [
                        {"type": "array", "value": 0},
                        {"type": "field", "value": "a"}
                    ],
                    "received": 256,
                    "expected": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 255,
                    }
                }
            }])
        );
    }
}
