The simulation demonstrates how you might handle agents linking, or connecting, while avoiding any race conditions.

The four short agents attempt to connect to the tall agent by sending it a connection message.

The tall agent looks through its requests and chooses one agent to connect with, and responds. Both agents change color once they have formed a "connection".
