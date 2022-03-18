import logging
import json

import flatbuffers
import pyarrow as pa
from pynng import Pair0

# Inbound
from fbs.Init import Init
from fbs.RunnerInboundMsg import RunnerInboundMsg
from fbs.RunnerInboundMsgPayload import RunnerInboundMsgPayload
from fbs.TaskMsg import TaskMsg
from fbs.StateSync import StateSync
from fbs.StateSnapshotSync import StateSnapshotSync
from fbs.ContextBatchSync import ContextBatchSync
from fbs.StateInterimSync import StateInterimSync
from fbs.NewSimulationRun import NewSimulationRun
from fbs.PackageType import PackageType
from fbs.Target import Target

PACKAGE_TYPE = PackageType
MESSAGE_TYPE = RunnerInboundMsgPayload

# Outbound
import fbs
from fbs import Serialized
from fbs import Metaversion
from fbs import Batch
from fbs import StateInterimSync as FbStateInterimSync
from fbs import TaskId
from fbs import GroupIndex
from fbs import TaskMsg as FbTaskMsg
from fbs import RunnerError
from fbs import PackageError
from fbs import UserError
from fbs import UserErrors
from fbs import UserWarning
from fbs import UserWarnings
from fbs import RunnerOutboundMsg
from fbs import SyncCompletion
from fbs.RunnerOutboundMsgPayload import RunnerOutboundMsgPayload

from batch import load_dataset


# TODO(permanently?): Keep in sync with PACKAGE_TYPE
def str_from_pkg_type(pkg_type):
    return ["init", "context", "state", "output"][pkg_type]


def assert_eq(a, b):
    assert a == b, (a, b)


def pkgs_from_config(config):
    pkgs = {}
    for i_pkg in range(config.PackagesLength()):
        fb = config.Packages(i_pkg)
        pkgs[fb.Sid()] = PyPackage(fb)
    return pkgs


def json_from_np(np_utf8):
    return json.loads(np_utf8.tobytes().decode('utf-8'))


class PyInit:
    def __init__(self, fbs_bytes):
        # TODO: Remove `experiment_id` and `worker_index` from fbs,
        #       since they're already passed as process args.
        msg = Init.GetRootAs(fbs_bytes, 0)
        self.shared_ctx = PySharedContext(msg.SharedContext())
        self.pkgs = pkgs_from_config(msg.PackageConfig())


class PySharedContext:
    def __init__(self, fb):
        self.__datasets = {}
        for i_dataset in range(fb.DatasetsLength()):
            name, data, _did_parse = load_dataset(fb.Datasets(i_dataset).BatchId())
            # TODO: Use `did_parse` to show warnings to user?
            self.__datasets[name] = data

    def data(self):
        return self.__datasets


class PyPackage:
    def __init__(self, fb):
        self.type = str_from_pkg_type(fb.Type())
        self.name = fb.Name().decode('utf-8')
        # TODO: Instead of using numpy, just replace `Serialized` with
        #       a string in the flatbuffers file?
        self.payload = json_from_np(fb.InitPayload().InnerAsNumpy())


# TODO: Remove `PyBatchMsg` and use the batch id directly
class PyBatchMsg:
    def __init__(self, fb):
        self.id = fb.BatchId()


class PyTaskMsg:
    def __init__(self, sim_id, fb):
        self.sim_id = sim_id
        self.pkg_id = fb.PackageSid()
        self.task_id = fb.TaskId()
        self.sync = PyStateInterimSync(sim_id, fb.Metaversioning())
        self.payload = json_from_np(fb.Payload().InnerAsNumpy())


class PyStateInterimSync:
    def __init__(self, sim_id, fb):
        self.sim_id = sim_id

        n_groups = fb.GroupIdxLength()
        self.group_idxs = [fb.GroupIdx(i) for i in range(n_groups)]

        assert_eq(n_groups, fb.AgentBatchesLength())
        self.agent_batches = [
            PyBatchMsg(fb.AgentBatches(i)) for i in range(n_groups)
        ]

        assert_eq(n_groups, fb.MessageBatchesLength())
        self.message_batches = [
            PyBatchMsg(fb.MessageBatches(i)) for i in range(n_groups)
        ]


