import sys
from distutils.core import setup
from distutils.extension import Extension
from Cython.Build import cythonize
import numpy

script_path = sys.argv[3]
sys.argv.remove(script_path)

# Convert path to Python module prefix.
if script_path == '.':
    prefix = ''
else:
    prefix = script_path.replace("./", "").replace("/", ".") + "."

setup(
    ext_modules = cythonize([
        Extension(prefix + "wrappers",
                  [script_path + "/wrappers.pyx"],
                  include_dirs=[numpy.get_include()],
                  libraries=["hash_prime"],
                  library_dirs = [ # Process directory should be cloud repo root.
                      "./target/release", # Prioritize release over debug.
                      "./",
                      "./target/debug",
                      "./target/x86_64-apple-darwin/debug"
                  ]
                  )
    ])
)
