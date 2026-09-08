import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketException;

// Non-secret descendant diagnostic. Documentation-only address; denial must be EPERM, not timeout.
class NetworkGuard {
  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(args[1]);
    boolean loopback = args[0].equals("loopback");
    try (Socket socket = new Socket()) {
      try {
        socket.connect(new InetSocketAddress("192.0.2.1", 9), 1000);
        throw new AssertionError("External socket unexpectedly opened");
      } catch (SocketException expected) {
        if (!expected.getMessage().contains("Operation not permitted")) throw expected;
        System.out.println("Java descendant external socket: EPERM");
      }
    }
    try (Socket socket = new Socket()) {
      try {
        socket.connect(new InetSocketAddress("127.0.0.1", port), 1000);
        if (!loopback) throw new AssertionError("Loopback unexpectedly allowed");
        System.out.println("Java descendant loopback: connected");
      } catch (SocketException expected) {
        if (loopback || !expected.getMessage().contains("Operation not permitted")) throw expected;
        System.out.println("Java descendant loopback: EPERM");
      }
    }
  }
}
