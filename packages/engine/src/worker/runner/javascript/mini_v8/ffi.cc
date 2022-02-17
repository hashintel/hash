#include <mutex>
#include <memory>
#include <libplatform/libplatform.h>
#include <v8.h>

#include <iostream>
#include <cassert>

// The main interface that gets passed across the FFI that corresponds to a
// single `mini_v8::MiniV8` instance.
class Interface {
public:
  v8::Isolate* isolate;
  v8::ArrayBuffer::Allocator* allocator;
  v8::Persistent<v8::Context>* context;
  // Private symbol for storing a `RustCallback` pointer in a `v8::Function`:
  v8::Persistent<v8::Private>* priv_rust_callback;

  // Opens a new handle scope and enters the context.
  template <typename F>
  auto scope(F&& func) const {
    const v8::Isolate::Scope isolate_scope(this->isolate);
    const v8::HandleScope handle_scope(this->isolate);
    const auto context = this->context->Get(this->isolate);
    const v8::Context::Scope context_scope(context);
    return func(this->isolate, context);
  }

  // Opens a new handle scope, enters the context, and opens a try-catch scope.
  template <typename F>
  auto try_catch(F&& func) const {
    const v8::Isolate::Scope isolate_scope(this->isolate);
    const v8::HandleScope handle_scope(this->isolate);
    const auto context = this->context->Get(this->isolate);
    const v8::Context::Scope context_scope(context);
    const v8::TryCatch try_catch(this->isolate);
    return func(this->isolate, context, &try_catch);
  }
};

// The type of value being passed.
enum ValueDescTag {
  Null,
  Undefined,
  Number,
  Boolean,
  Array,
  Function,
  Date,
  Object,
  String
};

// The value's payload.
union ValueDescPayload {
  uint8_t byte;
  double number;
  v8::Persistent<v8::Value>* value_ptr;
};

// An interface for passing values across the FFI between `v8::Local<v8::Value>`
// and `mini_v8::Value`.
struct ValueDesc {
  ValueDescPayload payload;
  uint8_t tag;
};

// An interface for passing possible exceptions across the FFI.
struct TryCatchDesc {
  ValueDesc value_desc;
  uint8_t is_exception;
};

// An interface for passing UTF-8 strings across the FFI.
struct Utf8Value {
  const uint8_t* data;
  int32_t length;
  const v8::String::Utf8Value* src;
};

// Initializes the V8 environment. Must be called before creating a V8 isolate.
// Can be called multiple times.
static void init_v8() {
  static std::unique_ptr<v8::Platform> current_platform = nullptr;
  static std::mutex platform_lock;

  if (current_platform) {
    return;
  }

  platform_lock.lock();

  if (!current_platform) {
    v8::V8::InitializeICU();
    current_platform = v8::platform::NewDefaultPlatform();
    v8::V8::InitializePlatform(current_platform.get());
    v8::V8::Initialize();
  }

  platform_lock.unlock();
}

// Converts a `v8::Local<v8::Value>` to a `ValueDesc`. Must be called while an
// isolate and a context are entered.
static ValueDesc value_to_desc(
  v8::Isolate* const isolate,
  const v8::Local<v8::Context> context,
  const v8::Local<v8::Value> value
) {
  ValueDesc desc { .payload = { .byte = 0 }, .tag = ValueDescTag::Undefined };

  if (value->IsUndefined()) {
    return desc;
  } else if (value->IsNull()) {
    desc.tag = ValueDescTag::Null;
    return desc;
  } else if (value->IsTrue()) {
    desc.tag = ValueDescTag::Boolean;
    desc.payload.byte = 1;
    return desc;
  } else if (value->IsFalse()) {
    desc.tag = ValueDescTag::Boolean;
    return desc;
  } else if (value->IsInt32()) {
    desc.tag = ValueDescTag::Number;
    desc.payload.number = (double)value->Int32Value(context).ToChecked();
    return desc;
  } else if (value->IsNumber()) {
    desc.tag = ValueDescTag::Number;
    desc.payload.number = value->NumberValue(context).ToChecked();
    return desc;
  } else if (value->IsDate()) {
    desc.tag = ValueDescTag::Date;
    desc.payload.number = v8::Local<v8::Date>::Cast(value)->ValueOf();
    return desc;
  } else if (value->IsString()) {
    desc.tag = ValueDescTag::String;
  } else if (value->IsArray()) {
    desc.tag = ValueDescTag::Array;
  } else if (value->IsFunction()) {
    desc.tag = ValueDescTag::Function;
  } else if (value->IsObject()) {
    desc.tag = ValueDescTag::Object;
  } else {
    return desc;
  }

  desc.payload.value_ptr = new v8::Persistent<v8::Value>(isolate, value);
  return desc;
}

