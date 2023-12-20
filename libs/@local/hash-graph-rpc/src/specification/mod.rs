pub mod account;

macro_rules! service {
    (@collect
        $(rpc $name:ident($($args:tt)*) $(-> $output:ty)?;)*
    ) => {
        $crate::types::stack![$($name ,)*]
    };

    (@procedure[$vis:vis]) => {};

    (@procedure[$vis:vis] rpc $name:ident() $(-> $output:ty)?; $($rest:tt)*) => {
        #[derive(serde::Serialize, serde::Deserialize)]
        $vis struct $name;

        impl $crate::harpc::procedure::RemoteProcedure for $name {
            #[allow(unused_parens)]
            type Response = ($($output)?);

            const ID: $crate::harpc::ProcedureId = $crate::harpc::ProcedureId::derive(stringify!($name));
        }

        service!(@procedure[$vis] $($rest)*);
    };

    (@procedure[$vis:vis] rpc $name:ident($($fields:tt)+) $(-> $output:ty)?; $($rest:tt)*) => {
        #[derive(serde::Serialize, serde::Deserialize)]
        $vis struct $name {
            $($fields)+
        }

        impl $crate::harpc::procedure::RemoteProcedure for $name {
            #[allow(unused_parens)]
            type Response = ($($output)?);

            const ID: $crate::harpc::ProcedureId = $crate::harpc::ProcedureId::derive(stringify!($name));
        }

        service!(@procedure[$vis] $($rest)*);
    };



    ($vis:vis service $name:ident {
        $($procedures:tt)*
    }) => {
        $vis struct $name;

        impl $crate::harpc::service::Service for $name {
            type Procedures = service!(@collect $($procedures)*);

            const ID: $crate::harpc::ServiceId = $crate::harpc::ServiceId::derive(stringify!($name));
        }

        service!(@procedure[$vis] $($procedures)*);
    };
}

pub(crate) use service;
