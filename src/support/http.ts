/**
 * Module for working with HTTP requests.
 */

import * as net from "node:net";
import bplistParser from "bplist-parser";
import * as exceptions from "../exceptions.js";
import { CaseInsensitiveDict } from "./collections.js";

const VERSION = "0.1.0";
export const USER_AGENT = `nodeatv/${VERSION}`;
export const SERVER_NAME = `nodeatv-www/${VERSION}`;

/** Default timeout for HTTP requests (seconds). */
export const DEFAULT_TIMEOUT = 25.0;

/** Pre/post processing callback for HTTP data. */
export type DataProcessor = (data: Buffer) => Buffer;

function nullProcessor(data: Buffer): Buffer {
	return data;
}

// --- HTTP message types ---

export interface HttpResponse {
	protocol: string;
	version: string;
	code: number;
	message: string;
	headers: CaseInsensitiveDict<string> | Record<string, string>;
	body: string | Buffer | Record<string, unknown>;
}

export interface HttpRequest {
	method: string;
	path: string;
	protocol: string;
	version: string;
	headers: CaseInsensitiveDict<string> | Record<string, string>;
	body: string | Buffer;
}

// --- Parsing helpers ---

function keyValue(line: string): [string, string] {
	const idx = line.indexOf(": ");
	return [line.slice(0, idx), line.slice(idx + 2)];
}

function parseHttpMessage(
	message: Buffer,
): [string | null, CaseInsensitiveDict<string>, string | Buffer, Buffer] {
	const headerEnd = message.indexOf("\r\n\r\n");
	if (headerEnd === -1) {
		return [null, new CaseInsensitiveDict<string>(), Buffer.alloc(0), message];
	}

	const headerStr = message.subarray(0, headerEnd).toString("utf-8");
	const body = message.subarray(headerEnd + 4);
	const headers = headerStr.split("\r\n");

	const msgHeaders = new CaseInsensitiveDict<string>(
		Object.fromEntries(
			headers
				.slice(1)
				.filter((l) => l.length > 0)
				.map((l) => keyValue(l)),
		),
	);

	const contentLength = Number.parseInt(
		msgHeaders.get("content-length") ?? "0",
		10,
	);
	if (body.length < contentLength) {
		return [null, new CaseInsensitiveDict<string>(), Buffer.alloc(0), message];
	}

	const msgBody = body.subarray(0, contentLength);

	// Assume body is text unless content type is application/octet-stream
	const contentType = msgHeaders.get("content-type") ?? "";
	if (!contentType.startsWith("application")) {
		try {
			return [
				headers[0],
				msgHeaders,
				msgBody.toString("utf-8"),
				body.subarray(contentLength),
			];
		} catch {
			// Fall through to return bytes
		}
	}

	return [headers[0], msgHeaders, msgBody, body.subarray(contentLength)];
}

// --- Format / Parse functions ---

export function formatResponse(response: HttpResponse): Buffer {
	let headers = response.headers;
	if (!(headers instanceof CaseInsensitiveDict)) {
		headers = new CaseInsensitiveDict<string>(
			headers as Record<string, string>,
		);
	}

	let output = `${response.protocol}/${response.version} ${response.code} ${response.message}\r\n`;
	if (!headers.has("Server")) {
		output += `Server: ${SERVER_NAME}\r\n`;
	}
	for (const [key, value] of headers) {
		output += `${key}: ${value}\r\n`;
	}

	let bodyBuf: Buffer = Buffer.alloc(0);
	if (response.body) {
		if (typeof response.body === "string") {
			bodyBuf = Buffer.from(response.body, "utf-8");
		} else if (Buffer.isBuffer(response.body)) {
			bodyBuf = response.body;
		} else {
			// dict body — encode as JSON for now (Python uses binary plist)
			bodyBuf = Buffer.from(JSON.stringify(response.body), "utf-8");
		}
		if (bodyBuf.length > 0) {
			output += `Content-Length: ${bodyBuf.length}\r\n`;
		}
	}

	return Buffer.concat([Buffer.from(`${output}\r\n`, "utf-8"), bodyBuf]);
}

