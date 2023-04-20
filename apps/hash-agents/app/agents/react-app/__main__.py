from .io_types import *
from langchain.chat_models import ChatOpenAI
from langchain.callbacks.base import CallbackManager
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler
from langchain.schema import HumanMessage, SystemMessage

def main(input: Input) -> Output:
    """
    Main function of the agent
    :param agent_input: Input defined in `io_types.ts`
    :return: Output defined in `io_types.ts`
    """
    chat = ChatOpenAI(model="gpt-3.5-turbo", streaming=True, callback_manager=CallbackManager([StreamingStdOutCallbackHandler()]), verbose=True, temperature=0)
    resp = chat([SystemMessage(content="You are ChatGPT, a large language model trained by OpenAI."), 
                SystemMessage(content="Answer as concisely as possible with react code only."),
                SystemMessage(content="Do NOT include an explanation or any text that is not part of the code block you are generating."),
                SystemMessage(content="Return code blocks as ```{code:jsx}{code...}```."),
                SystemMessage(content="Do not include imports or exports in the code."),
                SystemMessage(content="Import all React dependencies from the object React. For example, useState should be React.useState."),
                SystemMessage(content="Import all MUI components from the object MUI. For example, Button should be MUI.Button."),
                SystemMessage(content="End the code block with the following line: render(<Component />)"), 
                SystemMessage(content="Generate a react component using MUI components."), 
                HumanMessage(content=input.user_prompt)])
    return Output(result=resp.content)

if __name__ == "HASH":
    """This is used when running the agent from the server or the agent orchestrator"""

    # `IN` and `OUT` are defined by the agent orchestrator
    global IN, OUT
    OUT = main(IN)

if __name__ == "__main__":
    """This is used when running the agent from the command line"""
    from ... import setup
    from logging import getLogger

    setup()
    print("Describe your application:")
    IN = input("")
    output = main((Input(user_prompt=IN)))
    getLogger().info(f"output: {output.result}")