// Converts a `ValueDesc` to a `v8::Local<v8::Value>`. Must be called while an
// isolate and a context are entered.
//
// This function frees the `ValueDesc`'s inner `v8::Persistent<v8::Value>`, if
// there is one. To avoid data leaks, functions that consume `ValueDesc`s should
// call this before there is any chance of exiting early.
static v8::Local<v8::Value> desc_to_value(
  v8::Isolate* const isolate,
  const v8::Local<v8::Context> context,
  const ValueDesc desc
) {
  v8::EscapableHandleScope scope(isolate);

  switch (desc.tag) {
    case ValueDescTag::Null:
      return scope.Escape(v8::Null(isolate));
    case ValueDescTag::Number:
      return scope.Escape(v8::Number::New(isolate, desc.payload.number));
    case ValueDescTag::Boolean:
      return scope.Escape(
        desc.payload.byte != 0 ? v8::True(isolate) : v8::False(isolate)
      );
    case ValueDescTag::Date:
      return scope.Escape(
        v8::Date::New(context, desc.payload.number).ToLocalChecked()
      );
    case ValueDescTag::Array:
    case ValueDescTag::Function:
    case ValueDescTag::Object:
    case ValueDescTag::String: {
      auto value_ptr = desc.payload.value_ptr;
      auto local = v8::Local<v8::Value>::New(isolate, *value_ptr);
      value_ptr->Reset();
      delete value_ptr;
      return scope.Escape(local);
    }
    default:
      return scope.Escape(v8::Undefined(isolate));
  }
}

static v8::Local<v8::String> string_new(
  v8::Isolate* const isolate,
  const char* const data,
  const uint32_t length
) {
  v8::EscapableHandleScope scope(isolate);
  return scope.Escape(v8::String::NewFromUtf8(
    isolate,
    data,
    v8::NewStringType::kNormal,
    length
  ).ToLocalChecked());
}

#define EXECUTION_TIMEOUT_MESSAGE "execution timed out"

// Returns an error `TryCatchDesc` with the `v8::TryCatch`'s exception.
static TryCatchDesc try_catch_err(
        v8::Isolate* const isolate,
        const v8::Local<v8::Context> context,
        const v8::TryCatch* const try_catch
) {
  auto maybe_trace = try_catch->StackTrace(context);
  if (maybe_trace.IsEmpty()) {
    std::cout << "CC trace empty" << std::endl;
    auto msg = try_catch->Message()->Get();
    v8::String::Utf8Value u(isolate, msg);
    std::cout << "CC err msg: " << *u << std::endl;
  } else {
    auto trace = maybe_trace.ToLocalChecked();
    v8::String::Utf8Value u(isolate, trace);
    std::cout << "CC trace: " << *u << std::endl;
  }

  auto value = try_catch->Exception();
  if (try_catch->HasTerminated()) {
    value = v8::Exception::Error(string_new(
      isolate,
      EXECUTION_TIMEOUT_MESSAGE,
      sizeof(EXECUTION_TIMEOUT_MESSAGE) - 1
    ));
  }
  return {
    .value_desc = value_to_desc(isolate, context, value),
    .is_exception = 1
  };
}