export function parseResponse(response: Buffer): [HttpResponse | null, Buffer] {
	const [firstLine, msgHeaders, msgBody, rest] = parseHttpMessage(response);
	if (firstLine === null) {
		return [null, rest];
	}

	const match = firstLine.match(/^([^/]+)\/([0-9.]+) ([0-9]+) (.*)$/);
	if (!match) {
		throw new Error(`bad first line: ${firstLine}`);
	}

	const [, protocol, version, code, message] = match;
	return [
		{
			protocol,
			version,
			code: Number.parseInt(code, 10),
			message,
			headers: msgHeaders,
			body: msgBody,
		},
		rest,
	];
}

function formatMessage(
	method: string,
	uri: string,
	protocol = "HTTP/1.1",
	userAgent: string = USER_AGENT,
	contentType: string | null = null,
	headers: CaseInsensitiveDict<string> | Record<string, string> | null = null,
	body: string | Buffer | null = null,
): Buffer {
	let bodyBuf: Buffer | null = null;
	if (typeof body === "string") {
		bodyBuf = Buffer.from(body, "utf-8");
	} else if (Buffer.isBuffer(body)) {
		bodyBuf = body;
	}

	let ciHeaders: CaseInsensitiveDict<string>;
	if (headers instanceof CaseInsensitiveDict) {
		ciHeaders = headers;
	} else {
		ciHeaders = new CaseInsensitiveDict<string>(headers ?? {});
	}

	let msg = `${method} ${uri} ${protocol}`;
	if (!ciHeaders.has("User-Agent")) {
		msg += `\r\nUser-Agent: ${userAgent}`;
	}
	if (contentType) {
		msg += `\r\nContent-Type: ${contentType}`;
	}
	if (bodyBuf && bodyBuf.length > 0) {
		msg += `\r\nContent-Length: ${bodyBuf.length}`;
	}

	for (const [key, value] of ciHeaders) {
		msg += `\r\n${key}: ${value}`;
	}
	msg += "\r\n\r\n";

	const output = Buffer.from(msg, "utf-8");
	if (bodyBuf && bodyBuf.length > 0) {
		return Buffer.concat([output, bodyBuf]);
	}
	return output;
}

export function formatRequest(request: HttpRequest): Buffer {
	return formatMessage(
		request.method,
		request.path,
		`${request.protocol}/${request.version}`,
		USER_AGENT,
		null,
		request.headers,
		request.body || null,
	);
}

export function parseRequest(request: Buffer): [HttpRequest | null, Buffer] {
	const [firstLine, msgHeaders, msgBody, rest] = parseHttpMessage(request);
	if (!firstLine) {
		return [null, rest];
	}

	const match = firstLine.match(/^([A-Z_]+) ([^ ]+) ([^/]+)\/([0-9.]+)$/);
	if (!match) {
		throw new Error(`bad first line: ${firstLine}`);
	}

	const [, method, path, protocol, version] = match;
	return [
		{
			method,
			path,
			protocol,
			version,
			headers: msgHeaders,
			body: msgBody as string | Buffer,
		},
		rest,
	];
}

export function decodeBplistFromBody(
	response: HttpResponse,
): Record<string, unknown> {
	if (typeof response.body !== "string" && !Buffer.isBuffer(response.body)) {
		throw new exceptions.ProtocolError(
			`expected bytes or str but got ${typeof response.body}`,
		);
	}
	const body =
		typeof response.body === "string"
			? Buffer.from(response.body, "utf-8")
			: response.body;

	// Detect binary plist magic bytes "bplist00"
	if (
		body.length >= 8 &&
		body[0] === 0x62 &&
		body.subarray(0, 8).toString() === "bplist00"
	) {
		try {
			const parsed = bplistParser.parseBuffer(body);
			return (parsed[0] ?? {}) as Record<string, unknown>;
		} catch {
			throw new exceptions.ProtocolError("failed to decode bplist body");
		}
	}

	// Fallback to JSON for non-bplist data
	try {
		return JSON.parse(body.toString("utf-8"));
	} catch {
		throw new exceptions.ProtocolError("failed to decode bplist body");
	}
}

