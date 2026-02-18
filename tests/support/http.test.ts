import * as net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectionLostError } from "../../src/exceptions.js";
import {
	BasicHttpServer,
	formatRequest,
	formatResponse,
	type HttpRequest,
	type HttpResponse,
	HttpSimpleRouter,
	httpConnect,
	httpServer,
	parseRequest,
	parseResponse,
	SERVER_NAME,
	USER_AGENT,
} from "../../src/support/http.js";
import { unusedPort } from "../../src/support/net.js";

// Track servers to clean up
const servers: net.Server[] = [];
afterEach(() => {
	for (const server of servers) {
		server.close();
	}
	servers.length = 0;
});

// --- HTTP Response Parsing ---

describe("parseResponse", () => {
	it("parses ok first line", () => {
		const [resp, rest] = parseResponse(Buffer.from("HTTP/1.0 200 OK\r\n\r\n"));
		expect(resp?.code).toBe(200);
		expect(resp?.message).toBe("OK");
		expect(rest).toEqual(Buffer.alloc(0));
	});

	it("returns null for missing ending", () => {
		const [resp, rest] = parseResponse(Buffer.from("HTTP/1.0 200 OK\r\n"));
		expect(resp).toBeNull();
		expect(rest).toEqual(Buffer.from("HTTP/1.0 200 OK\r\n"));
	});

	it("parses headers", () => {
		const [resp, rest] = parseResponse(
			Buffer.from("HTTP/1.0 200 OK\r\nA: B\r\nC: D\r\n\r\n"),
		);
		expect(resp?.headers.get("A")).toBe("B");
		expect(resp?.headers.get("C")).toBe("D");
		expect(rest).toEqual(Buffer.alloc(0));
	});

	it("parses body", () => {
		const [resp, rest] = parseResponse(
			Buffer.from("HTTP/1.0 200 OK\r\nContent-Length: 4\r\n\r\nbody"),
		);
		expect(resp?.body).toBe("body");
		expect(rest).toEqual(Buffer.alloc(0));
	});

	it("returns null when no body present but content-length set", () => {
		const content = Buffer.from("HTTP/1.0 200 OK\r\nContent-Length: 5\r\n\r\n");
		const [resp, rest] = parseResponse(content);
		expect(resp).toBeNull();
		expect(rest).toEqual(content);
	});

	it("returns null when body too short", () => {
		const content = Buffer.from(
			"HTTP/1.0 200 OK\r\nContent-Length: 5\r\n\r\nbody",
		);
		const [resp, rest] = parseResponse(content);
		expect(resp).toBeNull();
		expect(rest).toEqual(content);
	});

	it("handles excessive data in body", () => {
		const [resp, rest] = parseResponse(
			Buffer.from("HTTP/1.0 200 OK\r\nContent-Length: 4\r\n\r\nbodyextra"),
		);
		expect(resp?.body).toBe("body");
		expect(rest).toEqual(Buffer.from("extra"));
	});

	it("parses sequential messages", () => {
		const fullData = Buffer.concat([
			Buffer.from("HTTP/1.0 200 OK\r\nA: B\r\n\r\n"),
			Buffer.from("HTTP/1.0 200 OK\r\nContent-Length: 2\r\n\r\nAB"),
			Buffer.from("HTTP/1.0 200 OK\r\nContent-Length: 0\r\n\r\n"),
		]);

		let [resp, rest] = parseResponse(fullData);
		expect(resp?.headers.get("A")).toBe("B");
		expect(resp?.body).toBe("");

		[resp, rest] = parseResponse(rest);
		expect(resp?.body).toBe("AB");

		[resp, rest] = parseResponse(rest);
		expect(resp?.headers.get("Content-Length")).toBe("0");
		expect(resp?.body).toBe("");
		expect(rest).toEqual(Buffer.alloc(0));
	});

	it("returns application type body as bytes", () => {
		const [resp, rest] = parseResponse(
			Buffer.from(
				"HTTP/1.0 200 OK\r\nContent-Length: 4\r\nContent-Type: application/something\r\n\r\nbodyextra",
			),
		);
		expect(resp?.body).toEqual(Buffer.from("body"));
		expect(rest).toEqual(Buffer.from("extra"));
	});

	it("parses arbitrary protocol header", () => {
		const [resp] = parseResponse(Buffer.from("FOO/3.14 200 OK\r\n\r\n"));
		expect(resp?.protocol).toBe("FOO");
		expect(resp?.version).toBe("3.14");
	});

	it("ignores header case", () => {
		const [resp, rest] = parseResponse(
			Buffer.from(
				"HTTP/1.0 200 OK\r\nCONTENT-lEnGtH: 4\r\ncontent-TYPE: application/something\r\n\r\nbodyextra",
			),
		);
		expect(resp?.body).toEqual(Buffer.from("body"));
		expect(rest).toEqual(Buffer.from("extra"));
	});
});

// --- Format Response ---