// Returns an OK `TryCatchDesc` with the given value.
static TryCatchDesc try_catch_ok(
  v8::Isolate* const isolate,
  const v8::Local<v8::Context> context,
  const v8::Local<v8::Value> value
) {
  return {
    .value_desc = value_to_desc(isolate, context, value),
    .is_exception = 0
  };
}

// Returns an OK `TryCatchDesc` with no value attached.
static TryCatchDesc try_catch_ok_noval() {
  return {
    .value_desc = { .payload = { .byte = 0 }, .tag = ValueDescTag::Undefined },
    .is_exception = 0
  };
}

// Returns an OK `TryCatchDesc` with the raw `ValueDesc` attached.
static TryCatchDesc try_catch_ok_val(const ValueDesc desc) {
  return { .value_desc = desc, .is_exception = 0 };
}

typedef TryCatchDesc (*rust_callback_wrapper)(
  const Interface* const interface,
  const void* const callback,
  const ValueDesc this_desc,
  const ValueDesc* const arg_descs,
  const int32_t arg_descs_len
);

typedef void (*rust_callback_drop)(const void* const callback);

static rust_callback_wrapper main_callback_wrapper_func = NULL;
static rust_callback_drop main_callback_drop_func = NULL;

struct RustCallback {
  const void* func;
  uint32_t func_size;
  const Interface* interface;
  v8::Persistent<v8::Value>* value_ptr;
};

static void rust_callback(const v8::FunctionCallbackInfo<v8::Value>& args) {
  const auto isolate = args.GetIsolate();
  const v8::Isolate::Scope isolate_scope(isolate);
  const v8::HandleScope scope(isolate);
  const auto ext = v8::Local<v8::External>::Cast(args.Data());
  const auto callback = reinterpret_cast<const RustCallback*>(ext->Value());
  const auto interface = callback->interface;
  const auto context = interface->context->Get(isolate);
  const v8::Context::Scope context_scope(context);
  const auto arg_descs_len = args.Length();
  const auto this_value = args.This().As<v8::Value>();
  const auto this_desc = value_to_desc(isolate, context, this_value);
  const auto arg_descs = new ValueDesc[arg_descs_len];
  for (int i = 0; i != arg_descs_len; i++) {
    arg_descs[i] = value_to_desc(isolate, context, args[i].As<v8::Value>());
  }

  const TryCatchDesc result = main_callback_wrapper_func(
    interface,
    callback->func,
    this_desc,
    arg_descs,
    arg_descs_len
  );

  delete[] arg_descs;

  const auto is_exception = result.is_exception != 0;
  const auto value = desc_to_value(isolate, context, result.value_desc);
  if (is_exception) {
    args.GetIsolate()->ThrowException(value);
  } else {
    args.GetReturnValue().Set(value);
  }
}

static void callback_drop_inner(
  v8::Isolate* const isolate,
  const RustCallback* const callback
) {
  callback->value_ptr->ClearWeak();
  main_callback_drop_func(callback->func);
  callback->value_ptr->Reset();
  delete callback->value_ptr;
  const auto size = sizeof(RustCallback) + callback->func_size;
  delete callback;
  isolate->AdjustAmountOfExternalAllocatedMemory(-size);
}

static void callback_drop(const v8::WeakCallbackInfo<RustCallback>& data) {
  callback_drop_inner(data.GetIsolate(), data.GetParameter());
}

constexpr uint16_t RUST_CALLBACK_CLASS_ID = 1001;

class PersistentHandleCleaner : public v8::PersistentHandleVisitor {
public:
  const Interface* interface;

  PersistentHandleCleaner(const Interface* const interface) :
    interface(interface) {}
  virtual ~PersistentHandleCleaner() {}

