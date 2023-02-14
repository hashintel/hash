macro_rules! impl_const {
    (
        impl
        $(< $($arg:ident),* $(,)? >)?const?
        $trait:ident
        $(< $($targ:ident),* $(,)? >)?for
        $target:ty { $($body:tt)* }
    ) => {
        #[cfg(nightly)]
        impl $(< $($arg),* >)? const $trait $(< $($targ),* >)? for $target {
             $($body)*
        }

        #[cfg(not(nightly))]
        impl $(< $($arg),* >)? $trait $(< $($targ),* >)? for $target {
             $($body)*
        }
    };
}

pub(crate) use impl_const;
