use axum::Router;
use tokio::{net::TcpListener, task::JoinHandle};

pub(super) struct Server {
    url: String,
    task: JoinHandle<()>,
}

impl Server {
    pub(super) fn url(&self) -> &str {
        &self.url
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub(super) async fn server(router: Router) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind the test server");
    let address = listener.local_addr().expect("should get the test address");
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .await
            .expect("should serve test responses");
    });
    Server {
        url: format!("http://{address}"),
        task,
    }
}

pub(super) fn public_client(server: &Server) -> (reqwest::Client, String) {
    let parsed = reqwest::Url::parse(&server.url).expect("should parse the test URL");
    let port = parsed.port().expect("should have an explicit port");
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .resolve("public.test", ([127, 0, 0, 1], port).into())
        .build()
        .expect("should build the test client");
    (client, format!("http://public.test:{port}"))
}