  virtual void VisitPersistentHandle(
    v8::Persistent<v8::Value>* const value,
    const uint16_t class_id
  ) {
    interface->scope([=](auto isolate, auto context) {
      if (class_id != RUST_CALLBACK_CLASS_ID) {
        return;
      }

      const auto priv_rust_callback = v8::Local<v8::Private>::New(
        isolate,
        *interface->priv_rust_callback
      );
      const auto local_value = v8::Local<v8::Value>::New(isolate, *value);
      const auto object = v8::Local<v8::Object>::Cast(local_value);
      const auto ext = v8::Local<v8::External>::Cast(
        object->GetPrivate(context, priv_rust_callback).ToLocalChecked()
      );
      const auto callback = reinterpret_cast<const RustCallback*>(ext->Value());
      callback_drop_inner(isolate, callback);
    });
  }
};

// Initializes the FFI.
extern "C"
void mv8_init(
  const rust_callback_wrapper wrapper_func,
  const rust_callback_drop drop_func
) {
  main_callback_wrapper_func = wrapper_func;
  main_callback_drop_func = drop_func;
}

// Creates a new `Interface`.
extern "C"
const Interface* mv8_interface_new() {
  init_v8();

  const auto interface = new Interface;

  interface->allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();
  v8::Isolate::CreateParams create_params;
  create_params.array_buffer_allocator = interface->allocator;
  interface->isolate = v8::Isolate::New(create_params);

  const v8::Isolate::Scope isolate_scope(interface->isolate);
  const v8::HandleScope handle_scope(interface->isolate);

  interface->priv_rust_callback = new v8::Persistent<v8::Private>(
    interface->isolate,
    v8::Private::New(interface->isolate)
  );

  const auto local_context = v8::Context::New(interface->isolate);
  interface->context = new v8::Persistent<v8::Context>();
  interface->context->Reset(interface->isolate, local_context);

  return interface;
}

// Drops an `Interface`, disposing its isolate.
extern "C"
void mv8_interface_drop(const Interface* const interface) {
  PersistentHandleCleaner cleaner(interface);
  interface->isolate->VisitHandlesWithClassIds(&cleaner);
  interface->priv_rust_callback->Reset();
  delete interface->priv_rust_callback;
  // Caution: `RustCallback`s are now invalidated, before the context itself has
  // been disposed. This is fine because we're assuming that execution has
  // completely halted in this context/isolate (we use one isolate per context
  // and are operating in a single-threaded environment).
  interface->context->Reset();
  delete interface->context;
  interface->isolate->Dispose();
  delete interface->allocator;
  delete interface;
}

/// Returns the interface's context's global object.
extern "C"
v8::Persistent<v8::Value>* mv8_interface_global(
  const Interface* const interface
) {
  return interface->scope([](auto isolate, auto context) {
      return new v8::Persistent<v8::Value>(isolate, context->Global());
  });
}

// Evaluates a chunk of JavaScript.
extern "C"
TryCatchDesc mv8_interface_eval(
  const Interface* const interface,
  const char* const source_data,
  const uint32_t source_length,
  const char* const name_data,
  const uint32_t name_length,
  const int32_t line_offset,
  const int32_t column_offset
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto source = string_new(isolate, source_data, source_length);

    std::unique_ptr<v8::ScriptOrigin> origin(nullptr);
    if (name_data) {
      const auto name = string_new(isolate, name_data, name_length);
      const auto line = v8::Integer::New(isolate, line_offset);
      const auto column = v8::Integer::New(isolate, column_offset);
      origin = std::make_unique<v8::ScriptOrigin>(name, line, column);
    }

    auto script = v8::Script::Compile(context, source, &*origin);
    if (!script.IsEmpty()) {
      auto maybe_value = script.ToLocalChecked()->Run(context);
      if (!maybe_value.IsEmpty()) {
        return try_catch_ok(isolate, context, maybe_value.ToLocalChecked());
      }
    }

    return try_catch_err(isolate, context, try_catch);
  });
}

extern "C"
void mv8_interface_terminate_execution(const Interface* const interface) {
  interface->isolate->TerminateExecution();
}

/// Sets user data at the given slot on the interface's isolate.
extern "C"
void mv8_interface_set_data(
  const Interface* const interface,
  const uint32_t slot,
  void* const data
) {
  interface->isolate->SetData(slot, data);
}

