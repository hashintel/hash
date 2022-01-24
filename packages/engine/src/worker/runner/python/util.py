import traceback


# `exc_info` is whatever tuple of info `sys.exc_info()` returned about
# an exception. Calling `sys.exc_info()` inside `format_exc_info`
# wouldn't work, because `sys.exc_info` can only return info about an
# exception that has just occurred.
def format_exc_info(exc_info):
    return str(traceback.format_exception(*exc_info))