describe("formatResponse", () => {
	it.each([
		{
			response: {
				protocol: "HTTP",
				version: "1.1",
				code: 200,
				message: "OK",
				headers: {},
				body: Buffer.alloc(0),
			},
			expected: Buffer.from(
				`HTTP/1.1 200 OK\r\nServer: ${SERVER_NAME}\r\n\r\n`,
			),
		},
		{
			response: {
				protocol: "FOO",
				version: "3.14",
				code: 200,
				message: "OK",
				headers: {},
				body: Buffer.alloc(0),
			},
			expected: Buffer.from(
				`FOO/3.14 200 OK\r\nServer: ${SERVER_NAME}\r\n\r\n`,
			),
		},
		{
			response: {
				protocol: "HTTP",
				version: "1.1",
				code: 404,
				message: "Not Found",
				headers: {},
				body: Buffer.alloc(0),
			},
			expected: Buffer.from(
				`HTTP/1.1 404 Not Found\r\nServer: ${SERVER_NAME}\r\n\r\n`,
			),
		},
		{
			response: {
				protocol: "HTTP",
				version: "1.1",
				code: 200,
				message: "OK",
				headers: { A: "B" },
				body: Buffer.alloc(0),
			},
			expected: Buffer.from(
				`HTTP/1.1 200 OK\r\nServer: ${SERVER_NAME}\r\na: B\r\n\r\n`,
			),
		},
		{
			response: {
				protocol: "HTTP",
				version: "1.1",
				code: 200,
				message: "OK",
				headers: {},
				body: Buffer.from("test"),
			},
			expected: Buffer.from(
				`HTTP/1.1 200 OK\r\nServer: ${SERVER_NAME}\r\nContent-Length: 4\r\n\r\ntest`,
			),
		},
	])("formats response $response.code $response.message", ({
		response,
		expected,
	}) => {
		expect(formatResponse(response)).toEqual(expected);
	});
});

// --- Parse Request ---

describe("parseRequest", () => {
	it("parses ok first line", () => {
		const [req, rest] = parseRequest(Buffer.from("GET /test HTTP/1.0\r\n\r\n"));
		expect(req?.method).toBe("GET");
		expect(req?.path).toBe("/test");
		expect(req?.protocol).toBe("HTTP");
		expect(req?.version).toBe("1.0");
		expect(rest).toEqual(Buffer.alloc(0));
	});

	it("parses arbitrary protocol header", () => {
		const [req] = parseRequest(Buffer.from("GET /test FOO/3.14\r\n\r\n"));
		expect(req?.protocol).toBe("FOO");
		expect(req?.version).toBe("3.14");
	});

	it("parses method with underscore", () => {
		const [req] = parseRequest(
			Buffer.from("SOME_METHOD /test FOO/3.14\r\n\r\n"),
		);
		expect(req?.method).toBe("SOME_METHOD");
	});
});

// --- Format Request ---

describe("formatRequest", () => {
	it.each([
		{
			request: {
				method: "GET",
				path: "/test",
				protocol: "HTTP",
				version: "1.1",
				headers: {},
				body: Buffer.alloc(0),
			},
			expected: Buffer.from(
				`GET /test HTTP/1.1\r\nUser-Agent: ${USER_AGENT}\r\n\r\n`,
			),
		},
		{
			request: {
				method: "GET",
				path: "/example",
				protocol: "HTTP",
				version: "1.1",
				headers: {},
				body: Buffer.alloc(0),
			},
			expected: Buffer.from(
				`GET /example HTTP/1.1\r\nUser-Agent: ${USER_AGENT}\r\n\r\n`,
			),
		},
		{
			request: {
				method: "GET",
				path: "/test",
				protocol: "FOO",
				version: "3.14",
				headers: {},
				body: Buffer.alloc(0),
			},
			expected: Buffer.from(
				`GET /test FOO/3.14\r\nUser-Agent: ${USER_AGENT}\r\n\r\n`,
			),
		},
		{
			request: {
				method: "GET",
				path: "/test",
				protocol: "HTTP",
				version: "1.1",
				headers: { A: "B" },
				body: Buffer.alloc(0),
			},
			expected: Buffer.from(
				`GET /test HTTP/1.1\r\nUser-Agent: ${USER_AGENT}\r\na: B\r\n\r\n`,
			),
		},
		{
			request: {
				method: "GET",
				path: "/test",
				protocol: "HTTP",
				version: "1.1",
				headers: {},
				body: Buffer.from("test"),
			},
			expected: Buffer.from(
				`GET /test HTTP/1.1\r\nUser-Agent: ${USER_AGENT}\r\nContent-Length: 4\r\n\r\ntest`,
			),
		},
	])("formats request $request.method $request.path", ({
		request,
		expected,
	}) => {
		expect(formatRequest(request)).toEqual(expected);
	});
});

// --- Basic HTTP Server ---

async function serve(
	handler: HttpSimpleRouter | ((req: HttpRequest) => HttpResponse | null),
) {
	let httpHandler: {
		handleRequest: (
			req: HttpRequest,
		) => HttpResponse | Promise<HttpResponse> | null;
	};
	if (typeof handler === "function") {
		httpHandler = { handleRequest: handler };
	} else {
		httpHandler = handler;
	}

	const [server, port] = await httpServer(
		() => new BasicHttpServer(httpHandler),
	);
	servers.push(server);
	return { server, port };
}

