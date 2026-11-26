use hash_crypto::Secret;
use testcontainers::{
    ContainerAsync, ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use uuid::Uuid;

use crate::{IntegrationNamespace, S3Bucket};

/// Starts MinIO with an empty `captures` bucket and returns it with its API port.
pub(crate) async fn minio() -> (ContainerAsync<MinIO>, u16) {
    let minio = MinIO::default()
        .with_name("ghcr.io/hashdeps/minio")
        .with_tag("RELEASE.2025-09-07T16-13-09Z")
        .start()
        .await
        .expect("the MinIO fixture should start");
    minio
        .exec(
            ExecCommand::new([
                "sh",
                "-c",
                "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb \
                 local/captures",
            ])
            .with_cmd_ready_condition(CmdWaitFor::exit_code(0)),
        )
        .await
        .expect("should create the bucket");
    let port = minio
        .get_host_port_ipv4(9000)
        .await
        .expect("the MinIO port should be mapped");
    (minio, port)
}

/// The namespace of the `aviation` connector in a fixed web.
pub(crate) fn namespace() -> IntegrationNamespace {
    IntegrationNamespace::new(
        Uuid::from_u128(1),
        &"aviation".parse().expect("should be a connector ID"),
    )
}

pub(crate) fn bucket(port: u16) -> S3Bucket {
    S3Bucket {
        uri: "s3://captures".into(),
        region: "us-east-1".into(),
        endpoint: Some(format!("localhost:{port}").into()),
        use_ssl: false,
        key_id: "minioadmin".into(),
        secret: Secret::from_vec(b"minioadmin".to_vec()),
    }
}
