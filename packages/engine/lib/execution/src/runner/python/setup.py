import fnmatch
import os
import sys

from distutils.core import setup
from distutils.extension import Extension
from Cython.Build import cythonize

import numpy

script_path = sys.argv[3]
sys.argv.remove(script_path)


# TODO: Use `Pathlib` instead of `os`
#   see https://app.asana.com/0/1199548034582004/1202011714603651/f
def find_directory(patterns, path):
    result = []
    for root, _dirs, files in os.walk(path):
        for name in files:
            for pattern in patterns:
                if fnmatch.fnmatch(name, pattern):
                    file = os.path.join(root, name)
                    file = os.path.abspath(file)
                    result.append(os.path.dirname(file))
    return result


def last_modified(path):
    return os.path.getmtime(path)

library_dirs = sorted(
    find_directory(["libmemory.so", "libmemory.dylib"], f"{script_path}/../../../../../"),
    key=last_modified,
    reverse=True,
)

# Convert path to Python module prefix.
if script_path == ".":
    wrappers_import = "wrappers"
else:
    script_path_as_import = script_path.replace("./", "").replace("/", ".")
    wrappers_import = f"{script_path_as_import}.wrappers"

setup(
    ext_modules=cythonize(
        [
            Extension(
                wrappers_import,
                [script_path + "/wrappers.pyx"],
                include_dirs=[numpy.get_include()],
                libraries=["memory"],
                library_dirs=library_dirs,
            )
        ]
    )
)
