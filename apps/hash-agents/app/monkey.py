def monkey_patch() -> None:
    try:
        from gevent import monkey

        monkey.patch_all()
    except ImportError:
        pass
