#![feature(never_type, impl_trait_in_assoc_type)]

extern crate alloc;

mod delegate;
mod error;
pub mod router;
pub mod session;

// TODO: Route should integrate into `Layer` and we have a `ServiceDelegate` wrapper for a layer!
// (this requires a nameable error type tho!)

// pub(crate) trait Route<S, C> {
//     fn route<B>(
//         &self,
//         request: Request<B>,
//         session: &S,
//         codec: &C,
//     ) -> impl Future<Output = Response<impl Body<Control: AsRef<ResponseKind>>>> + Send
//     where
//         B: Body<Control = !, Error: Send + Sync> + Send + Sync;
// }

// impl<S, C> Route<S, C> for HNil
// where
//     C: ErrorEncoder + Send + Sync,
//     S: Sync,
// {
//     async fn route<B>(
//         &self,
//         request: Request<B>,
//         _: &S,
//         codec: &C,
//     ) -> Response<impl Body<Control: AsRef<ResponseKind>>>
//     where
//         B: Body<Control = !, Error: Send + Sync> + Send + Sync,
//     {
//         let error = codec
//             .encode_error(NotFound {
//                 service: request.service().id,
//                 version: request.service().version,
//             })
//             .await;

//         Response::from_error(Parts::new(request.session()), error)
//     }
// }

// impl<Head, Tail, S, C> Route<S, C> for HCons<Head, Tail>
// where
//     Head: ServiceDelegate<S, C>,
//     Tail: Route<S, C>,
// {
//     async fn route<B>(
//         &self,
//         request: Request<B>,
//         session: &S,
//         codec: &C,
//     ) -> Response<impl Body<Control: AsRef<ResponseKind>>>
//     where
//         B: Body<Control = !, Error: Send + Sync> + Send + Sync,
//     {
//         let version = <Head::Service as Service>::VERSION;
//         let id = <Head::Service as Service>::ID;

//         let descriptor = request.service();
//         // The version requested is implicitly `^X.Y`, meaning that `X == version.major` and `Y
// >=         // version.minor`.
//         let matches_version =
//             descriptor.version.major == version.major && descriptor.version.minor >=
// version.minor;

//         if descriptor.id == id && matches_version {
//             self.head
//                 .call(request, session, codec)
//                 .await
//                 .map_body(Either::Left)
//         } else {
//             self.tail
//                 .route(request, session, codec)
//                 .await
//                 .map_body(Either::Right)
//         }
//     }
// }

pub struct Router<S> {
    services: S,
}
