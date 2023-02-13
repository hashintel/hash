use alloc::{boxed::Box, vec::Vec};
use core::{any::TypeId, iter::FusedIterator};

pub(crate) use default::install_builtin_serde_hooks;

use crate::Frame;

pub struct Serde {}

crate::hook::context::impl_hook_context! {
    // TODO: upcoming PR will add documentation
    #[allow(missing_docs)]
    pub struct HookContext<Serde> { .. }
}

fn serialize<'a, T: serde::Serialize + Send + Sync + 'static>(
    frame: &'a Frame,
) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
    #[cfg(nightly)]
    let value: &T = frame.request_ref()?;
    #[cfg(not(nightly))]
    let value: &T = frame.downcast_ref()?;
    Some(Box::new(value))
}

// Thanks to https://users.rust-lang.org/t/hrtb-on-multiple-generics/34255/2 for the solution
pub trait SerializeFn<'a, I>: Send + Sync + 'static
where
    I: Send + Sync + 'static,
{
    type Output: serde::Serialize + 'a;

    fn call(&self, value: &'a I, context: &mut HookContext<I>) -> Self::Output;
}

impl<'a, U, T, F> SerializeFn<'a, T> for F
where
    F: Fn(&'a T, &mut HookContext<T>) -> U + Send + Sync + 'static,
    U: serde::Serialize + 'a,
    T: Send + Sync + 'static,
{
    type Output = U;

    fn call(&self, value: &'a T, context: &mut HookContext<T>) -> Self::Output {
        (self)(value, context)
    }
}

type HookFnReturn<'a> = Option<Box<dyn erased_serde::Serialize + 'a>>;
type StaticHookFn = for<'a> fn(&'a Frame) -> HookFnReturn<'a>;
type DynamicHookFn = Box<
    dyn for<'a> Fn(
            &'a Frame,
            &mut HookContext<Frame>,
        ) -> Option<Box<dyn erased_serde::Serialize + 'a>>
        + Send
        + Sync
        + 'static,
>;

enum HookFn {
    Static(StaticHookFn),
    Dynamic(DynamicHookFn),
}

struct Hook {
    ty: TypeId,
    hook: HookFn,
}

impl Hook {
    fn new_static<T: serde::Serialize + Send + Sync + 'static>() -> Self {
        Self {
            ty: TypeId::of::<T>(),
            hook: HookFn::Static(serialize::<T>),
        }
    }

    fn new_dynamic<F, I>(closure: F) -> Self
    where
        F: for<'a> SerializeFn<'a, I>,
        for<'a> <F as SerializeFn<'a, I>>::Output: serde::Serialize + 'a,
        I: Send + Sync + 'static,
    {
        // to ensure proper lifetimes we dispatch via a function not closure, as it let's us specify
        // lifetimes
        fn dispatch<'a, F, I>(
            closure: &F,
            frame: &'a Frame,
            context: &mut HookContext<Frame>,
        ) -> Option<Box<dyn erased_serde::Serialize + 'a>>
        where
            F: for<'b> SerializeFn<'b, I>,
            for<'b> <F as SerializeFn<'b, I>>::Output: serde::Serialize + 'b,
            I: Send + Sync + 'static,
        {
            #[cfg(nightly)]
            let value = frame.request_ref::<I>()?;

            #[cfg(not(nightly))]
            let value = frame.downcast_ref::<I>()?;

            let value = closure.call(value, context.cast());

            Some(Box::new(value))
        }

        let closure: DynamicHookFn =
            Box::new(move |frame: &Frame, context: &mut HookContext<Frame>| {
                dispatch::<_, I>(&closure, frame, context)
            });

        Self {
            ty: TypeId::of::<I>(),
            hook: HookFn::Dynamic(closure),
        }
    }

    fn call<'a>(
        &self,
        frame: &'a Frame,
        context: &mut HookContext<Frame>,
    ) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
        match &self.hook {
            HookFn::Static(hook) => hook(frame),
            HookFn::Dynamic(hook) => hook(frame, context),
        }
    }
}

pub(crate) struct SerdeHooks {
    inner: Vec<Hook>,
}

impl SerdeHooks {
    pub(crate) const fn new() -> Self {
        Self { inner: Vec::new() }
    }

    pub(crate) fn insert_static<T: serde::Serialize + Send + Sync + 'static>(&mut self) {
        let type_id = TypeId::of::<T>();

        // make sure that previous hooks of the same TypeId are deleted
        self.inner.retain(|hook| hook.ty != type_id);
        self.inner.push(Hook::new_static::<T>());
    }

    pub(crate) fn insert_dynamic<F, I>(&mut self, closure: F)
    where
        F: for<'a> SerializeFn<'a, I>,
        for<'a> <F as SerializeFn<'a, I>>::Output: serde::Serialize + 'a,
        I: Send + Sync + 'static,
    {
        let type_id = TypeId::of::<I>();

        // make sure that previous hooks of the same TypeId are deleted
        self.inner.retain(|hook| hook.ty != type_id);
        self.inner.push(Hook::new_dynamic(closure));
    }

    pub(crate) fn call<'a>(
        &'a self,
        frame: &'a Frame,
        context: &'a mut HookContext<Frame>,
    ) -> impl FusedIterator<Item = Box<dyn erased_serde::Serialize + 'a>> + 'a + '_ {
        self.inner
            .iter()
            .filter_map(|hook| hook.call(frame, context))
    }
}

mod default {
    #![allow(unused_imports)]

    use core::{
        panic::Location,
        sync::atomic::{AtomicBool, Ordering},
    };
    #[cfg(all(feature = "std", rust_1_65))]
    use std::backtrace::Backtrace;
    #[cfg(feature = "std")]
    use std::sync::Once;

