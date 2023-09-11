# type: ignore
"""Script to generate the blocking implementation of the client."""

import ast
from pathlib import Path

ROOT = Path(__file__).parent.parent

concurrent_contents = (ROOT / "graph_sdk" / "client" / "concurrent.py").read_text()
blocking_ast = ast.parse(concurrent_contents, "concurrent.py", type_comments=True)

# The transformation that we want to do is pretty simple:
# * copy over all contents, pick the HASHClient class
# * add imports to utils and the concurrent client
# * go over each method that is sync, call the inner client instead
# * go over each async method, wrap it in a sync method

# generate a new top level type comment for the blocking client
blocking_ast_doc: ast.Expr = blocking_ast.body[0]

blocking_ast_doc.value = ast.Constant(value="""Blocking API for the Graph SDK.

This is just a thin wrapper around the async API.

(Usually, one could achieve this by simply wrapping the async API automatically,
the problem with that approach however is that users loose the ability to look
at the source code)
""")

# add imports to utils and the concurrent client
blocking_ast.body.insert(
    1,
    ast.ImportFrom(
        module="graph_sdk.utils",
        names=[ast.alias(name="async_to_sync")],
    ),
)
blocking_ast.body.insert(
    1,
    ast.ImportFrom(
        module="graph_sdk.client.concurrent",
        names=[ast.alias(name="HASHClient", asname="ConcurrentHASHClient")],
    ),
)

# find the HASHClient class
client_ast: ast.ClassDef = next(
    statement for statement in blocking_ast.body if isinstance(statement, ast.ClassDef)
)

# remove all field annotations (AnnAssign)
client_ast.body = [
    statement
    for statement in client_ast.body
    if not isinstance(statement, ast.AnnAssign)
]


# add a new field annotation for the inner client
client_ast.body.insert(
    1,
    ast.AnnAssign(
        target=ast.Name(id="inner", ctx=ast.Store()),
        annotation=ast.Name(id="ConcurrentHASHClient", ctx=ast.Load()),
        simple=1,
    ),
)

# change the __init__ method to just init the inner client
client_init = next(
    statement
    for statement in client_ast.body
    if isinstance(statement, ast.FunctionDef) and statement.name == "__init__"
)

client_init_args = client_init.args

client_init.body = [
    client_init.body[0],
    ast.Assign(
        targets=[
            ast.Attribute(
                value=ast.Name(id="self", ctx=ast.Load()),
                attr="inner",
                ctx=ast.Store(),
            ),
        ],
        value=ast.Call(
            func=ast.Name(id="ConcurrentHASHClient", ctx=ast.Load()),
            args=[
                ast.Name(arg.arg) for arg in client_init_args.args if arg.arg != "self"
            ],
            keywords=[],
        ),
    ),
]


def call_inner(function_def: ast.FunctionDef) -> ast.Call:
    """Call the inner client method."""
    args = function_def.args

    return ast.Call(
        func=(
            ast.Attribute(
                value=ast.Attribute(
                    value=ast.Name(id="self", ctx=ast.Load()),
                    attr="inner",
                    ctx=ast.Load(),
                ),
                attr=function_def.name,
                ctx=ast.Load(),
            )
        ),
        args=[
            ast.Name(arg.arg, ctx=ast.Load()) for arg in args.args if arg.arg != "self"
        ],
        keywords=[
            ast.keyword(arg=keyword.arg, value=ast.Name(keyword.arg, ctx=ast.Load()))
            for keyword in (args.kwarg or [])
        ],
    )


# # go over each method that is sync, call the inner client instead
for method in client_ast.body:
    if not isinstance(method, ast.FunctionDef):
        continue

    if method.name in ("__init__", "__doc__", "actor"):
        continue

    method_args = method.args

    method.body = [
        method.body[0],
        ast.Return(value=call_inner(method)),
    ]

# go over each async method, wrap it in the async_to_sync method and return it
for method in client_ast.body:
    if not isinstance(method, ast.AsyncFunctionDef):
        continue

    method_args = method.args
    method_name = method.name
    method_doc = method.body[0]
    method_returns = method.returns

    client_ast.body.append(
        ast.FunctionDef(
            name=method_name,
            args=method_args,
            body=[
                method_doc,
                ast.Return(
                    value=ast.Call(
                        func=ast.Name(id="async_to_sync", ctx=ast.Load()),
                        args=[
                            ast.Call(
                                func=ast.Attribute(
                                    value=ast.Attribute(
                                        value=ast.Name(id="self", ctx=ast.Load()),
                                        attr="inner",
                                        ctx=ast.Load(),
                                    ),
                                    attr=method.name,
                                    ctx=ast.Load(),
                                ),
                                args=[
                                    ast.Name(arg.arg, ctx=ast.Load())
                                    for arg in method_args.args
                                    if arg.arg != "self"
                                ],
                                keywords=[
                                    ast.keyword(
                                        arg=keyword.arg,
                                        value=ast.Name(keyword.arg, ctx=ast.Load()),
                                    )
                                    for keyword in (
                                        (method_args.kwarg or [])
                                        + (method_args.kwonlyargs or [])
                                    )
                                ],
                            ),
                        ],
                        keywords=[],
                    ),
                ),
            ],
            returns=method_returns,
            decorator_list=[],
        ),
    )

# remove all async methods
client_ast.body = [
    statement
    for statement in client_ast.body
    if not isinstance(statement, ast.AsyncFunctionDef)
]

# remove with_actor and assert_not_none
blocking_ast.body = [
    statement
    for statement in blocking_ast.body
    if not (
        isinstance(statement, ast.FunctionDef)
        and statement.name in ("with_actor", "assert_not_none")
    )
]

output = ast.unparse(ast.fix_missing_locations(blocking_ast))
(ROOT / "graph_sdk" / "client" / "blocking.py").write_text(f"""
# =========================================
# THIS FILE IS GENERATED, DO NOT CHANGE IT!
# =========================================

{output}""")