/// Gets the user data at the given slot on the interface's isolate.
extern "C"
const void* mv8_interface_get_data(
  const Interface* const interface,
  const uint32_t slot
) {
  return interface->isolate->GetData(slot);
}

// Creates a new reference to a value pointer.
extern "C"
v8::Persistent<v8::Value>* mv8_value_ptr_clone(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const value_ptr
) {
  return new v8::Persistent<v8::Value>(interface->isolate, *value_ptr);
}

// Destroys a reference to a value pointer.
extern "C"
void mv8_value_ptr_drop(v8::Persistent<v8::Value>* const value_ptr) {
  value_ptr->Reset();
  delete value_ptr;
}

// Creates a new string from raw bytes.
extern "C"
v8::Persistent<v8::Value>* mv8_string_new(
  const Interface* const interface,
  const char* const data,
  const uint32_t length
) {
  return interface->scope([=](auto isolate, auto) {
    const auto string = string_new(isolate, data, length);
    return new v8::Persistent<v8::Value>(isolate, string);
  });
}

// Creates a new string from raw bytes.
extern "C"
Utf8Value mv8_string_to_utf8_value(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const value
) {
  return interface->scope([=](auto isolate, auto) {
    Utf8Value result;
    result.src = new v8::String::Utf8Value(isolate, value->Get(isolate));
    result.data = reinterpret_cast<const uint8_t*>(**result.src);
    result.length = result.src->length();
    return result;
  });
}

// Destroys a `Utf8Value`.
extern "C"
void mv8_utf8_value_drop(const Utf8Value value) {
  delete value.src;
}

// Creates a new, empty array.
extern "C"
v8::Persistent<v8::Value>* mv8_array_new(
  const Interface* const interface
) {
  return interface->scope([=](auto isolate, auto) {
    return new v8::Persistent<v8::Value>(isolate, v8::Array::New(isolate, 0));
  });
}

// Fetches an array's value by index.
extern "C"
TryCatchDesc mv8_array_get(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const array,
  const uint32_t index
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto local_object = v8::Local<v8::Object>::Cast(array->Get(isolate));
    auto maybe_value = local_object->Get(context, index);
    if (maybe_value.IsEmpty()) {
      return try_catch_err(isolate, context, try_catch);
    }
    return try_catch_ok(isolate, context, maybe_value.ToLocalChecked());
  });
}

// Sets an array's value by index.
extern "C"
TryCatchDesc mv8_array_set(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const array,
  const uint32_t index,
  const ValueDesc value_desc
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto local_object = v8::Local<v8::Object>::Cast(array->Get(isolate));
    const auto value = desc_to_value(isolate, context, value_desc);
    local_object->Set(context, index, value);
    if (try_catch->HasCaught()) {
      return try_catch_err(isolate, context, try_catch);
    }
    return try_catch_ok_noval();
  });
}

// Returns the length of the given array.
extern "C"
uint32_t mv8_array_len(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const array
) {
  return interface->scope([=](auto isolate, auto) {
    return v8::Local<v8::Array>::Cast(array->Get(isolate))->Length();
  });
}

// Creates a new object.
extern "C"
v8::Persistent<v8::Value>* mv8_object_new(
  const Interface* const interface
) {
  return interface->scope([=](auto isolate, auto) {
    return new v8::Persistent<v8::Value>(isolate, v8::Object::New(isolate));
  });
}

// Fetches an object's value by key.
extern "C"
TryCatchDesc mv8_object_get(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const object,
  const ValueDesc key_desc
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto local_object = v8::Local<v8::Object>::Cast(object->Get(isolate));
    const auto key = desc_to_value(isolate, context, key_desc);
    auto maybe_value = local_object->Get(context, key);
    if (maybe_value.IsEmpty()) {
      return try_catch_err(isolate, context, try_catch);
    }
    return try_catch_ok(isolate, context, maybe_value.ToLocalChecked());
  });
}

