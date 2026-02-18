/**
 * High level implementation of Companion API.
 */

import { parseCredentials } from "../../auth/hapPairing.js";
import { SRPAuthHandler } from "../../auth/hapSrp.js";
import { InputAction, TouchAction } from "../../const.js";
import type { Core } from "../../core/core.js";
import { MessageDispatcher } from "../../core/protocol.js";
import { isUrlOrScheme } from "../../support/url.js";
import { CompanionConnection, FrameType } from "./connection.js";
import * as keyedArchiver from "./keyedArchiver.js";
import {
	getRtiClearTextPayload,
	getRtiInputTextPayload,
} from "./plistPayloads.js";
import {
	CompanionProtocol,
	type CompanionProtocolListener,
	MessageType,
} from "./protocol.js";

export enum HidCommand {
	Up = 1,
	Down = 2,
	Left = 3,
	Right = 4,
	Menu = 5,
	Select = 6,
	Home = 7,
	VolumeUp = 8,
	VolumeDown = 9,
	Siri = 10,
	Screensaver = 11,
	Sleep = 12,
	Wake = 13,
	PlayPause = 14,
	ChannelIncrement = 15,
	ChannelDecrement = 16,
	Guide = 17,
	PageUp = 18,
	PageDown = 19,
}

export enum MediaControlCommand {
	Play = 1,
	Pause = 2,
	NextTrack = 3,
	PreviousTrack = 4,
	GetVolume = 5,
	SetVolume = 6,
	SkipBy = 7,
	FastForwardBegin = 8,
	FastForwardEnd = 9,
	RewindBegin = 10,
	RewindEnd = 11,
	GetCaptionSettings = 12,
	SetCaptionSettings = 13,
}

export enum SystemStatus {
	Unknown = 0x00,
	Asleep = 0x01,
	Screensaver = 0x02,
	Awake = 0x03,
	Idle = 0x04,
}

const TOUCHPAD_WIDTH = 1000.0;
const TOUCHPAD_HEIGHT = 1000.0;
const TOUCHPAD_DELAY_MS = 16;

type EventMapping = Record<string, unknown>;

