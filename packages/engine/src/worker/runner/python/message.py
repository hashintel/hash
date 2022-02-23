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
from fbs import RunnerError
from fbs import PackageError
from fbs import UserError
from fbs import UserErrors
from fbs import UserWarnings

from batch import load_dataset


def assert_eq(a, b):
    assert a == b, (a, b)


def pkgs_from_config(config):
    pkgs = {}
    for i_pkg in range(config.PackagesLength()):
        fb = config.Packages(i_pkg)
        pkgs[fb.Sid()] = PyPackage(fb)
    return pkgs


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
        self.type = fb.Type()
        self.name = fb.Name()
        self.payload = json.loads(fb.InitPayload().Inner().decode('utf-8'))


class PyBatchMsg:
    def __init__(self, fb):
        self.id = fb.BatchId()
        m = fb.Metaversion()
        self.mem_version = m.Memory()
        self.batch_version = m.Batch()


class PyMetaversion:
    def __init__(self, fb):
        self.mem = fb.Memory()
        self.batch = fb.Batch()


class PyTaskMsg:
    def __init__(self, sim_id, fb):
        self.sim_id = sim_id
        self.pkg_id = fb.PackageSid()
        self.task_id = fb.TaskId()
        self.sync = PyStateInterimSync(fb.Metaversioning())
        self.payload = json.loads(fb.Payload().Inner().decode('utf-8'))


