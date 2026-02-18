#!/usr/bin/env node

/**
 * nodeatv CLI — scan, pair, connect, and control Apple TV from the terminal.
 */

import * as readline from "node:readline";
import { Protocol } from "./const.js";
import * as convert from "./convert.js";
import type { BaseConfig } from "./interface.js";
import { scan, pair, connect } from "./orchestration.js";
import { FileStorage } from "./storage/fileStorage.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
	console.log(msg);
}

function error(msg: string): void {
	console.error(`Error: ${msg}`);
}

interface PairingHandler {
	begin(): Promise<void>;
	pin(code: number | string): void;
	finish(): Promise<void>;
	close(): Promise<void>;
	get hasPaired(): boolean;
}

async function loadStorage(): Promise<FileStorage> {
	const storage = FileStorage.defaultStorage();
	await storage.load();
	return storage;
}

function parseArgs(): { command: string; host: string | null } {
	const args = process.argv.slice(2);
	let command = "";
	let host: string | null = null;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--host" && i + 1 < args.length) {
			host = args[++i];
		} else if (!command) {
			command = args[i];
		}
	}

	return { command, host };
}

function askQuestion(prompt: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(prompt, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

async function pickDevice(devices: BaseConfig[]): Promise<BaseConfig> {
	if (devices.length === 0) {
		throw new Error("no devices found");
	}
	if (devices.length === 1) {
		return devices[0];
	}

	log("\nMultiple devices found:");
	for (let i = 0; i < devices.length; i++) {
		log(`  ${i + 1}) ${devices[i].name} (${devices[i].address})`);
	}

	const answer = await askQuestion("\nSelect device number: ");
	const index = Number.parseInt(answer, 10) - 1;
	if (index < 0 || index >= devices.length || Number.isNaN(index)) {
		throw new Error("invalid selection");
	}
	return devices[index];
}

async function scanDevices(
	host: string | null,
): Promise<{ devices: BaseConfig[]; storage: FileStorage }> {
	const storage = await loadStorage();
	log("Scanning for Apple TVs...");
	const devices = await scan({
		timeout: 5,
		storage,
		hosts: host ? [host] : undefined,
	});
	return { devices, storage };
}

// ── Supported one-shot commands ──────────────────────────────────────────────

const ONE_SHOT_COMMANDS: Record<
	string,
	(rc: { remoteControl: RemoteControlIface }) => Promise<void>
> = {
	menu: (atv) => atv.remoteControl.menu(),
	select: (atv) => atv.remoteControl.select(),
	play: (atv) => atv.remoteControl.play(),
	pause: (atv) => atv.remoteControl.pause(),
	play_pause: (atv) => atv.remoteControl.playPause(),
	stop: (atv) => atv.remoteControl.stop(),
	up: (atv) => atv.remoteControl.up(),
	down: (atv) => atv.remoteControl.down(),
	left: (atv) => atv.remoteControl.left(),
	right: (atv) => atv.remoteControl.right(),
	home: (atv) => atv.remoteControl.home(),
	top_menu: (atv) => atv.remoteControl.topMenu(),
	volume_up: (atv) => atv.remoteControl.volumeUp(),
	volume_down: (atv) => atv.remoteControl.volumeDown(),
	next: (atv) => atv.remoteControl.next(),
	previous: (atv) => atv.remoteControl.previous(),
	suspend: (atv) => atv.remoteControl.suspend(),
	wakeup: (atv) => atv.remoteControl.wakeup(),
	screensaver: (atv) => atv.remoteControl.screensaver(),
};

type RemoteControlIface = import("./core/facade.js").FacadeRemoteControl;

// ── Subcommands ──────────────────────────────────────────────────────────────

async function cmdScan(host: string | null): Promise<void> {
	const { devices } = await scanDevices(host);

	if (devices.length === 0) {
		log("No Apple TVs found.");
		return;
	}

	for (let i = 0; i < devices.length; i++) {
		const d = devices[i];
		const protocols = d.services
			.map((s) => {
				const name = convert.protocolStr(s.protocol);
				const paired = s.credentials ? " (paired)" : "";
				return `${name}${paired}`;
			})
			.join(", ");

		log(
			`  ${i + 1}) ${d.name}  ${d.address}  ${d.deviceInfo.modelStr}  [${protocols}]`,
		);
	}
}

async function cmdPair(host: string | null): Promise<void> {
	const { devices, storage } = await scanDevices(host);

	if (devices.length === 0) {
		error("no devices found");
		process.exit(1);
	}

	const device = await pickDevice(devices);

	// Try Companion first, then AirPlay
	const protocolsToTry = [Protocol.Companion, Protocol.AirPlay];
	let paired = false;

	for (const protocol of protocolsToTry) {
		const service = device.getService(protocol);
		if (!service) continue;

		log(
			`Pairing with ${device.name} via ${convert.protocolStr(protocol)}...`,
		);

		let handler: PairingHandler;
		try {
			handler = (await pair(device, protocol, { storage })) as PairingHandler;
		} catch {
			continue;
		}

		try {
			await handler.begin();

			const pin = await askQuestion("Enter PIN displayed on Apple TV: ");
			handler.pin(pin);

			await handler.finish();

			if (handler.hasPaired) {
				await storage.updateSettings(device);
				await storage.save();
				log(`Paired successfully with ${device.name}!`);
				paired = true;
			} else {
				error("pairing was not completed");
			}
		} catch (e) {
			error(`pairing failed: ${e instanceof Error ? e.message : e}`);
		} finally {
			try {
				await handler.close();
			} catch {
				// ignore close errors
			}
		}

		if (paired) break;
	}

	if (!paired) {
		error("could not pair with any supported protocol");
		process.exit(1);
	}
}

async function cmdRemote(host: string | null): Promise<void> {
	const { devices, storage } = await scanDevices(host);

	if (devices.length === 0) {
		error("no devices found");
		process.exit(1);
	}

	const device = await pickDevice(devices);

	log(`Connecting to ${device.name}...`);
	const atv = await connect(device, { storage });

	log("\nInteractive remote control. Keys:");
	log("  Arrow keys  → navigate");
	log("  Enter       → select");
	log("  Escape      → menu");
	log("  Backspace   → menu");
	log("  Space       → play/pause");
	log("  h           → home");
	log("  +/-         → volume up/down");
	log("  q / Ctrl-C  → quit");
	log("");

	const stdin = process.stdin;
	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding("utf8");

	const cleanup = async () => {
		stdin.setRawMode(false);
		stdin.pause();
		try {
			await atv.close();
		} catch {
			// ignore
		}
		log("\nDisconnected.");
		process.exit(0);
	};

	stdin.on("data", async (key: string) => {
		try {
			// Ctrl-C
			if (key === "\u0003" || key === "q") {
				await cleanup();
				return;
			}

			// Escape sequences for arrow keys
			if (key === "\x1b[A") {
				await atv.remoteControl.up();
			} else if (key === "\x1b[B") {
				await atv.remoteControl.down();
			} else if (key === "\x1b[C") {
				await atv.remoteControl.right();
			} else if (key === "\x1b[D") {
				await atv.remoteControl.left();
			}
			// Enter
			else if (key === "\r" || key === "\n") {
				await atv.remoteControl.select();
			}
			// Escape (bare, not part of arrow sequence)
			else if (key === "\x1b") {
				await atv.remoteControl.menu();
			}
			// Backspace
			else if (key === "\x7f" || key === "\b") {
				await atv.remoteControl.menu();
			}
			// Space
			else if (key === " ") {
				await atv.remoteControl.playPause();
			}
			// Home
			else if (key === "h") {
				await atv.remoteControl.home();
			}
			// Volume
			else if (key === "+") {
				await atv.remoteControl.volumeUp();
			} else if (key === "-") {
				await atv.remoteControl.volumeDown();
			}
		} catch (e) {
			error(`command failed: ${e instanceof Error ? e.message : e}`);
		}
	});
}

async function cmdOneShot(
	command: string,
	host: string | null,
): Promise<void> {
	const { devices, storage } = await scanDevices(host);

	if (devices.length === 0) {
		error("no devices found");
		process.exit(1);
	}

	const device = await pickDevice(devices);

	log(`Connecting to ${device.name}...`);
	const atv = await connect(device, { storage });

	try {
		await ONE_SHOT_COMMANDS[command](atv);
		log(`Sent: ${command}`);
	} catch (e) {
		error(`command failed: ${e instanceof Error ? e.message : e}`);
		process.exit(1);
	} finally {
		try {
			await atv.close();
		} catch {
			// ignore
		}
	}
}

// ── Usage ────────────────────────────────────────────────────────────────────

function printUsage(): void {
	log("Usage: nodeatv <command> [--host <ip>]");
	log("");
	log("Commands:");
	log("  scan                   Discover Apple TVs on the network");
	log("  pair                   Pair with a device (prompts for PIN)");
	log("  remote                 Interactive remote control mode");
	log(`  <command>              One-shot command: ${Object.keys(ONE_SHOT_COMMANDS).join(", ")}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const { command, host } = parseArgs();

	if (!command || command === "help" || command === "--help") {
		printUsage();
		return;
	}

	if (command === "scan") {
		await cmdScan(host);
	} else if (command === "pair") {
		await cmdPair(host);
	} else if (command === "remote") {
		await cmdRemote(host);
	} else if (command in ONE_SHOT_COMMANDS) {
		await cmdOneShot(command, host);
	} else {
		error(`unknown command: ${command}`);
		printUsage();
		process.exit(1);
	}
}

main().catch((e) => {
	error(e instanceof Error ? e.message : String(e));
	process.exit(1);
});