export class CompanionAPI
	extends MessageDispatcher<string, EventMapping>
	implements CompanionProtocolListener
{
	core: Core;
	private _connection: CompanionConnection | null = null;
	private _protocol: CompanionProtocol | null = null;
	private _subscribedEvents: string[] = [];
	sid = 0;
	private _baseTimestamp: bigint = process.hrtime.bigint();

	constructor(core: Core) {
		super();
		this.core = core;
	}

	async disconnect(): Promise<void> {
		if (!this._protocol) return;

		try {
			for (const event of this._subscribedEvents) {
				await this.unsubscribeEvent(event);
			}
			await this._sessionStop();
			await this._touchStop();
			await this._textInputStop();
		} catch {
			// Ignore errors during disconnect
		} finally {
			this._protocol.stop();
			this._protocol = null;
		}
	}

	eventReceived(eventName: string, data: Record<string, unknown>): void {
		this.dispatch(eventName, data);
	}

	async connect(): Promise<void> {
		if (this._protocol) return;

		this._connection = new CompanionConnection(
			String(this.core.config.address),
			this.core.service.port,
		);
		this._protocol = new CompanionProtocol(
			this._connection,
			new SRPAuthHandler(),
			this.core.service,
		);
		this._protocol.listener = this;
		await this._protocol.start();

		await this.systemInfo();
		await this._touchStart();
		await this._sessionStart();
		await this._textInputStart();

		await this.subscribeEvent("_iMC");
	}

	private async _sendCommand(
		identifier: string,
		content: Record<string, unknown>,
		messageType: MessageType = MessageType.Request,
	): Promise<Record<string, unknown>> {
		await this.connect();
		if (!this._protocol) {
			throw new Error("not connected to companion");
		}

		const resp = await this._protocol.exchangeOpack(FrameType.E_OPACK, {
			_i: identifier,
			_t: messageType,
			_c: content,
		});

		return resp;
	}

	async systemInfo(): Promise<void> {
		const creds = parseCredentials(this.core.service.credentials);
		const info = this.core.settings.info;

		await this._sendCommand("_systemInfo", {
			_bf: 0,
			_cf: 512,
			_clFl: 128,
			_i: info.rpId,
			_idsID: creds.clientId,
			_pubID: info.deviceId,
			_sf: 256,
			_sv: "170.18",
			model: info.model,
			name: info.name,
		});
	}

	private async _sessionStart(): Promise<void> {
		const localSid = Math.floor(Math.random() * 0xffffffff);
		const resp = await this._sendCommand("_sessionStart", {
			_srvT: "com.apple.tvremoteservices",
			_sid: localSid,
		});

		const content = resp._c as Record<string, unknown> | undefined;
		if (!content) {
			throw new Error("missing content");
		}

		const remoteSid = content._sid as number;
		// Combine remote and local SID into a single session identifier
		this.sid = remoteSid * 0x100000000 + localSid;
	}

	private async _sessionStop(): Promise<void> {
		await this._sendCommand("_sessionStop", {
			_srvT: "com.apple.tvremoteservices",
			_sid: this.sid,
		});
	}

	private _sendEvent(
		identifier: string,
		content: Record<string, unknown>,
	): void {
		if (!this._protocol) {
			throw new Error("not connected to companion");
		}

		this._protocol.sendOpack(FrameType.E_OPACK, {
			_i: identifier,
			_t: MessageType.Event,
			_c: content,
		});
	}

	async subscribeEvent(event: string): Promise<void> {
		if (!this._subscribedEvents.includes(event)) {
			this._sendEvent("_interest", { _regEvents: [event] });
			this._subscribedEvents.push(event);
		}
	}

	async unsubscribeEvent(event: string): Promise<void> {
		if (this._subscribedEvents.includes(event)) {
			this._sendEvent("_interest", { _deregEvents: [event] });
			this._subscribedEvents = this._subscribedEvents.filter(
				(e) => e !== event,
			);
		}
	}

	async launchApp(bundleIdentifierOrUrl: string): Promise<void> {
		const launchCommandKey = isUrlOrScheme(bundleIdentifierOrUrl)
			? "_urlS"
			: "_bundleID";
		await this._sendCommand("_launchApp", {
			[launchCommandKey]: bundleIdentifierOrUrl,
		});
	}

	async appList(): Promise<Record<string, unknown>> {
		return this._sendCommand("FetchLaunchableApplicationsEvent", {});
	}

	async switchAccount(accountId: string): Promise<void> {
		await this._sendCommand("SwitchUserAccountEvent", {
			SwitchAccountID: accountId,
		});
	}

	async accountList(): Promise<Record<string, unknown>> {
		return this._sendCommand("FetchUserAccountsEvent", {});
	}

	async hidCommand(down: boolean, command: HidCommand): Promise<void> {
		await this._sendCommand("_hidC", {
			_hBtS: down ? 1 : 2,
			_hidC: command,
		});
	}

	async hidEvent(x: number, y: number, mode: TouchAction): Promise<void> {
		const clampedX = Math.min(Math.max(x, 0), TOUCHPAD_WIDTH);
		const clampedY = Math.min(Math.max(y, 0), TOUCHPAD_HEIGHT);
		this._sendEvent("_hidT", {
			_ns: Number(process.hrtime.bigint() - this._baseTimestamp),
			_tFg: 1,
			_cx: clampedX,
			_tPh: mode,
			_cy: clampedY,
		});
	}

	async swipe(
		startX: number,
		startY: number,
		endX: number,
		endY: number,
		durationMs: number,
	): Promise<void> {
		const endTime = Number(process.hrtime.bigint()) + durationMs * 1000000;
		let x = startX;
		let y = startY;
		await this.hidEvent(Math.floor(x), Math.floor(y), TouchAction.Press);
		const sleepTime = TOUCHPAD_DELAY_MS;
		let currentTime = Number(process.hrtime.bigint());
		while (currentTime < endTime) {
			const remaining = endTime - currentTime;
			x = x + ((endX - x) * TOUCHPAD_DELAY_MS * 1000000) / remaining;
			y = y + ((endY - y) * TOUCHPAD_DELAY_MS * 1000000) / remaining;
			x = Math.min(Math.max(x, 0), TOUCHPAD_WIDTH);
			y = Math.min(Math.max(y, 0), TOUCHPAD_HEIGHT);
			await this.hidEvent(Math.floor(x), Math.floor(y), TouchAction.Hold);
			await new Promise<void>((resolve) => setTimeout(resolve, sleepTime));
			currentTime = Number(process.hrtime.bigint());
		}
		await this.hidEvent(endX, endY, TouchAction.Release);
	}

	async action(x: number, y: number, mode: TouchAction): Promise<void> {
		await this.hidEvent(x, y, mode);
	}

	async click(clickAction: InputAction): Promise<void> {
		if (
			clickAction === InputAction.SingleTap ||
			clickAction === InputAction.DoubleTap
		) {
			const count = clickAction === InputAction.SingleTap ? 1 : 2;
			for (let i = 0; i < count; i++) {
				await this._sendCommand("_hidC", { _hBtS: 1, _hidC: 6 });
				await new Promise<void>((resolve) => setTimeout(resolve, 20));
				await this._sendCommand("_hidC", { _hBtS: 2, _hidC: 6 });
				await this.hidEvent(TOUCHPAD_WIDTH, TOUCHPAD_HEIGHT, TouchAction.Click);
			}
		} else {
			// Hold
			await this._sendCommand("_hidC", { _hBtS: 1, _hidC: 6 });
			await new Promise<void>((resolve) => setTimeout(resolve, 1000));
			await this._sendCommand("_hidC", { _hBtS: 2, _hidC: 6 });
			await this.hidEvent(TOUCHPAD_WIDTH, TOUCHPAD_HEIGHT, TouchAction.Click);
		}
	}

	async mediacontrolCommand(
		command: MediaControlCommand,
		args?: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		return this._sendCommand("_mcc", { _mcc: command, ...(args ?? {}) });
	}

	private async _textInputStart(): Promise<Record<string, unknown>> {
		const response = await this._sendCommand("_tiStart", {});
		await Promise.all(
			this.dispatch("_tiStart", (response._c as EventMapping) ?? {}),
		);
		return response;
	}

	private async _textInputStop(): Promise<void> {
		await this._sendCommand("_tiStop", {});
	}

	async textInputCommand(
		text: string,
		clearPreviousInput = false,
	): Promise<string | null> {
		await this._textInputStop();
		const response = await this._textInputStart();
		const content = response._c as Record<string, unknown> | undefined;
		const tiData = content?._tiD as Buffer | undefined;

		if (!tiData) {
			return null;
		}

		const [sessionUuid, currentTextRaw] = keyedArchiver.readArchiveProperties(
			tiData,
			["sessionUUID"],
			["documentState", "docSt", "contextBeforeInput"],
		);

		const sessionUuidBuf = sessionUuid as Buffer;
		let currentText = (currentTextRaw as string) ?? "";

		if (clearPreviousInput) {
			this._sendEvent("_tiC", {
				_tiV: 1,
				_tiD: getRtiClearTextPayload(sessionUuidBuf),
			});
			currentText = "";
		}

		if (text) {
			this._sendEvent("_tiC", {
				_tiV: 1,
				_tiD: getRtiInputTextPayload(sessionUuidBuf, text),
			});
			currentText += text;
		}

		return currentText;
	}

	async fetchAttentionState(): Promise<SystemStatus> {
		const resp = await this._sendCommand("FetchAttentionState", {});
		const content = resp._c as Record<string, unknown> | undefined;

		if (!content) {
			throw new Error("missing content");
		}

		return content.state as SystemStatus;
	}

	private async _touchStart(): Promise<Record<string, unknown>> {
		this._baseTimestamp = process.hrtime.bigint();
		return this._sendCommand("_touchStart", {
			_height: TOUCHPAD_HEIGHT,
			_tFl: 0,
			_width: TOUCHPAD_WIDTH,
		});
	}

	private async _touchStop(): Promise<void> {
		await this._sendCommand("_touchStop", { _i: 1 });
	}
}