class PyContextBatchSync:
    def __init__(self, sim_id, fb):
        self.sim_id = sim_id
        self.batch = PyBatchMsg(fb.ContextBatch())
        self.cur_step = fb.CurrentStep()


class PyStateSync:
    def __init__(self, sim_id, fb):
        self.sim_id = sim_id
        self.agent_pool = [
            PyBatchMsg(fb.AgentPool(i)) for i in range(fb.AgentPoolLength())
        ]
        self.message_pool = [
            PyBatchMsg(fb.MessagePool(i)) for i in range(fb.MessagePoolLength())
        ]


class PySimRun:
    def __init__(self, fb):
        self.sim_id = fb.Sid()
        self.pkgs = pkgs_from_config(fb.PackageConfig())
        self.globals = json.loads(fb.Globals().decode('utf-8'))
        self.schema = PySchema(fb.DatastoreInit())
        # TODO: DatastoreInit datasets per sim run?


class PySchema:
    def __init__(self, fb):
        self.agent = pa.ipc.read_schema(pa.py_buffer(fb.AgentBatchSchemaAsNumpy().tobytes()))
        self.context = pa.ipc.read_schema(pa.py_buffer(fb.ContextBatchSchemaAsNumpy().tobytes()))
        self.message = pa.ipc.read_schema(pa.py_buffer(fb.MessageBatchSchemaAsNumpy().tobytes()))


class PyTerminateSim:
    def __init__(self, sim_id):
        self.sim_id = sim_id