// Sets an object's property.
extern "C"
TryCatchDesc mv8_object_set(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const object,
  const ValueDesc key_desc,
  const ValueDesc value_desc
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto local_object = v8::Local<v8::Object>::Cast(object->Get(isolate));
    const auto key = desc_to_value(isolate, context, key_desc);
    const auto value = desc_to_value(isolate, context, value_desc);
    local_object->Set(context, key, value);
    if (try_catch->HasCaught()) {
      return try_catch_err(isolate, context, try_catch);
    }
    return try_catch_ok_noval();
  });
}

// Deletes an object's property.
extern "C"
TryCatchDesc mv8_object_remove(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const object,
  const ValueDesc key_desc
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto local_object = v8::Local<v8::Object>::Cast(object->Get(isolate));
    const auto key = desc_to_value(isolate, context, key_desc);
    local_object->Delete(context, key);
    if (try_catch->HasCaught()) {
      return try_catch_err(isolate, context, try_catch);
    }
    return try_catch_ok_noval();
  });
}

// Returns whether or not an object has a property with the given key.
extern "C"
TryCatchDesc mv8_object_has(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const object,
  const ValueDesc key_desc
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto local_object = v8::Local<v8::Object>::Cast(object->Get(isolate));
    const auto key = desc_to_value(isolate, context, key_desc);
    auto has = local_object->Has(context, key);
    if (try_catch->HasCaught()) {
      return try_catch_err(isolate, context, try_catch);
    }
    return try_catch_ok_val({
      .payload = { .byte = static_cast<uint8_t>(has.ToChecked() ? 1 : 0) },
      .tag = ValueDescTag::Boolean
    });
  });
}

// Returns an array of the object's property keys.
extern "C"
TryCatchDesc mv8_object_keys(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const object,
  const uint8_t include_inherited
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto local_object = v8::Local<v8::Object>::Cast(object->Get(isolate));
    auto maybe_keys = include_inherited != 0 ?
      local_object->GetPropertyNames(context) :
      local_object->GetOwnPropertyNames(context);
    if (try_catch->HasCaught()) {
      return try_catch_err(isolate, context, try_catch);
    }
    const auto keys = maybe_keys.ToLocalChecked();
    ValueDesc result;
    result.payload.value_ptr = new v8::Persistent<v8::Value>(isolate, keys);
    result.tag = ValueDescTag::Array;
    return try_catch_ok_val(result);
  });
}

// Coerces the given value into a boolean.
extern "C"
uint8_t mv8_coerce_boolean(
  const Interface* const interface,
  const ValueDesc desc
) {
  return interface->scope([=](auto isolate, auto context) {
    const auto value = desc_to_value(isolate, context, desc);
    return static_cast<uint8_t>(value->BooleanValue(isolate) ? 1 : 0);
  });
}

// Coerces the given value into a number.
extern "C"
TryCatchDesc mv8_coerce_number(
  const Interface* const interface,
  const ValueDesc desc
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto value = desc_to_value(isolate, context, desc);
    auto maybe_number = value->ToNumber(context);
    if (try_catch->HasCaught()) {
      return try_catch_err(isolate, context, try_catch);
    }
    return try_catch_ok_val({
      .payload = { .number = maybe_number.ToLocalChecked()->Value() },
      .tag = ValueDescTag::Number
    });
  });
}

// Coerces the given value into a string.
extern "C"
TryCatchDesc mv8_coerce_string(
  const Interface* const interface,
  const ValueDesc desc
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto value = desc_to_value(isolate, context, desc);
    auto maybe_string = value->ToString(context);
    if (try_catch->HasCaught()) {
      return try_catch_err(isolate, context, try_catch);
    }
    const auto string = maybe_string.ToLocalChecked();
    ValueDesc result;
    result.payload.value_ptr = new v8::Persistent<v8::Value>(isolate, string);
    result.tag = ValueDescTag::String;
    return try_catch_ok_val(result);
  });
}