class PyStateInterimSync:
    def __init__(self, sim_id, fb):
        self.sim_id = sim_id

        n_batches = fb.GroupIdxLength()
        self.group_idxs = [fb.GroupIdx(i) for i in range(n_batches)]

        assert_eq(fb.AgentBatchesLength(), n_batches)
        self.agent_batches = [
            PyBatchMsg(fb.AgentBatches(i)) for i in range(n_batches)
        ]

        assert_eq(fb.MessageBatchesLength(), n_batches)
        self.message_batches = [
            PyBatchMsg(fb.MessageBatches(i)) for i in range(n_batches)
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
        self.agent = pa.ipc.read_schema(fb.AgentBatchSchema())
        self.context = pa.ipc.read_schema(fb.ContextBatchSchema())
        self.message = pa.ipc.read_schema(fb.MessageBatchSchema())


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
            return PyTaskMsg(sim_sid, TaskMsg().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.CancelTask:
            # TODO: CancelTask isn't used for now
            return None, t

        if t == MESSAGE_TYPE.StateSync:
            return PyStateSync(sim_sid, StateSync().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.StateSnapshotSync:
            # Only message type is different from state sync
            return PyStateSync(sim_sid, StateSnapshotSync().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.ContextBatchSync:
            return PyContextBatchSync(sim_sid, ContextBatchSync().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.StateInterimSync:
            return PyStateInterimSync(sim_sid, StateInterimSync().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.TerminateSimulationRun:
            return PyTerminateSim(sim_sid), t

        if t == MESSAGE_TYPE.TerminateRunner:
            return None, t  # TerminateRunner payload is empty.

        if t == MESSAGE_TYPE.NewSimulationRun:
            return PySimRun(NewSimulationRun().Init(p.Bytes, p.Pos)), t

        raise RuntimeError(
            "Unknown message type {} from sim {}".format(t, sim_sid)
        )

    def send_task_continuation(
        self,
        sim_id,
        changes,
        pkg_id,
        task_id,
        continuation
    ):
        # TODO: Combine args into single message.
        self.send_user_warnings(continuation.get("warnings", []))
        self.send_user_errors(continuation.get("errors", []))
        target = continuation.get("target", "main")
        task_msg = continuation.get("task", "")
        fbs_bytes = task_to_fbs_bytes(sim_id, changes, pkg_id, task_id, target, task_msg)
        self.to_rust.send(fbs_bytes)

    def send_runner_error(self, error):
        fbs_bytes = runner_error_to_fbs_bytes(error)
        self.to_rust.send(fbs_bytes)

    def send_pkg_error(self, error):
        fbs_bytes = pkg_error_to_fbs_bytes(error)
        self.to_rust.send(fbs_bytes)

    def send_user_errors(self, errors):
        if len(errors) == 0:
            return

        fbs_bytes = user_errors_to_fbs_bytes(errors)
        self.to_rust.send(fbs_bytes)

    def send_user_warnings(self, warnings):
        if len(warnings) == 0:
            return

        fbs_bytes = user_warnings_to_fbs_bytes(warnings)
        self.to_rust.send(fbs_bytes)


def runner_error_to_fbs_bytes(error):
    # `initialSize` only affects performance (slightly), not correctness.
    builder = flatbuffers.Builder(initialSize=len(error))

    msg_offset = builder.CreateString(error)

    RunnerError.Start(builder)
    RunnerError.AddMsg(builder, msg_offset)
    runner_error_offset = RunnerError.End(builder)

    builder.Finish(runner_error_offset)
    return bytes(builder.Output())


def pkg_error_to_fbs_bytes(error):
    # `initialSize` only affects performance (slightly), not correctness.
    builder = flatbuffers.Builder(initialSize=len(error))

    msg_offset = builder.CreateString(error)

    PackageError.Start(builder)
    PackageError.AddMsg(builder, msg_offset)
    pkg_error_offset = PackageError.End(builder)

    builder.Finish(pkg_error_offset)
    return bytes(builder.Output())


def user_error_to_fbs(builder, error):
    msg_offset = builder.CreateString(error)

    UserError.Start(builder)
    UserError.AddMsg(builder, msg_offset)
    user_error_offset = UserError.End(builder)

    builder.Finish(user_error_offset)
    return bytes(builder.Output())


def user_errors_to_fbs_bytes(errors):
    # `initialSize` only affects performance (slightly), not correctness.
    builder = flatbuffers.Builder(initialSize=len(errors))
    error_offsets = [user_error_to_fbs(builder, e) for e in errors]

    UserErrors.StartInnerVector(len(errors))
    for o in reversed(error_offsets):
        builder.PrependUOffsetTRelative(o)
    vector_offset = builder.EndVector(len(errors))

    UserErrors.Start(builder)
    UserErrors.AddInner(builder, vector_offset)
    user_errors_offset = UserErrors.End(builder)

    builder.Finish(user_errors_offset)
    return bytes(builder.Output())


def user_warning_to_fbs(builder, warning):
    msg_offset = builder.CreateString(warning)

    fbs.UserWarning.Start(builder)
    fbs.UserWarning.AddMsg(builder, msg_offset)
    user_warning_offset = fbs.UserWarning.End(builder)

    builder.Finish(user_warning_offset)
    return bytes(builder.Output())


def user_warnings_to_fbs_bytes(warnings):
    # `initialSize` only affects performance (slightly), not correctness.
    builder = flatbuffers.Builder(initialSize=len(warnings))
    warning_offsets = [user_warning_to_fbs(builder, w) for w in warnings]

    UserWarnings.StartInnerVector(len(warnings))
    for o in reversed(warning_offsets):
        builder.PrependUOffsetTRelative(o)
    vector_offset = builder.EndVector(len(warnings))

    UserWarnings.Start(builder)
    UserWarnings.AddInner(builder, vector_offset)
    user_warnings_offset = UserWarnings.End(builder)

    builder.Finish(user_warnings_offset)
    return bytes(builder.Output())

def target_to_fbs(target):
    if target == "py":
        return Target.Python

    if target == "js":
        return Target.JavaScript

    if target == "rs":
        return Target.Rust

    if target == "dyn":
        return Target.Dynamic

    if target == "main":
        return Target.Main

    raise RuntimeError("Unknown target " + str(target))


def metaversion_to_fbs(builder, batch):
    fbs.Metaversion.Start(builder)
    fbs.Metaversion.AddBatch(builder, batch.batch_version)
    fbs.Metaversion.AddMemory(builder, batch.mem_version)
    return fbs.Metaversion.End(builder)


def batch_to_fbs(builder, batch):
    batch_id = builder.CreateString(batch.id)
    metaversion = metaversion_to_fbs(batch)
    fbs.Batch.Start(builder)
    fbs.Batch.AddBatchId(builder, batch_id)
    fbs.Batch.AddMetaversion(builder, metaversion)
    batch_offset = fbs.Batch.End(builder)
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

    fbs.StateInterimSync.StartGroupIdxVector(len(group_idxs))
    for i in reversed(group_idxs):
        builder.PrependUint32(i)
    idxs_vector = builder.EndVector(len(group_idxs))

    fbs.StateInterimSync.StartAgentBatchesVector(len(agent_offsets))
    for o in reversed(agent_offsets):
        builder.PrependUOffsetTRelative(o)
    agent_vector = builder.EndVector(len(agent_offsets))

    fbs.StateInterimSync.StartMessageBatchesVector(len(message_offsets))
    for o in reversed(message_offsets):
        builder.PrependUOffsetTRelative(o)
    message_vector = builder.EndVector(len(message_offsets))

    fbs.StateInterimSync.Start(builder)
    fbs.StateInterimSync.AddGroupIdx(builder, idxs_vector)
    fbs.StateInterimSync.AddAgentBatches(builder, agent_vector)
    fbs.StateInterimSync.AddMessageBatches(builder, message_vector)
    sync_offset = fbs.StateInterimSync.End(builder)
    return sync_offset


def task_to_fbs_bytes(sim_id, changes, pkd_id, task_id, target, task_msg):
    builder = flatbuffers.Builder(initialSize=0)

    sync_offset = interim_sync_to_fbs(builder, changes)
    payload_offset = builder.CreateString(task_msg)

    fbs.TaskMsg.Start(builder)
    fbs.TaskMsg.AddPackageSid(builder, pkd_id)
    fbs.TaskMsg.AddTaskId(builder, task_id)
    fbs.TaskMsg.AddTarget(builder, target_to_fbs(target))
    fbs.TaskMsg.AddMetaversioning(builder, sync_offset)
    fbs.TaskMsg.AddPayload(builder, payload_offset)
    task_msg_offset = fbs.TaskMsg.End(builder)

    builder.Finish(task_msg_offset)
    return bytes(builder.Output())