class Messenger:
    def __init__(self, experiment_id, worker_index):
        prefix = 'ipc://' + experiment_id
        worker_index = str(worker_index)

        # `to_rust` is for sending messages to the Rust process,
        # e.g. requesting init message and sending task results.
        # `send_address` format must match format in nng receiver
        # in `python/mod.rs`.
        send_address = prefix + '-frompy' + worker_index
        self.to_rust = Pair0(dial=send_address)
        logging.debug("Opened socket to Rust")

        # For receiving messages from the Rust process
        recv_address = prefix + '-topy' + worker_index
        self.from_rust = Pair0(listen=recv_address)

    def __del__(self):
        # Have to check with `hasattr` because exception
        # might have been thrown in the middle of __init__.
        if hasattr(self, 'to_rust'):
            self.to_rust.close()
        if hasattr(self, 'from_rust'):
            self.from_rust.close()

    # Receive experiment init message.
    def recv_init(self):
        # Notify Rust process that the Python runner has opened the socket.
        self.to_rust.send(b'\x00')  # Arbitrary message
        logging.debug("Waiting for init")

        # Get reply from Rust process with init message.
        # This is the only case in which `to_rust` is used for receiving.
        fbs_bytes = self.to_rust.recv()
        logging.debug("Received init message")

        self.to_rust.send(b'\x00')  # Arbitrary message
        return PyInit(fbs_bytes)

    def recv(self):
        fbs_bytes = self.from_rust.recv()
        msg = RunnerInboundMsg.GetRootAs(fbs_bytes, 0)

        sim_sid = msg.SimSid()
        t = msg.PayloadType()
        p = msg.Payload()

        if t == MESSAGE_TYPE.TaskMsg:
            msg = TaskMsg()
            msg.Init(p.Bytes, p.Pos)
            return PyTaskMsg(sim_sid, msg), t

        if t == MESSAGE_TYPE.CancelTask:
            # TODO: CancelTask isn't used for now
            return None, t

        if t == MESSAGE_TYPE.StateSync:
            msg = StateSync()
            msg.Init(p.Bytes, p.Pos)
            return PyStateSync(sim_sid, msg), t

        if t == MESSAGE_TYPE.StateSnapshotSync:
            msg = StateSnapshotSync()
            msg.Init(p.Bytes, p.Pos)
            # Everything is the same as state sync
            # except for the message type.
            return PyStateSync(sim_sid, msg), t

        if t == MESSAGE_TYPE.ContextBatchSync:
            msg = ContextBatchSync()
            msg.Init(p.Bytes, p.Pos)
            return PyContextBatchSync(sim_sid, msg), t

        if t == MESSAGE_TYPE.StateInterimSync:
            msg = StateInterimSync()
            msg.Init(p.Bytes, p.Pos)
            return PyStateInterimSync(sim_sid, msg), t

        if t == MESSAGE_TYPE.TerminateSimulationRun:
            return PyTerminateSim(sim_sid), t

        if t == MESSAGE_TYPE.TerminateRunner:
            return None, t  # TerminateRunner payload is empty.

        if t == MESSAGE_TYPE.NewSimulationRun:
            msg = NewSimulationRun()
            msg.Init(p.Bytes, p.Pos)
            return PySimRun(msg), t

        raise RuntimeError(
            "Unknown message type {} from sim {}".format(t, sim_sid)
        )

    def send_task_continuation(
            self,
            sim_id,
            changes,
            pkg_id,
            task_id,
            group_idx,
            continuation
    ):
        # TODO: OPTIM Combine warnings, errors and other values into single message.
        self.send_user_warnings(continuation.get("warnings", []))
        self.send_user_errors(continuation.get("errors", []))
        target = continuation.get("target", "Main")
        task_msg = continuation.get("task", "{}")
        fbs_bytes = outbound_task_to_fbs_bytes(sim_id, changes, pkg_id, task_id, target, group_idx, task_msg)
        self.to_rust.send(fbs_bytes)

    def send_sync_completion(self, sim_id=0):
        fbs_bytes = completion_to_fbs_bytes(sim_id)
        self.to_rust.send(fbs_bytes)

    def send_runner_error(self, error, sim_id=0):
        """
        :param sim_id: ID of the simulation run from which the error originated.
        If the error isn't specific to any simulation run, we use 0 as an invalid id.
        """
        fbs_bytes = outbound_runner_error_to_fbs_bytes(error, sim_id)
        self.to_rust.send(fbs_bytes)

    def send_pkg_error(self, error, sim_id=0):
        """
        :param sim_id: ID of the simulation run from which the error originated.
        If the error isn't specific to any simulation run, we use 0 as an invalid id.
        """
        fbs_bytes = outbound_pkg_error_to_fbs_bytes(error, sim_id)
        self.to_rust.send(fbs_bytes)

    def send_user_errors(self, errors, sim_id=0):
        """
        :param sim_id: ID of the simulation run from which the errors originated.
        If the errors aren't specific to any simulation run, we use 0 as an invalid id.
        """
        if len(errors) == 0:
            return

        logging.error(f"User errors: {errors}")

        fbs_bytes = outbound_user_errors_to_fbs_bytes(errors, sim_id)
        self.to_rust.send(fbs_bytes)

    def send_user_warnings(self, warnings, sim_id=0):
        """
        :param sim_id: ID of the simulation run from which the warnings originated.
        If the warnings aren't specific to any simulation run, we use 0 as an invalid id.
        """
        if len(warnings) == 0:
            return

        logging.warning(f"User warnings: {warnings}")

        fbs_bytes = outbound_user_warnings_to_fbs_bytes(warnings, sim_id)
        self.to_rust.send(fbs_bytes)


def runner_error_to_fbs(builder, error):
    msg_offset = builder.CreateString(error)

    RunnerError.Start(builder)
    RunnerError.AddMsg(builder, msg_offset)
    return RunnerError.End(builder)


def outbound_runner_error_to_fbs_bytes(error, sim_id):
    # `initialSize` only affects performance (slightly), not correctness.
    builder = flatbuffers.Builder(initialSize=len(error))
    error_offset = runner_error_to_fbs(builder, error)

    RunnerOutboundMsg.Start(builder)
    RunnerOutboundMsg.AddSimSid(builder, sim_id)
    RunnerOutboundMsg.AddPayloadType(builder, RunnerOutboundMsgPayload.RunnerError)
    RunnerOutboundMsg.AddPayload(builder, error_offset)
    outbound_offset = RunnerOutboundMsg.End(builder)

    builder.Finish(outbound_offset)
    return bytes(builder.Output())


def pkg_error_to_fbs(builder, error):
    msg_offset = builder.CreateString(error)

    PackageError.Start(builder)
    PackageError.AddMsg(builder, msg_offset)
    return PackageError.End(builder)


