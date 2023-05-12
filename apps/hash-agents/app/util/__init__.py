def wrap_system_message(content):
    return {
        "role": "system",
        "content": content,
    }


def wrap_assistant_message(content):
    return {
        "role": "assistant",
        "content": content,
    }


def wrap_user_message(content):
    return {
        "role": "user",
        "content": content,
    }


def format_messages(messages, indent=4):
    return "\n".join(
        [f"{indent * ' '}{message['role']}: {message['content']}" for message in messages]
    )
