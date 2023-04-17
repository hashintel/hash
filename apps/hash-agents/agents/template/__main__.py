from langchain import OpenAI


def main(query):
    return f"hello from template, I'm responding to `{query}`"


if __name__ == 'agent_invocation':
    global IN, OUT
    OUT = main(IN)


if __name__ == '__main__':
    print(main("Hello from main"))