// --- ClientSessionManager ---

export class ClientSessionManager {
	shouldClose: boolean;

	constructor(shouldClose = true) {
		this.shouldClose = shouldClose;
	}

	async close(): Promise<void> {
		// No-op for Node (no persistent session to close)
	}
}

// --- HttpSession ---

export class HttpSession {
	baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	async getData(
		path: string,
		headers?: Record<string, string>,
		timeout: number = DEFAULT_TIMEOUT,
	): Promise<[Buffer, number]> {
		const url = this.baseUrl + path;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout * 1000);

		try {
			const resp = await fetch(url, {
				method: "GET",
				headers,
				signal: controller.signal,
			});
			const data = Buffer.from(await resp.arrayBuffer());
			return [data, resp.status];
		} finally {
			clearTimeout(timer);
		}
	}

	async postData(
		path: string,
		data?: Buffer | null,
		headers?: Record<string, string>,
		timeout: number = DEFAULT_TIMEOUT,
	): Promise<[Buffer, number]> {
		const url = this.baseUrl + path;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout * 1000);

		try {
			const resp = await fetch(url, {
				method: "POST",
				headers,
				body: data ? new Uint8Array(data) : undefined,
				signal: controller.signal,
			});
			const respData = Buffer.from(await resp.arrayBuffer());
			return [respData, resp.status];
		} finally {
			clearTimeout(timer);
		}
	}
}

// --- HttpConnection (TCP socket based) ---

interface PendingRequest {
	resolve: (response: HttpResponse) => void;
	reject: (error: Error) => void;
	connectionClosed: boolean;
}

export class HttpConnection {
	private _socket: net.Socket | null = null;
	private _localIp: string | null = null;
	private _remoteIp: string | null = null;
	private _requests: PendingRequest[] = [];
	private _buffer: Buffer = Buffer.alloc(0);
	receiveProcessor: DataProcessor;
	sendProcessor: DataProcessor;

	constructor(receiveProcessor?: DataProcessor, sendProcessor?: DataProcessor) {
		this.receiveProcessor = receiveProcessor ?? nullProcessor;
		this.sendProcessor = sendProcessor ?? nullProcessor;
	}

	get localIp(): string {
		if (this._localIp === null) {
			throw new Error("not connected");
		}
		return this._localIp;
	}

	get remoteIp(): string {
		if (this._remoteIp === null) {
			throw new Error("not connected");
		}
		return this._remoteIp;
	}

	get socket(): net.Socket | null {
		return this._socket;
	}

	/** Called internally when the socket connects. */
	_connectionMade(socket: net.Socket): void {
		this._socket = socket;
		const localAddr = socket.localAddress ?? "";
		const remoteAddr = socket.remoteAddress ?? "";
		this._localIp = localAddr;
		this._remoteIp = remoteAddr;
	}

	/** Called internally when data arrives. */
	_dataReceived(data: Buffer): void {
		data = this.receiveProcessor(data);

		this._buffer = Buffer.concat([this._buffer, data]);
		while (this._buffer.length > 0) {
			const [parsed, rest] = parseResponse(this._buffer);
			if (parsed === null) {
				break;
			}
			this._buffer = rest;

			if (this._requests.length > 0) {
				const pendingRequest = this._requests.pop()!;
				pendingRequest.resolve(parsed);
			}
		}
	}

