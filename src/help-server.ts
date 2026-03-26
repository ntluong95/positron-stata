import * as http from "http";
import * as net from "net";

/**
 * A minimal local HTTP server that serves Stata help pages.
 * The Positron Help pane requires a URL (kind: "url"), so we
 * serve rendered SMCL-to-HTML content via localhost.
 */
export class StataHelpServer {
  private _server: http.Server | undefined;
  private _port = 0;
  private _pages = new Map<string, string>();
  private _counter = 0;

  /**
   * Start the server on a random available port.
   * Idempotent — calling start() again is a no-op.
   */
  async start(): Promise<void> {
    if (this._server) {
      return;
    }

    const server = http.createServer((req, res) => {
      // Extract page id from path: /help/<id>
      const match = req.url?.match(/^\/help\/([^?#]+)/);
      const pageId = match?.[1];
      const html = pageId ? this._pages.get(decodeURIComponent(pageId)) : undefined;

      if (!html) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(html);
    });

    this._port = await listenOnRandomPort(server);
    this._server = server;
  }

  /**
   * Store an HTML page and return its localhost URL.
   */
  publish(topic: string, html: string): string {
    const id = `${++this._counter}-${encodeURIComponent(topic)}`;
    this._pages.set(id, html);

    // Evict old pages if cache grows too large (keep most recent 128)
    if (this._pages.size > 128) {
      const oldest = this._pages.keys().next().value;
      if (oldest) {
        this._pages.delete(oldest);
      }
    }

    return `http://127.0.0.1:${this._port}/help/${id}`;
  }

  /**
   * Stop the server and clear the page cache.
   */
  async stop(): Promise<void> {
    this._pages.clear();
    if (this._server) {
      const server = this._server;
      this._server = undefined;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

function listenOnRandomPort(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve(addr.port);
    });
    server.on("error", reject);
  });
}