async function serveAndConnect(
	handler: HttpSimpleRouter | ((req: HttpRequest) => HttpResponse | null),
) {
	const { server, port } = await serve(handler);
	const client = await httpConnect("127.0.0.1", port);
	return { client, server };
}

describe("BasicHttpServer", () => {
	it("returns 404 for unhandled resource", async () => {
		const { client } = await serveAndConnect(() => null);

		const resp = await client.get("/", true);
		expect(resp.protocol).toBe("HTTP");
		expect(resp.version).toBe("1.1");
		expect(resp.code).toBe(404);
		expect(resp.message).toBe("File not found");
		expect(resp.headers.get("server")).toBeTruthy();
		expect(resp.body).toBe("Not found");

		client.close();
	});

	it("serves single file", async () => {
		function handlePage(request: HttpRequest): HttpResponse {
			expect(request.protocol).toBe("HTTP");
			expect(request.version).toBe("1.1");
			expect(request.path).toBe("/resource");
			expect(request.method).toBe("GET");

			return {
				protocol: "HTTP",
				version: "1.1",
				code: 200,
				message: "OK",
				headers: { DummyHeader: "value" },
				body: Buffer.from("body"),
			};
		}

		const { client } = await serveAndConnect(handlePage);

		const resp = await client.get("/resource", true);
		expect(resp.protocol).toBe("HTTP");
		expect(resp.code).toBe(200);
		expect(resp.message).toBe("OK");
		expect(resp.body).toBe("body");

		client.close();
	});

	it("returns 500 for bad handler", async () => {
		function handlePage(_request: HttpRequest): HttpResponse {
			throw new Error("fail");
		}

		const { client } = await serveAndConnect(handlePage);

		const resp = await client.get("/", true);
		expect(resp.protocol).toBe("HTTP");
		expect(resp.code).toBe(500);
		expect(resp.message).toBe("Internal server error");
		expect(resp.body).toBe("fail");

		client.close();
	});
});

// --- HttpSimpleRouter ---

class DummyRouter extends HttpSimpleRouter {
	constructor() {
		super();
		this.addRoute("GET", "/foo", (req) => this.foo(req));
		this.addRoute("GET", "/bar", (req) => this.bar(req));
	}

	foo(request: HttpRequest): HttpResponse {
		return {
			protocol: "HTTP",
			version: "1.1",
			code: 200,
			message: "foo",
			headers: {},
			body: request.body,
		};
	}

	bar(request: HttpRequest): HttpResponse {
		return {
			protocol: "HTTP",
			version: "1.1",
			code: 123,
			message: "dummy",
			headers: {},
			body: request.body,
		};
	}
}

describe("HttpSimpleRouter", () => {
	it("routes to correct handler", () => {
		const router = new DummyRouter();
		const resp = router.handleRequest({
			method: "GET",
			path: "/foo",
			protocol: "HTTP",
			version: "1.1",
			headers: {},
			body: "foobar",
		}) as HttpResponse;
		expect(resp.code).toBe(200);
		expect(resp.protocol).toBe("HTTP");
		expect(resp.version).toBe("1.1");
		expect(resp.body).toBe("foobar");
	});

	it("returns null for wrong method", () => {
		const router = new DummyRouter();
		const resp = router.handleRequest({
			method: "POST",
			path: "/foo",
			protocol: "HTTP",
			version: "1.1",
			headers: {},
			body: "foobar",
		});
		expect(resp).toBeNull();
	});

	it("works with server", async () => {
		const { client } = await serveAndConnect(new DummyRouter());

		const resp = await client.get("/foo", true);
		expect(resp.code).toBe(200);

		client.close();
	});
});

// --- HttpConnection processors ---

describe("HttpConnection", () => {
	it("send processor transforms request", async () => {
		const { client } = await serveAndConnect(new DummyRouter());
		client.sendProcessor = (data: Buffer) =>
			Buffer.from(data.toString().replace("/foo", "/bar"));

		const resp = await client.get("/foo", true);
		expect(resp.code).toBe(123);
		expect(resp.message).toBe("dummy");

		client.close();
	});

	it("receive processor transforms response", async () => {
		const { client } = await serveAndConnect(new DummyRouter());
		client.receiveProcessor = (data: Buffer) =>
			Buffer.from(data.toString().replace("foo", "something else"));

		const resp = await client.get("/foo", true);
		expect(resp.code).toBe(200);
		expect(resp.message).toBe("something else");

		client.close();
	});

	it("aborts pending requests when connection closed", async () => {
		const port = await unusedPort();
		const server = net.createServer((socket) => {
			// Read a little data then close the connection
			socket.once("data", () => {
				socket.destroy();
			});
		});
		await new Promise<void>((resolve) => {
			server.listen(port, "127.0.0.1", () => resolve());
		});
		servers.push(server);

		const connection = await httpConnect("127.0.0.1", port);

		const tasks = Array.from({ length: 3 }, () =>
			connection.sendAndReceive("GET", "/test"),
		);

		for (const task of tasks) {
			await expect(task).rejects.toThrow(ConnectionLostError);
		}
	});
});
