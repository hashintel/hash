use alloc::sync::Arc;
use std::{fs::File, path::Path};

use arrow_array::{ArrayRef, Int64Array, RecordBatch};
use hash_crypto::Secret;
use hash_integrations_definition::Definition;
use parquet::arrow::ArrowWriter;
use testcontainers::{
    ContainerAsync, ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use time::OffsetDateTime;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

use crate::{IntegrationNamespace, RunId, S3Bucket, StartInput, Storage, start};

/// The example definition of the `aviation` connector.
const AVIATION: &str = include_str!("../../definition/examples/aviation.yaml");

/// Starts `run` of the `aviation` example in `storage`.
pub(crate) async fn started(storage: &Storage, run: RunId) {
    let definition =
        Definition::from_yaml(AVIATION).expect("the example should be a valid definition");
    let input = StartInput {
        run,
        web: WebId::new(Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0001)),
        actor: ActorEntityUuid::new(Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0002)),
        definition: AVIATION.into(),
        id_namespace: None,
        submitted_at: OffsetDateTime::UNIX_EPOCH,
    };
    start(storage, &definition, input)
        .await
        .expect("should start the run");
}

/// Writes a Parquet file at `path` with one row per id, in the column `id`.
pub(crate) fn parquet(path: &Path, ids: &[i64]) {
    let ids: ArrayRef = Arc::new(Int64Array::from(ids.to_vec()));
    let batch = RecordBatch::try_from_iter([("id", ids)]).expect("should build the rows");
    let file = File::create(path).expect("should create the Parquet file");
    let mut writer =
        ArrowWriter::try_new(file, batch.schema(), None).expect("should open the Parquet writer");
    writer.write(&batch).expect("should write the rows");
    writer.close().expect("should finish the Parquet file");
}

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
