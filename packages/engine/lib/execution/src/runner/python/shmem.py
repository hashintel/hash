from multiprocessing.shared_memory import SharedMemory
import pyarrow as pa
import ctypes

from multiprocessing import resource_tracker


def remove_shm_from_resource_tracker():
    """Monkey-patch multiprocessing.resource_tracker so SharedMemory won't be tracked
    More details at: https://bugs.python.org/issue38119
    """

    def fix_register(name, rtype):
        if rtype == "shared_memory":
            return
        return resource_tracker._resource_tracker.register(self, name, rtype)
    resource_tracker.register = fix_register

    def fix_unregister(name, rtype):
        if rtype == "shared_memory":
            return
        return resource_tracker._resource_tracker.unregister(self, name, rtype)
    resource_tracker.unregister = fix_unregister

    if "shared_memory" in resource_tracker._CLEANUP_FUNCS:
        del resource_tracker._CLEANUP_FUNCS["shared_memory"]

remove_shm_from_resource_tracker()

def load_shared_memory(batch_id) -> SharedMemory:
    # note: we mustn't created shared memory segments on the Python side,
    # because this is likely to lead to memory leaks
    return SharedMemory(batch_id, False)

def pyarrow_of_shmem(shmem: SharedMemory):
    # pyarrow wants the address of the shared memory segment, so we have to
    # obtain it
    buf = ctypes.c_char * shmem.size
    buf = buf.from_buffer(shmem.buf)
    addr = ctypes.addressof(buf)
    # by setting base=shmem, when the destructor for the foreign buffer is
    # called, so is the destructor for the shared memory
    return pa.foreign_buffer(addr, shmem.size, base=shmem)

