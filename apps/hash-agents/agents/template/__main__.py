
def main(query):
    return f"hello from template, I'm responding to `{query}`"


if __name__ == 'HASH':
    global IN, OUT
    OUT = main(IN)


if __name__ == '__main__':
    print(main("Hello from main"))
