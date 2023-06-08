from libc.stdint cimport uint32_t, int32_t, uint64_t, int64_t, intptr_t, uintptr_t
from libc.stdlib cimport malloc, free
from cython cimport view

# TODO: shared.pyx
from shared cimport *

import pyarrow as pa
from pyarrow.cffi import ffi

import numpy as np
cimport numpy as np

import gc

np.import_array()
cdef extern from "numpy/arrayobject.h":
    void PyArray_ENABLEFLAGS(np.ndarray arr, int flags)

def np_force_writable(np.ndarray arr):
    # Not thread-safe -- some external mechanism is necessary to
    # ensure that two threads don't modify the same numpy array
    # at the same time.
    PyArray_ENABLEFLAGS(arr, np.NPY_ARRAY_WRITEABLE)

def load_shared_mem(id):
    assert type(id) is bytes, type(id)
    cdef const unsigned char* id_ptr = id       # *const u8
    cdef uint64_t             id_len = len(id)  # u64

    c_memory = load_shmem(id_ptr, id_len)

    cdef uintptr_t ucm = <uintptr_t> c_memory
    if ucm == 0:
        raise MemoryError("load_shmem failed")

    # https://github.com/apache/arrow/blob/a4eb08d54ee0d4c0d0202fa0a2dfa8af7aad7a05/python/pyarrow/io.pxi
    # Arrow `foreign_buffer` function uses int64_t, so use it here too just in case.
    return int(ucm)

def unload_shared_mem(ucm):
    cdef uintptr_t c_memory = <uintptr_t> ucm
    free_memory(c_memory)

def shared_buf_from_c_memory(c_memory):
    cdef const CMemory *cm = <CMemory*> <uintptr_t> c_memory
    cdef intptr_t address = <intptr_t> cm.ptr
    cdef int64_t size = <int64_t> cm.len
    return pa.foreign_buffer(address, size)

# TODO functionality to unmap shared memory after batch deletion

def _static_meta_from_schema_unchecked(schema):
    c_schema = ffi.new("struct ArrowSchema*")
    ptr_schema = int(ffi.cast("uintptr_t", c_schema))

    gc.collect()
    schema._export_to_c(ptr_schema)
    result = get_static_metadata(<uintptr_t> ptr_schema)
    # Need to explicity free the memory created for the
    # exported struct.
    free_c_arrow_schema(<uintptr_t> ptr_schema)

    return result

def static_meta_from_schema(schema):
    allocated = pa.total_allocated_bytes()
    result = _static_meta_from_schema_unchecked(schema)
    assert allocated == pa.total_allocated_bytes()
    return result

def _free_rust_static_meta(meta):
    free_static_metadata(meta)

def dynamic_meta_from_c_memory(c_memory):
    return get_dynamic_metadata(c_memory)  

def _free_rust_dynamic_meta(meta):
    free_dynamic_metadata(meta)

# `changes` should be a list of dicts with keys 'i_field' and 'data'
def flush(c_memory, dynamic_meta, static_meta, changes):
    length = len(changes)
    cdef uint64_t* indices = <uint64_t*> malloc(length * sizeof(uint64_t))
    cdef uint64_t* arrow_arrays = <uint64_t*> malloc(length * sizeof(uint64_t))
    arrow_c_arrays = [] # For GC
    i = 0
    for change in changes:
        index = change['i_field']
        array = change['data']
        c_array = ffi.new("struct ArrowArray*")
        ptr_array = ffi.cast("uintptr_t", c_array)
        array._export_to_c(int(ptr_array))
        indices[i] = <uint64_t> index
        arrow_arrays[i] = <uint64_t> ptr_array
        arrow_c_arrays.append(c_array)
        i += 1

    cdef Changes changes_obj = [<uint64_t> length, indices, arrow_arrays]
    result = flush_changes(
        <uintptr_t> c_memory, <uintptr_t> dynamic_meta, <uintptr_t> static_meta, <uintptr_t> &changes_obj
    )

    free(indices)
    for i in range(length):
        free_c_arrow_array(<uintptr_t> arrow_arrays[i])
    del arrow_c_arrays
    free(arrow_arrays)

    if result == 2:
        # Generic error
        raise Exception("Error when flushing changes") # See logs
    elif result == 3:
        # Out of Memory
        raise Exception("Out of Memory")

    return result == 1 # Was memory resized?

def load_list_offsets(list_array):
    buffer = list_array.buffers()[1]
    size = buffer.size >> 2
    cdef void* ptr = <void*> <intptr_t> buffer.address
    cdef int32_t[:] view = <int32_t[:size]> ptr
    my_array = np.asarray(view)
    return my_array

def load_neighbors_indices(list_array):
    buffer = list_array.buffers()[4]
    size = int((buffer.size >> 2) / 2)
    if size == 0:
        return [[]]
    cdef void* ptr = <void*> <intptr_t> buffer.address
    my_array = np.asarray( <uint32_t[:size, :2]> ptr)
    return my_array


def load_messages_indices(list_array):
    buffer = list_array.buffers()[4]
    size = int((buffer.size >> 2) / 3)
    if size == 0:
        return [[]]
    cdef void* ptr = <void*> <intptr_t> buffer.address
    my_array = np.asarray( <uint32_t[:size, :3]> ptr)
    return my_array
