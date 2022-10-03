from libc.stdint cimport uint64_t, int64_t, uintptr_t

cdef extern uintptr_t get_static_metadata(uintptr_t schema)
cdef extern void free_static_metadata(uintptr_t ptr)

cdef extern void free_c_arrow_schema(uintptr_t schema)
cdef extern void free_c_arrow_array(uintptr_t array)
cdef extern void free_memory(uintptr_t c_memory)

cdef extern uintptr_t get_dynamic_metadata(uintptr_t c_memory)
cdef extern void free_dynamic_metadata(uintptr_t dynamic_meta)

ctypedef struct CMemory:       # From 'lib.rs'.
    const unsigned char* ptr,  # *const u8
    int64_t len,               # i64
    uintptr_t rust_memory_obj  # pointer to `Memory` object

cdef extern CMemory* load_shmem(const unsigned char *id, uint64_t len)

ctypedef struct Changes:
    uint64_t len,
    const uint64_t* indices,
    const uint64_t* arrow_arrays

cdef extern uint64_t flush_changes(uintptr_t c_memory, uintptr_t dynamic_meta, uintptr_t static_meta, uintptr_t changes)
