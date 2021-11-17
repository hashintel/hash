import logging
from json import loads as json_loads

# Inbound
import flatbuffers

from fbs.Init import Init
from fbs.RunnerInboundMsg import RunnerInboundMsg
from fbs.RunnerInboundMsgPayload import RunnerInboundMsgPayload
from fbs.TaskMsg import TaskMsg
from fbs.CancelTask import CancelTask
from fbs.StateSync import StateSync
from fbs.StateSnapshotSync import StateSnapshotSync
from fbs.ContextBatchSync import ContextBatchSync
from fbs.StateInterimSync import StateInterimSync
from fbs.TerminateSimulationRun import TerminateSimulationRun
from fbs.KillRunner import KillRunner
from fbs.NewSimulationRun import NewSimulationRun
from fbs.PackageType import PackageType

PACKAGE_TYPE = PackageType
MESSAGE_TYPE = RunnerInboundMsgPayload

# Outbound
from fbs import RunnerError
from fbs import PackageError
from fbs import UserError
from fbs import UserErrors
from fbs import UserWarnings


def assert_eq(a, b):
    assert a == b, (a, b)


class PyInit:
    def __init__(self, fbs_bytes):
        msg = Init.GetRootAs(fbs_bytes, 0)
        self.shared_ctx = PySharedContext(msg.SharedContext())

        config = msg.PackageConfig()
        self.package_config = [
            PyPackage(config.Packages(i)) for i in range(config.PackagesLength())
        ]


class PySharedContext:
    def __init__(self, fb):
        for batch_msg in datasets:
            shmem = load_shared_mem(batch_msg["id"])
            buffer = shared_buf_from_c_memory(shmem)
            name, data, did_parse = parse_dataset(buffer)
        self.__datasets = [
            json_loads(fb.Datasets(i)) for i in range(fb.DatasetsLength())
        ]

    def data(self):
        return self.__datasets


class PyPackage:
    def __init__(self, fb):
        self.type = fb.Type()
        self.name = fb.Name()
        self.sid = fb.Sid()
        self.payload = json_loads(fb.InitPayload().Inner())


class PyBatchSync:
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
    def __init__(self, sim_sid, fb):
        self.sim_sid = sim_sid
        self.pkg_sid = fb.PackageSid()
        self.task_id = fb.TaskId()
        self.sync = PyStateInterimSync(fb.Metaversioning())
        self.payload = json_loads(fb.Payload().Inner())


class PyStateInterimSync:
    def __init__(self, sim_sid, fb):
        self.sim_sid = sim_sid

        n_batches = fb.GroupIdxLength()
        self.group_idxs = [fb.GroupIdx(i) for i in range(n_batches)]

        assert_eq(fb.AgentPoolMetaversionsLength(), n_batches)
        self.agent_batches = [
            PyMetaversion(fb.AgentPoolMetaversions(i)) for i in range(n_batches)
        ]

        assert_eq(fb.MessagePoolMetaversionsLength(), n_batches)
        self.msg_batches = [
            PyMetaversion(fb.messagePoolMetaversions(i)) for i in range(n_batches)
        ]


class PyContextBatchSync:
    def __init__(self, sim_sid, fb):
        self.sim_sid = sim_sid
        self.batch = PyBatchSync(fb.ContextBatch())
        self.cur_step = fb.CurrentStep()


class Messenger:
    def __init__(self, experiment_id, worker_index):
        prefix = 'ipc://' + experiment_id

        # For sending messages to the Rust process,
        # e.g. requesting init message and sending
        # task results
        send_address = prefix + '-frompy' + str(worker_index)
        self.to_rust = Pair0(dial=send_address)
        # logging.debug("Opened socket to Rust")

        # For recieving messages from the Rust process
        recv_address = prefix + '-topy' + str(worker_index)
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
        fbs_bytes = self.to_rust.recv()
        logging.debug("Received init message")

        self.orch_socket.send(b'\x00')  # Arbitrary message
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
            return PyCancelTask(sim_sid, CancelTask().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.StateSync:
            return PyStateSync(sim_sid, StateSync().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.StateSnapshotSync:
            return PyStateSnapshotSync(sim_sid, StateSnapshotSync().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.ContextBatchSync:
            return PyContextBatchSync(sim_sid, ContextBatchSync().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.StateInterimSync:
            return PyStateInterimSync(sim_sid, StateInterimSync().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.TerminateSimulationRun:
            return PyTerminateSim(sim_sid, TerminateSimulationRun().Init(p.Bytes, p.Pos)), t

        if t == MESSAGE_TYPE.KillRunner:
            return None, t  # KillRunner payload is empty.

        if t == MESSAGE_TYPE.NewSimulationRun:
            return PyStartSim(sim_sid, NewSimulationRun().Init(p.Bytes, p.Pos)), t

        raise RuntimeError(
            "Unknown message type {} from sim {}".format(t, sim_sid)
        )

    def send_task_continuation(self, continuation):
        # TODO: Combine target, user warnings and user errors
        #       into single message.
        self.send_user_warnings(continuation.get("warnings", []))
        self.send_user_errors(continuation.get("errors"), [])
        target = continuation.get("target", "main")

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

    UserWarning.Start(builder)
    UserWarning.AddMsg(builder, msg_offset)
    user_warning_offset = UserWarning.End(builder)

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
