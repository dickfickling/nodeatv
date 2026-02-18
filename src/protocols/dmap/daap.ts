/**
 * Methods used to GET/POST data from/to an Apple TV.
 */

import { DeviceState, MediaType } from "../../const.js";
import {
	AuthenticationError,
	InvalidCredentialsError,
	NotSupportedError,
	UnknownMediaKindError,
	UnknownPlayStateError,
} from "../../exceptions.js";
import type { HttpSession } from "../../support/http.js";
import * as parser from "./parser.js";
import { lookupTag } from "./tagDefinitions.js";

const _DMAP_HEADERS: Record<string, string> = {
	Accept: "*/*",
	"Accept-Encoding": "gzip",
	"Client-DAAP-Version": "3.13",
	"Client-ATV-Sharing-Version": "1.2",
	"Client-iTunes-Sharing-Version": "3.15",
	"User-Agent": "Remote/1021",
	"Viewer-Only-Client": "1",
};

export const DEFAULT_TIMEOUT = 10.0;

export function mediaKind(kind: number): MediaType {
	if ([1, 32770].includes(kind)) return MediaType.Unknown;
	if ([3, 7, 11, 12, 13, 18, 32].includes(kind)) return MediaType.Video;
	if ([2, 4, 10, 14, 17, 21, 36].includes(kind)) return MediaType.Music;
	if ([8, 64].includes(kind)) return MediaType.TV;
	throw new UnknownMediaKindError(`Unknown media kind: ${kind}`);
}

export function playstate(state: number | null | undefined): DeviceState {
	if (state === 0 || state === null || state === undefined)
		return DeviceState.Idle;
	if (state === 1) return DeviceState.Loading;
	if (state === 2) return DeviceState.Stopped;
	if (state === 3) return DeviceState.Paused;
	if (state === 4) return DeviceState.Playing;
	if (state === 5 || state === 6) return DeviceState.Seeking;
	throw new UnknownPlayStateError(`Unknown playstate: ${state}`);
}

export function msToS(time: number | null | undefined): number {
	if (time === null || time === undefined) return 0;
	if (time >= 2 ** 32 - 1) return 0;
	return Math.round(time / 1000.0);
}

export class DaapRequester {
	http: HttpSession;
	private _loginId: string;
	private _sessionId = 0;

	constructor(http: HttpSession, loginId: string) {
		this.http = http;
		this._loginId = loginId;
	}

	async login(): Promise<number> {
		const doLogin = () => {
			const url = this._mkurl("login?[AUTH]&hasFP=1", {
				session: false,
				loginId: true,
			});
			return this.http.getData(url, _DMAP_HEADERS);
		};

		const resp = await this._do(doLogin, { isLogin: true });
		this._sessionId = parser.first(resp, "mlog", "mlid") as number;
		return this._sessionId;
	}

	async get(
		cmd: string,
		daapData = true,
		timeout?: number,
		...args: string[]
	): Promise<unknown> {
		const doGet = () => {
			const url = this._mkurl(cmd, {}, ...args);
			return this.http.getData(url, _DMAP_HEADERS, timeout);
		};

		await this._assureLoggedIn();
		return this._do(doGet, { isDaap: daapData });
	}

	async post(
		cmd: string,
		data?: Buffer | null,
		timeout?: number,
		...args: string[]
	): Promise<unknown> {
		const doPost = () => {
			const url = this._mkurl(cmd, {}, ...args);
			const headers = { ..._DMAP_HEADERS };
			headers["Content-Type"] = "application/x-www-form-urlencoded";
			return this.http.postData(url, data, headers, timeout);
		};

		await this._assureLoggedIn();
		return this._do(doPost);
	}

	private async _do(
		action: () => Promise<[Buffer, number]>,
		options: {
			retry?: boolean;
			isLogin?: boolean;
			isDaap?: boolean;
		} = {},
	): Promise<unknown> {
		const { retry = true, isLogin = false, isDaap = true } = options;

		const [respData, status] = await action();

		let resp: unknown = respData;
		if (isDaap) {
			resp = parser.parse(respData, lookupTag);
		}

		if (status >= 200 && status < 300) {
			return resp;
		}

		if (status === 500) {
			throw new NotSupportedError("command not supported at this stage");
		}

		if (!isLogin) {
			await this.login();
		}

		if (retry) {
			return this._do(action, { retry: false, isLogin, isDaap });
		}

		throw new AuthenticationError(`failed to login: ${status}`);
	}

	private _mkurl(
		cmd: string,
		options: { session?: boolean; loginId?: boolean } = {},
		..._args: string[]
	): string {
		const { session = true, loginId = false } = options;
		let url = cmd;
		const parameters: string[] = [];

		if (loginId) {
			if (/^0x[0-9A-Fa-f]{16}$/.test(this._loginId)) {
				parameters.push(`pairing-guid=${this._loginId}`);
			} else if (
				/^[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$/.test(
					this._loginId,
				)
			) {
				parameters.push(`hsgid=${this._loginId}`);
			} else {
				throw new InvalidCredentialsError(
					`invalid credentials: ${this._loginId}`,
				);
			}
		}

		if (session) {
			parameters.unshift(`session-id=${this._sessionId}`);
		}

		url = url.replace("[AUTH]", parameters.join("&"));
		return url;
	}

	private async _assureLoggedIn(): Promise<void> {
		if (this._sessionId !== 0) {
			return;
		}
		await this.login();
	}
}
