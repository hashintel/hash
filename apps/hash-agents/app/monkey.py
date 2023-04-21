def monkey_patch():
    try:
        from gevent import monkey

        monkey.patch_all()
    except ImportError:
        pass