// Creates a function from a Rust callback.
extern "C"
v8::Persistent<v8::Value>* mv8_function_create(
  const Interface* const interface,
  const void* const func,
  const uint32_t func_size
) {
  return interface->scope([=](auto isolate, auto context) {
    const auto callback = new RustCallback;
    callback->interface = interface;
    callback->func = func;
    callback->func_size = func_size;

    const auto ext = v8::External::New(isolate, callback);
    const auto temp = v8::FunctionTemplate::New(
      isolate,
      rust_callback,
      ext
    );
    const auto local_func = temp->GetFunction(context).ToLocalChecked();
    const auto func_object = v8::Local<v8::Object>::Cast(local_func);
    const auto priv_rust_callback = v8::Local<v8::Private>::New(
      isolate,
      *interface->priv_rust_callback
    );
    func_object->SetPrivate(context, priv_rust_callback, ext);
    const auto func_value = new v8::Persistent<v8::Value>(
      isolate,
      local_func
    );
    const auto func_value_weak = new v8::Persistent<v8::Value>(
      isolate,
      *func_value
    );
    callback->value_ptr = func_value_weak;
    func_value_weak->SetWrapperClassId(RUST_CALLBACK_CLASS_ID);
    func_value_weak->SetWeak(
      callback,
      callback_drop,
      v8::WeakCallbackType::kParameter
    );

    const auto size = sizeof(RustCallback) + func_size;
    isolate->AdjustAmountOfExternalAllocatedMemory(size);
    return func_value;
  });
}

// Calls a function.
extern "C"
TryCatchDesc mv8_function_call(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const func_value,
  const ValueDesc this_desc,
  const ValueDesc* const arg_descs,
  const int32_t arg_descs_len
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto value = v8::Local<v8::Value>::New(isolate, *func_value);
    const auto func = v8::Local<v8::Function>::Cast(value);
    const auto this_value = desc_to_value(isolate, context, this_desc);
    const auto args = new v8::Local<v8::Value>[arg_descs_len];
    const auto args_len = static_cast<int>(arg_descs_len);
    for (int i = 0; i != args_len; i++) {
      args[i] = desc_to_value(isolate, context, arg_descs[i]);
    }

    auto maybe_value = func->Call(context, this_value, args_len, args);
    delete[] args;
    if (maybe_value.IsEmpty()) {
      return try_catch_err(isolate, context, try_catch);
    }
    return try_catch_ok(isolate, context, maybe_value.ToLocalChecked());
  });
}

// Calls a function as a constructor.
extern "C"
TryCatchDesc mv8_function_call_new(
  const Interface* const interface,
  const v8::Persistent<v8::Value>* const func_value,
  const ValueDesc* const arg_descs,
  const int32_t arg_descs_len
) {
  return interface->try_catch([=](auto isolate, auto context, auto try_catch) {
    const auto value = v8::Local<v8::Value>::New(isolate, *func_value);
    const auto func = v8::Local<v8::Function>::Cast(value);
    const auto args = new v8::Local<v8::Value>[arg_descs_len];
    const auto args_len = static_cast<int>(arg_descs_len);
    for (int i = 0; i != args_len; i++) {
      args[i] = desc_to_value(isolate, context, arg_descs[i]);
    }

    auto maybe_object = func->NewInstance(context, args_len, args);
    delete[] args;
    if (maybe_object.IsEmpty()) {
      return try_catch_err(isolate, context, try_catch);
    }
    const auto object = maybe_object.ToLocalChecked();
    ValueDesc result;
    result.payload.value_ptr = new v8::Persistent<v8::Value>(isolate, object);
    result.tag = ValueDescTag::Object;
    return try_catch_ok_val(result);
  });
}

///////////////////////////////////////////////////////////////////
// Added arraybuffer and Arrow array data node conversion.