def outbound_pkg_error_to_fbs_bytes(error, sim_id):
    builder = flatbuffers.Builder(initialSize=len(error))
    error_offset = pkg_error_to_fbs(builder, error)

    RunnerOutboundMsg.Start(builder)
    RunnerOutboundMsg.AddSimSid(builder, sim_id)
    RunnerOutboundMsg.AddPayloadType(builder, RunnerOutboundMsgPayload.PackageError)
    RunnerOutboundMsg.AddPayload(builder, error_offset)
    outbound_offset = RunnerOutboundMsg.End(builder)

    builder.Finish(outbound_offset)
    return bytes(builder.Output())


def user_error_to_fbs(builder, error):
    msg_offset = builder.CreateString(error)

    UserError.Start(builder)
    UserError.AddMsg(builder, msg_offset)
    return UserError.End(builder)


def user_errors_to_fbs(builder, errors):
    error_offsets = [user_error_to_fbs(builder, e) for e in errors]

    UserErrors.StartInnerVector(builder, len(errors))
    for o in reversed(error_offsets):
        builder.PrependUOffsetTRelative(o)
    vector_offset = builder.EndVector(len(errors))

    UserErrors.Start(builder)
    UserErrors.AddInner(builder, vector_offset)
    return UserErrors.End(builder)


def outbound_user_errors_to_fbs_bytes(sim_id, errors):
    # `initialSize` only affects performance (slightly), not correctness.
    builder = flatbuffers.Builder(initialSize=len(errors))
    errors_offset = user_errors_to_fbs(builder, errors)

    RunnerOutboundMsg.Start(builder)
    RunnerOutboundMsg.AddSimSid(builder, sim_id)
    RunnerOutboundMsg.AddPayloadType(builder, RunnerOutboundMsgPayload.UserErrors)
    RunnerOutboundMsg.AddPayload(builder, errors_offset)
    outbound_offset = RunnerOutboundMsg.End(builder)

    builder.Finish(outbound_offset)
    return bytes(builder.Output())


def user_warning_to_fbs(builder, warning):
    msg_offset = builder.CreateString(warning)

    UserWarning.Start(builder)
    UserWarning.AddMsg(builder, msg_offset)
    return UserWarning.End(builder)


def user_warnings_to_fbs(builder, warnings):
    warning_offsets = [user_warning_to_fbs(builder, w) for w in warnings]

    UserWarnings.StartInnerVector(builder, len(warnings))
    for o in reversed(warning_offsets):
        builder.PrependUOffsetTRelative(o)
    vector_offset = builder.EndVector(len(warnings))

    UserWarnings.Start(builder)
    UserWarnings.AddInner(builder, vector_offset)
    return UserWarnings.End(builder)


def outbound_user_warnings_to_fbs_bytes(sim_id, warnings):
    # `initialSize` only affects performance (slightly), not correctness.
    builder = flatbuffers.Builder(initialSize=len(warnings))
    warnings_offset = user_warnings_to_fbs(builder, warnings)

    RunnerOutboundMsg.Start(builder)
    RunnerOutboundMsg.AddSimSid(builder, sim_id)
    RunnerOutboundMsg.AddPayloadType(builder, RunnerOutboundMsgPayload.UserWarnings)
    RunnerOutboundMsg.AddPayload(builder, warnings_offset)
    outbound_offset = RunnerOutboundMsg.End(builder)

    builder.Finish(outbound_offset)
    return bytes(builder.Output())


def target_to_fbs(target):
    try:
        return getattr(Target, target)
    except AttributeError as e:
        raise RuntimeError(f"Unknown target {target}: {e}")


def metaversion_to_fbs(builder, batch):
    Metaversion.Start(builder)
    Metaversion.AddBatch(builder, batch.batch_version)
    Metaversion.AddMemory(builder, batch.mem_version)
    return Metaversion.End(builder)


def batch_to_fbs(builder, batch):
    batch_id = builder.CreateString(batch.id)
    metaversion = metaversion_to_fbs(builder, batch)
    Batch.Start(builder)
    Batch.AddBatchId(builder, batch_id)
    Batch.AddMetaversion(builder, metaversion)
    batch_offset = Batch.End(builder)
    return batch_offset


