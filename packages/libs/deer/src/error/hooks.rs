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
    sync::atomic::{AtomicBool, Ordering},
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
type HookVec = spin::RwLock<Vec<Hook>>;

#[cfg(feature = "std")]
type HookVec = std::sync::RwLock<Vec<Hook>>;

pub(crate) struct Hooks {
    inner: HookVec,
    init: AtomicBool,
}

impl Hooks {
    const fn new() -> Self {
        Self {
            inner: HookVec::new(Vec::new()),
            init: AtomicBool::new(false),
        }
    }

    fn init(&self) {
        if self
            .init
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            // we already initiated, and therefore need to stop
            return;
        }

        // these need to be called separately, ideally this would be a const array, but TypeId::of
        // is not const
        // TODO: can we remove this? TODO: where does it need to be called?
        self.push(&[
            Hook::new::<TypeError>(),
            Hook::new::<ValueError>(),
            Hook::new::<MissingError>(),
            Hook::new::<UnknownVariantError>(),
            Hook::new::<UnknownFieldError>(),
            Hook::new::<ObjectItemsExtraError>(),
            Hook::new::<ArrayLengthError>(),
        ]);
    }

    fn push(&self, hooks: &[Hook]) {
        self.init();
        // TODO: we need to check if the combination of Namespace and Id already exists, if that is
        //  the case panic?

        #[cfg(feature = "std")]
        let mut inner = self.inner.write().expect("lock has not been poisoned");
        #[cfg(not(feature = "std"))]
        let mut inner = self.inner.write();

        for hook in hooks {
            inner.push(*hook);
        }
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
        let ids: BTreeSet<_> = {
            #[cfg(feature = "std")]
            let inner = self.inner.read().expect("should not be poisoned");
            #[cfg(not(feature = "std"))]
            let inner = self.inner.read();
            inner.iter().map(|hook| hook.id).collect()
        };

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

    pub(crate) fn serialize_report<S: Serializer>(
        &self,
        report: &Report<impl Context>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        let frames = split_report(report);
        let frames = self.divide_frames(frames);

        let hooks: BTreeMap<_, _> = {
            #[cfg(feature = "std")]
            let inner = self.inner.read().expect("should not be poisoned");
            #[cfg(not(feature = "std"))]
            let inner = self.inner.read();
            inner.iter().map(|hook| (hook.id, hook.hook)).collect()
        };

        serializer.collect_seq(frames.into_iter().filter_map(|stack| {
            let last = stack.last()?;
            let type_id = Frame::type_id(last);

            let hook: HookFn = *hooks.get(&type_id)?;

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

struct Handle<C: Context>(Report<C>);

impl<C: Context> Serialize for Handle<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        HOOKS.serialize_report(&self.0, serializer)
    }
}