	/** Called internally when the connection is lost. */
	_connectionLost(): void {
		for (const pending of this._requests) {
			pending.connectionClosed = true;
			pending.reject(new exceptions.ConnectionLostError("connection was lost"));
		}
		this._requests.length = 0;
		this._socket = null;
	}

	close(): void {
		if (this._socket) {
			const socket = this._socket;
			this._socket = null;
			socket.destroy();
		}
		// Reject all pending requests
		for (const pending of this._requests) {
			pending.reject(
				new exceptions.ConnectionLostError("connection was closed"),
			);
		}
		this._requests.length = 0;
	}

	async get(path: string, allowError = false): Promise<HttpResponse> {
		return this.sendAndReceive("GET", path, { allowError });
	}

	async post(
		path: string,
		options?: {
			headers?: Record<string, string>;
			body?: string | Buffer;
			allowError?: boolean;
		},
	): Promise<HttpResponse> {
		return this.sendAndReceive("POST", path, {
			headers: options?.headers,
			body: options?.body,
			allowError: options?.allowError,
		});
	}

	async sendAndReceive(
		method: string,
		uri: string,
		options?: {
			protocol?: string;
			userAgent?: string;
			contentType?: string;
			headers?: Record<string, string> | CaseInsensitiveDict<string>;
			body?: string | Buffer;
			allowError?: boolean;
			timeout?: number;
		},
	): Promise<HttpResponse> {
		const protocol = options?.protocol ?? "HTTP/1.1";
		const userAgent = options?.userAgent ?? USER_AGENT;
		const contentType = options?.contentType ?? null;
		const headers = options?.headers ?? null;
		const body = options?.body ?? null;
		const allowError = options?.allowError ?? false;
		const timeout = options?.timeout ?? 10;

		const output = formatMessage(
			method,
			uri,
			protocol,
			userAgent,
			contentType,
			headers,
			body,
		);

		if (this._socket === null) {
			throw new Error("not connected to remote");
		}

		this._socket.write(this.sendProcessor(output));

		const response = await new Promise<HttpResponse>((resolve, reject) => {
			const pending: PendingRequest = {
				resolve,
				reject,
				connectionClosed: false,
			};
			this._requests.unshift(pending);

			const timer = setTimeout(() => {
				const idx = this._requests.indexOf(pending);
				if (idx !== -1) {
					this._requests.splice(idx, 1);
				}
				reject(new Error(`no response to ${method} ${uri} (${protocol})`));
			}, timeout * 1000);

			// Replace resolve/reject to also clear timer
			const origResolve = pending.resolve;
			const origReject = pending.reject;
			pending.resolve = (val) => {
				clearTimeout(timer);
				origResolve(val);
			};
			pending.reject = (err) => {
				clearTimeout(timer);
				origReject(err);
			};
		});

		if (response.code === 403) {
			throw new exceptions.AuthenticationError("not authenticated");
		}

		if (response.code === 401) {
			if (allowError) return response;
			throw new exceptions.AuthenticationError("not authenticated");
		}

		if ((response.code >= 200 && response.code < 300) || allowError) {
			return response;
		}

		throw new exceptions.HttpError(
			`${protocol} method ${method} failed with code ${response.code}: ${response.message}`,
			response.code,
		);
	}
}

// --- HTTP server infrastructure ---

export interface HttpServerHandler {
	handleRequest(
		request: HttpRequest,
	): HttpResponse | Promise<HttpResponse> | null;
}

export class HttpSimpleRouter implements HttpServerHandler {
	private _routes: Map<
		string,
		Map<
			string,
			(request: HttpRequest) => HttpResponse | Promise<HttpResponse> | null
		>
	> = new Map();

	addRoute(
		method: string,
		path: string,
		target: (
			request: HttpRequest,
		) => HttpResponse | Promise<HttpResponse> | null,
	): void {
		if (!this._routes.has(method)) {
			this._routes.set(method, new Map());
		}
		this._routes.get(method)!.set(path, target);
	}

