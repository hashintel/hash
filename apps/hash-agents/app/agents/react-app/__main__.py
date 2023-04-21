from .io_types import *
from langchain.chat_models import ChatOpenAI
from langchain.callbacks.base import CallbackManager
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler
from langchain.schema import HumanMessage, SystemMessage, AIMessage

systemMessages = [SystemMessage(content="You are ChatGPT, a large language model trained by OpenAI."), 
                SystemMessage(content="Answer as concisely as possible with react code only."),
                SystemMessage(content="Do NOT include an explanation or any text that is not part of the code block you are generating."),
                SystemMessage(content="Return code blocks as ```jsx\n{code...}\n```."),
                SystemMessage(content="Do not include imports or exports in the code."),
                SystemMessage(content="Import all React dependencies from the object React. For example, useState should be React.useState."),
                SystemMessage(content="Import all mui/material components from the object MUI. For example, Button should be MUI.Button."),
                SystemMessage(content="Make sure date and time components are wrapped within a <MUI.LocalizationProvider dateAdapter={MUI.AdapterDateFns} />."),
                SystemMessage(content="Use the 'sx' prop to style MUI elements. For example, a button with a purple background should be <MUI.Button sx={{\"background: \"purple\"}} />."),
                SystemMessage(content="End the code block with the following line: render(<Component />)"), 
                SystemMessage(content="Generate a react component using MUI components.")]

def mapMessages(message):
    if message.type == "AIMessage":
        return AIMessage(content=message.content)
    if message.type == "HumanMessage":
        return HumanMessage(content=message.content)

def main(input: Input) -> Output:
    """
    Main function of the agent
    :param agent_input: Input defined in `io_types.ts`
    :return: Output defined in `io_types.ts`
    """
    chat = ChatOpenAI(model="gpt-3.5-turbo", streaming=True, callback_manager=CallbackManager([StreamingStdOutCallbackHandler()]), verbose=True, temperature=0)
    
    inputMessages = list(map(mapMessages, input.messages))
    resp = chat(systemMessages + inputMessages)
    output = Output(messages=input.messages + [Message(type="AIMessage", content=resp.content)])
    return output

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
    message = Message(type="HumanMessage", content=IN)
    output = main((Input(messages=[message])))
    getLogger().info(f"output: {output.messages}")

    while(True):
        print("Anything else?")
        IN = input("")
        output = main(Input(messages=output.messages + [Message(type="HumanMessage", content=IN)]))
