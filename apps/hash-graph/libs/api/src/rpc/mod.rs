pub mod account;
pub mod auth;
mod session;

mod role {
    use alloc::vec;
    use core::error::Error;

    use bytes::Buf;
    use error_stack::{Report, TryReportStreamExt as _};
    use futures::stream;
    use harpc_client::connection::Connection;
    use harpc_codec::{decode::Decoder, encode::Encoder};
    use harpc_server::session::{Session, SessionId};
    use harpc_service::procedure::ProcedureIdentifier as _;
    pub(crate) use harpc_service::role::Role;
    use harpc_tower::{
        Extensions,
        request::{self, Request},
        response::Response,
    };
    use harpc_types::{procedure::ProcedureDescriptor, service::ServiceDescriptor};

    use super::session::User;

    pub(crate) trait ConnectionService<C>:
        tower::Service<
            Request<stream::Iter<vec::IntoIter<C::Buf>>>,
            Response = Response<Self::ResponseStream>,
            Error = Report<Self::ServiceError>,
            Future: Send,
        > + Clone
        + Send
        + Sync
    where
        C: Encoder,
    {
        type ResponseData: Buf;
        type ResponseError;

        type ServiceError: Error + Send + Sync + 'static;
        type ResponseStream: futures::Stream<Item = Result<Self::ResponseData, Self::ResponseError>>
            + Send
            + Sync;
    }

    type RequestStream<C> = stream::Iter<vec::IntoIter<<C as Encoder>::Buf>>;

    impl<C, St, ResData, ResError, ServiceError, T> ConnectionService<C> for T
    where
        T: tower::Service<
                Request<RequestStream<C>>,
                Response = Response<St>,
                Error = Report<ServiceError>,
                Future: Send,
            > + Clone
            + Send
            + Sync,
        C: Encoder,
        St: futures::Stream<Item = Result<ResData, ResError>> + Send + Sync,
        ResData: Buf,
        ServiceError: Error + Send + Sync + 'static,
    {
        type ResponseData = ResData;
        type ResponseError = ResError;
        type ResponseStream = St;
        type ServiceError = ServiceError;
    }

    pub(crate) trait ConnectionCodec:
        Encoder<Error = Report<Self::EncoderError>>
        + Decoder<Error = Report<Self::DecoderError>>
        + Clone
        + Send
        + Sync
    {
        type EncoderError: Error + Send + Sync + 'static;
        type DecoderError: Error + Send + Sync + 'static;
    }

    impl<C, EncoderError, DecoderError> ConnectionCodec for C
    where
        C: Encoder<Error = Report<EncoderError>>
            + Decoder<Error = Report<DecoderError>>
            + Clone
            + Send
            + Sync,
        EncoderError: Error + Send + Sync + 'static,
        DecoderError: Error + Send + Sync + 'static,
    {
        type DecoderError = DecoderError;
        type EncoderError = EncoderError;
    }

    pub(crate) async fn encode_request<S, E, C>(
        codec: E,
        procedure: S::ProcedureId,
        items: impl IntoIterator<Item: serde::Serialize, IntoIter: Send> + Send,
    ) -> Result<Request<RequestStream<E>>, Report<[C]>>
    where
        S: harpc_service::Service<ProcedureId: Send>,
        E: Encoder<Error = Report<C>, Buf: Send> + Send,
        C: Error + Send + Sync + 'static,
    {
        let items: Vec<_> = codec
            .encode(stream::iter(items))
            .try_collect_reports()
            .await?;

        Ok(Request::from_parts(
            request::Parts {
                service: ServiceDescriptor {
                    id: S::ID,
                    version: S::VERSION,
                },
                procedure: ProcedureDescriptor {
                    id: procedure.into_id(),
                },
                session: SessionId::CLIENT,
                extensions: Extensions::new(),
            },
            stream::iter(items),
        ))
    }

    pub(crate) type Server = harpc_service::role::Server<Session<User>>;
    pub(crate) type Client<Svc, C> = harpc_service::role::Client<Connection<Svc, C>>;
}