	handleRequest(
		request: HttpRequest,
	): HttpResponse | Promise<HttpResponse> | null {
		const methodRoutes = this._routes.get(request.method);
		if (!methodRoutes) return null;
		for (const [pathPattern, target] of methodRoutes) {
			if (new RegExp(pathPattern).test(request.path)) {
				return target(request);
			}
		}
		return null;
	}
}

export class BasicHttpServer {
	handler: HttpServerHandler;
	private _socket: net.Socket | null = null;
	private _requestBuffer: Buffer = Buffer.alloc(0);

	constructor(handler: HttpServerHandler) {
		this.handler = handler;
	}

	/** Called when connection is made */
	_connectionMade(socket: net.Socket): void {
		this._socket = socket;
	}

	/** Called when data is received */
	_dataReceived(data: Buffer): void {
		data = this.processReceived(data);

		this._requestBuffer = Buffer.concat([this._requestBuffer, data]);
		while (this._requestBuffer.length > 0) {
			const rest = this._parseAndSendNext(this._requestBuffer);
			if (rest.length === this._requestBuffer.length) {
				break;
			}
			this._requestBuffer = rest;
		}
	}

	processReceived(data: Buffer): Buffer {
		return data;
	}

	processSent(data: Buffer): Buffer {
		return data;
	}

	private _parseAndSendNext(data: Buffer): Buffer {
		let resp: HttpResponse | Promise<HttpResponse> | null = null;
		let rest: Buffer = Buffer.alloc(0);

		try {
			const [request, remaining] = parseRequest(data);
			rest = remaining;

			if (!request) {
				return data;
			}

			resp = this.handler.handleRequest(request);
		} catch (ex) {
			resp = {
				protocol: "HTTP",
				version: "1.1",
				code: 500,
				message: "Internal server error",
				headers: {},
				body: String(ex instanceof Error ? ex.message : ex),
			};
		}

		if (!resp) {
			resp = {
				protocol: "HTTP",
				version: "1.1",
				code: 404,
				message: "File not found",
				headers: {},
				body: "Not found",
			};
		}

		if (resp instanceof Promise) {
			resp.then((r) => this._sendResponse(r));
		} else {
			this._sendResponse(resp);
		}

		return rest;
	}

	private _sendResponse(resp: HttpResponse): void {
		if (this._socket) {
			this._socket.write(this.processSent(formatResponse(resp)));
		}
	}
}

// --- Factory functions ---

export async function httpConnect(
	address: string,
	port: number,
): Promise<HttpConnection> {
	const connection = new HttpConnection();

	return new Promise<HttpConnection>((resolve, reject) => {
		const socket = net.createConnection(port, address, () => {
			connection._connectionMade(socket);
			resolve(connection);
		});

		socket.on("data", (data: Buffer) => {
			connection._dataReceived(data);
		});

		socket.on("close", () => {
			connection._connectionLost();
		});

		socket.on("error", (err: Error) => {
			if (!connection.socket) {
				reject(err);
			}
			connection._connectionLost();
		});
	});
}

export async function httpServer(
	serverFactory: () => BasicHttpServer,
	address = "127.0.0.1",
	port = 0,
): Promise<[net.Server, number]> {
	return new Promise<[net.Server, number]>((resolve, reject) => {
		const server = net.createServer((socket) => {
			const httpSrv = serverFactory();
			httpSrv._connectionMade(socket);

			socket.on("data", (data: Buffer) => {
				httpSrv._dataReceived(data);
			});

			socket.on("error", () => {
				// ignore
			});
		});

		server.listen(port, address, () => {
			const addr = server.address();
			if (addr && typeof addr === "object") {
				resolve([server, addr.port]);
			} else {
				reject(new Error("failed to set up http server"));
			}
		});

		server.on("error", reject);
	});
}

export async function createSession(): Promise<ClientSessionManager> {
	return new ClientSessionManager(true);
}
