"""
Random utility functions.
"""

import random as rand


def set_seed(s: str):
    rand.seed(s)


def random():
    return rand.random()
