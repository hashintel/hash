"""
Random utility functions.
"""

import random as rand


def set_seed(s: str):
    """ Set the random seed for Python's random library """
    rand.seed(s)


def random():
    """ Returns a random number between 0 and 1 """
    return rand.random()