def interim_sync_to_fbs(builder, changes):
    group_idxs = []
    agent_offsets = []
    message_offsets = []
    for c in changes:
        group_idxs.append(c['i_group'])
    for c in changes:
        agent_offsets.append(batch_to_fbs(builder, c['agent']))
    for c in changes:
        message_offsets.append(batch_to_fbs(builder, c['message']))

    FbStateInterimSync.StartGroupIdxVector(builder, len(group_idxs))
    for i in reversed(group_idxs):
        builder.PrependUint32(i)
    idxs_vector = builder.EndVector(len(group_idxs))

    FbStateInterimSync.StartAgentBatchesVector(builder, len(agent_offsets))
    for o in reversed(agent_offsets):
        builder.PrependUOffsetTRelative(o)
    agent_vector = builder.EndVector(len(agent_offsets))

    FbStateInterimSync.StartMessageBatchesVector(builder, len(message_offsets))
    for o in reversed(message_offsets):
        builder.PrependUOffsetTRelative(o)
    message_vector = builder.EndVector(len(message_offsets))

    FbStateInterimSync.Start(builder)
    FbStateInterimSync.AddGroupIdx(builder, idxs_vector)
    FbStateInterimSync.AddAgentBatches(builder, agent_vector)
    FbStateInterimSync.AddMessageBatches(builder, message_vector)
    sync_offset = FbStateInterimSync.End(builder)
    return sync_offset


def serialized_to_fbs(builder, inner_bytes):
    inner_vector = builder.CreateByteVector(inner_bytes)
    Serialized.Start(builder)
    Serialized.AddInner(builder, inner_vector)
    return Serialized.End(builder)


def task_to_fbs(builder, changes, pkg_id, task_id, target, group_idx, task_msg):
    sync_offset = interim_sync_to_fbs(builder, changes)
    payload_offset = serialized_to_fbs(builder, bytes(task_msg, encoding='utf-8'))

    FbTaskMsg.Start(builder)
    FbTaskMsg.AddPackageSid(builder, pkg_id)
    FbTaskMsg.AddTaskId(builder, TaskId.CreateTaskId(builder, task_id.Inner()))
    FbTaskMsg.AddTarget(builder, target_to_fbs(target))
    if group_idx is not None:
        FbTaskMsg.AddGroupIndex(builder, GroupIndex.CreateGroupIndex(builder, group_idx))
    FbTaskMsg.AddMetaversioning(builder, sync_offset)
    FbTaskMsg.AddPayload(builder, payload_offset)
    return FbTaskMsg.End(builder)


def completion_to_fbs(builder):
    SyncCompletion.Start(builder)
    return SyncCompletion.End(builder)


def completion_to_fbs_bytes(sim_id):
    builder = flatbuffers.Builder(initialSize=0)
    sync_completion = completion_to_fbs(builder)

    RunnerOutboundMsg.Start(builder)
    RunnerOutboundMsg.AddSimSid(builder, sim_id)
    RunnerOutboundMsg.AddPayloadType(builder, RunnerOutboundMsgPayload.SyncCompletion)
    RunnerOutboundMsg.AddPayload(builder, sync_completion)
    outbound_offset = RunnerOutboundMsg.End(builder)

    builder.Finish(outbound_offset)
    return bytes(builder.Output())


def outbound_task_to_fbs_bytes(sim_id, changes, pkg_id, task_id, target, group_idx, task_msg):
    builder = flatbuffers.Builder(initialSize=0)
    task_offset = task_to_fbs(builder, changes, pkg_id, task_id, target, group_idx, task_msg)

    RunnerOutboundMsg.Start(builder)
    RunnerOutboundMsg.AddSimSid(builder, sim_id)
    RunnerOutboundMsg.AddPayloadType(builder, RunnerOutboundMsgPayload.TaskMsg)
    RunnerOutboundMsg.AddPayload(builder, task_offset)
    outbound_offset = RunnerOutboundMsg.End(builder)

    builder.Finish(outbound_offset)
    return bytes(builder.Output())