v8::Local<v8::ArrayBuffer> create_local_arraybuffer(
  v8::Isolate *const isolate,
  unsigned char* mem,
  size_t n_bytes
) {
  // `mem` memory will not be freed by the ArrayBuffer.
  // The ArrayBuffer must not be accessed in any way by
  // MiniV8 or Javascript after `mem` is freed.
  auto arraybuffer = v8::ArrayBuffer::New(isolate, (void*)mem, n_bytes);
  // TODO: Newer versions of V8 don't allow creating
  //       a new backing store with the same location
  //       as an existing one, even if the underlying
  //       shared memory segment's size changed.
  //       (node.js `Buffer` is also implemented using
  //       V8's ArrayBuffer, so it has the same problem.)
  //       We'll need to cache backing stores somehow
  //       (or find some other workaround).
  assert(arraybuffer->IsExternal());
  return arraybuffer;
}

extern "C"
v8::Persistent<v8::Value>* mv8_arraybuffer_new(
  const Interface *const interface,
  unsigned char *mem,
  size_t n_bytes
) {
  return interface->scope([=](auto isolate, auto) {
    auto obj = create_local_arraybuffer(isolate, mem, n_bytes);
    return new v8::Persistent<v8::Value>(isolate, obj);
  });
}

struct DataFFI {
    size_t len;
    size_t null_count;
    size_t n_buffers;
    const unsigned char *buffer_ptrs[2]; // Up to two valid pointers to buffers
    size_t buffer_capacities[2];
    const unsigned char *null_bits_ptr;
    size_t null_bits_capacity;
};

extern "C"
DataFFI mv8_data_node_from_js(
  const Interface *const interface,
  ValueDesc data_desc
) {
  return interface->scope([=](auto isolate, auto context) {
    const auto value = desc_to_value(isolate, context, data_desc);
    const auto obj = v8::Local<v8::Object>::Cast(value);
    DataFFI data;
    memset( &data, 0, sizeof( DataFFI ) );

    const auto len_key = v8::String::NewFromUtf8(
      isolate,
      "len",
      v8::NewStringType::kInternalized,
      -1
    ).ToLocalChecked();
    const auto len_value = obj->Get(context, len_key).ToLocalChecked();
    const auto len_num = v8::Local<v8::Number>::Cast(len_value);
    data.len = (size_t)len_num->Value();

    const auto null_count_key = v8::String::NewFromUtf8(
      isolate,
      "null_count",
      v8::NewStringType::kInternalized,
      -1
    ).ToLocalChecked();
    const auto null_count_value = obj->Get(context, null_count_key).ToLocalChecked();
    const auto null_count_num = v8::Local<v8::Number>::Cast(null_count_value);
    data.null_count = (size_t)null_count_num->Value();

    const auto buffers_key = v8::String::NewFromUtf8(
      isolate,
      "buffers",
      v8::NewStringType::kInternalized,
      -1
    ).ToLocalChecked();
    const auto buffers_value = obj->Get(context, buffers_key).ToLocalChecked();
    const auto buffers = v8::Local<v8::Array>::Cast(buffers_value);
    assert(buffers->Length() <= 2); // TODO: Return error on failure instead of crashing.
    data.n_buffers = (size_t)buffers->Length(); // TODO: uint32_t instead of size_t.

    // TODO: Add checks for the casts as right now they can silently fail, if possible just assert on the type
    for (size_t i = 0; i < data.n_buffers; ++i) {
      const auto buffer_value = buffers->Get(context, (uint32_t)i).ToLocalChecked();
      const auto buffer = v8::Local<v8::ArrayBuffer>::Cast(buffer_value);
      const auto contents = buffer->GetContents();
      data.buffer_ptrs[i] = (const unsigned char*)contents.Data();
      data.buffer_capacities[i] = contents.ByteLength();
    }

    const auto null_bits_key = v8::String::NewFromUtf8(
      isolate,
      "null_bits",
      v8::NewStringType::kInternalized,
      -1
    ).ToLocalChecked();
    const auto null_bits_value = obj->Get(context, null_bits_key).ToLocalChecked();
    const auto null_bits = v8::Local<v8::ArrayBuffer>::Cast(null_bits_value);
    const auto contents = null_bits->GetContents();
    data.null_bits_ptr = (const unsigned char*)contents.Data();
    data.null_bits_capacity = contents.ByteLength();
    return data;
  });
}