    use serde::{
        ser::{SerializeSeq, SerializeStruct},
        Serialize, Serializer,
    };
    #[cfg(all(not(feature = "std"), feature = "hooks"))]
    use spin::once::Once;
    #[cfg(feature = "spantrace")]
    use tracing_core::{field::FieldSet, Metadata};
    #[cfg(feature = "spantrace")]
    use tracing_error::SpanTrace;

    #[allow(clippy::wildcard_imports)]
    use super::*;
    use crate::Report;

    struct SerializeLocation<'a>(&'a Location<'static>);

    impl SerializeLocation<'static> {
        fn hook<'a>(
            value: &'a Location<'static>,
            _: &mut HookContext<Location<'static>>,
        ) -> SerializeLocation<'a> {
            SerializeLocation(value)
        }
    }

    // we're not using derive here, as we would need to add additional serde features that are quite
    // heavy and (sometimes) unsuited for no-std environments
    impl Serialize for SerializeLocation<'_> {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let Self(location) = *self;
            let mut s = serializer.serialize_struct("Location", 3)?;

            s.serialize_field("file", location.file())?;
            s.serialize_field("line", &location.line())?;
            s.serialize_field("column", &location.column())?;

            s.end()
        }
    }

    #[cfg(feature = "spantrace")]
    struct SerializeSpanTraceFields(&'static FieldSet);

    #[cfg(feature = "spantrace")]
    impl Serialize for SerializeSpanTraceFields {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let Self(fields) = *self;

            let mut s = serializer.serialize_seq(Some(fields.len()))?;

            for field in fields.iter() {
                s.serialize_element(field.name())?;
            }

            s.end()
        }
    }

    #[cfg(feature = "spantrace")]
    struct SerializeSpanTraceMetadata(&'static Metadata<'static>);

    #[cfg(feature = "spantrace")]
    impl Serialize for SerializeSpanTraceMetadata {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let Self(metadata) = *self;
            let mut s = serializer.serialize_struct("Metadata", 8)?;

            s.serialize_field("fields", &SerializeSpanTraceFields(metadata.fields()))?;
            s.serialize_field("level", metadata.level().as_str())?;
            s.serialize_field("name", metadata.name())?;
            s.serialize_field("target", metadata.target())?;
            s.serialize_field("module_path", &metadata.module_path())?;
            s.serialize_field("file", &metadata.file())?;
            s.serialize_field("line", &metadata.line())?;
            s.serialize_field("type", if metadata.is_event() { "event" } else { "span" })?;

            s.end()
        }
    }

    #[cfg(feature = "spantrace")]
    struct SerializeSpanTraceSpans<'a>(&'a SpanTrace);

    #[cfg(feature = "spantrace")]
    impl Serialize for SerializeSpanTraceSpans<'_> {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let Self(span_trace) = *self;
            let mut seq = serializer.serialize_seq(None)?;

            let mut error: Result<(), S::Error> = Ok(());

            span_trace.with_spans(|metadata, _| {
                if let Err(err) = seq.serialize_element(&SerializeSpanTraceMetadata(metadata)) {
                    error = Err(err);

                    false
                } else {
                    true
                }
            });

            error?;

            seq.end()
        }
    }

    #[cfg(feature = "spantrace")]
    struct SerializeSpantrace<'a>(&'a SpanTrace);

    #[cfg(feature = "spantrace")]
    impl SerializeSpantrace<'static> {
        fn hook<'a>(
            value: &'a SpanTrace,
            _: &mut HookContext<SpanTrace>,
        ) -> SerializeSpantrace<'a> {
            SerializeSpantrace(value)
        }
    }

    #[cfg(feature = "spantrace")]
    impl Serialize for SerializeSpantrace<'_> {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let Self(span_trace) = *self;
            let mut s = serializer.serialize_struct("SpanTrace", 1)?;

            s.serialize_field("spans", &SerializeSpanTraceSpans(span_trace))?;

            s.end()
        }
    }

    #[cfg(all(feature = "std", rust_1_65))]
    fn backtrace(backtrace: &Backtrace, _: &mut HookContext<Backtrace>) -> Vec<String> {
        backtrace
            .to_string()
            .lines()
            .map(ToOwned::to_owned)
            .collect()
    }

    pub(crate) fn install_builtin_serde_hooks() {
        // We could in theory remove this and replace it with a single AtomicBool.
        static INSTALL_BUILTIN: Once = Once::new();

        // This static makes sure that we only run once, if we wouldn't have this guard we would
        // deadlock, as `install_debug_hook` calls `install_builtin_hooks`, and according to the
        // docs:
        //
        // > If the given closure recursively invokes call_once on the same Once instance the exact
        // > behavior is not specified, allowed outcomes are a panic or a deadlock.
        //
        // This limitation is not present for the implementation from the spin crate, but for
        // simplicity and readability the extra guard is kept.
        static INSTALL_BUILTIN_RUNNING: AtomicBool = AtomicBool::new(false);

        // This has minimal overhead, as `Once::call_once` calls `.is_completed` as the short path
        // we just move it out here, so that we're able to check `INSTALL_BUILTIN_RUNNING`
        if INSTALL_BUILTIN.is_completed() || INSTALL_BUILTIN_RUNNING.load(Ordering::Acquire) {
            return;
        }

        INSTALL_BUILTIN.call_once(|| {
            INSTALL_BUILTIN_RUNNING.store(true, Ordering::Release);

            Report::install_custom_serde_hook(SerializeLocation::hook);

            #[cfg(all(feature = "std", rust_1_65))]
            Report::install_custom_serde_hook::<Backtrace>(backtrace);

            #[cfg(feature = "spantrace")]
            Report::install_custom_serde_hook(SerializeSpantrace::hook);
        });
    }
}
