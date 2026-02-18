/**
 * Top-level orchestration functions: scan, connect, pair.
 */

import type { Protocol } from "./const.js";
import { type CoreStateDispatcher, createCore } from "./core/core.js";
import { FacadeAppleTV } from "./core/facade.js";
import { MessageDispatcher } from "./core/protocol.js";
import { MulticastMdnsScanner, UnicastMdnsScanner } from "./core/scan.js";
import type { BaseConfig } from "./interface.js";
import { PROTOCOLS } from "./protocols/index.js";
import { createSettings } from "./settings.js";
import type { AbstractStorage } from "./storage/index.js";
import { createSession } from "./support/http.js";
import { StateProducer } from "./support/stateProducer.js";

export interface ScanOptions {
	timeout?: number;
	identifier?: string | Set<string>;
	protocol?: Protocol | Set<Protocol>;
	hosts?: string[];
	storage?: AbstractStorage;
}

export interface ConnectOptions {
	protocol?: Protocol;
	storage?: AbstractStorage;
}

export interface PairOptions {
	storage?: AbstractStorage;
}

/**
 * Scan for Apple TV devices on the network.
 */
export async function scan(options?: ScanOptions): Promise<BaseConfig[]> {
	const timeout = options?.timeout ?? 5;
	const hosts = options?.hosts;

	const scanner = hosts
		? new UnicastMdnsScanner(hosts)
		: new MulticastMdnsScanner(
				options?.identifier
					? typeof options.identifier === "string"
						? options.identifier
						: options.identifier
					: undefined,
			);

	for (const [protocol, methods] of PROTOCOLS) {
		const scanHandlers = methods.scan();
		for (const [serviceType, handlerDeviceInfoName] of Object.entries(
			scanHandlers,
		)) {
			scanner.addService(
				serviceType,
				handlerDeviceInfoName,
				methods.deviceInfo ?? (() => ({})),
			);
		}
		if (methods.serviceInfo) {
			scanner.addServiceInfo(protocol, methods.serviceInfo);
		}
	}

	const devices = await scanner.discover(timeout);
	let results = [...devices.values()];

	// Filter by protocol
	if (options?.protocol) {
		const protocols =
			options.protocol instanceof Set
				? options.protocol
				: new Set([options.protocol]);
		results = results.filter((config) =>
			config.services.some((s) => protocols.has(s.protocol)),
		);
	}

	// Filter by identifier
	if (options?.identifier) {
		const identifiers =
			typeof options.identifier === "string"
				? new Set([options.identifier])
				: options.identifier;
		results = results.filter((config) => {
			const configId = config.identifier;
			if (configId && identifiers.has(configId)) return true;
			return config.allIdentifiers.some((id) => identifiers.has(id));
		});
	}

	// Apply stored settings
	if (options?.storage) {
		for (const config of results) {
			try {
				const settings = await options.storage.getSettings(config);
				for (const service of config.services) {
					const protocolKey = _protocolSettingsKey(service.protocol);
					if (protocolKey) {
						const protSettings =
							settings.protocols[
								protocolKey as keyof typeof settings.protocols
							];
						if (protSettings && "credentials" in protSettings) {
							service.apply(protSettings as Record<string, unknown>);
						}
					}
				}
			} catch {
				// Skip if no settings found
			}
		}
	}

	return results;
}

/**
 * Connect to an Apple TV device.
 */
export async function connect(
	config: BaseConfig,
	options?: ConnectOptions,
): Promise<FacadeAppleTV> {
	if (config.services.length === 0) {
		throw new Error("no services in config");
	}

	const settings = options?.storage
		? await options.storage.getSettings(config)
		: createSettings();

	const deviceListener = new StateProducer<object>();
	const coreDispatcher = new MessageDispatcher() as CoreStateDispatcher;
	const sessionManager = await createSession();

	const facade = new FacadeAppleTV(config);

	for (const [protocol, methods] of PROTOCOLS) {
		const service = config.getService(protocol);
		if (!service || !service.enabled) continue;
		if (options?.protocol && options.protocol !== protocol) continue;

		const core = await createCore(config, service, {
			settings,
			deviceListener,
			sessionManager,
			coreDispatcher,
			takeoverMethod: (..._args: unknown[]) => facade.takeover(protocol),
		});

		const generator = methods.setup(core);
		for (const setupData of generator) {
			facade.addSetupData(setupData);
		}
	}

	await facade.connect();
	return facade;
}

/**
 * Create a pairing handler for a protocol.
 */
export async function pair(
	config: BaseConfig,
	protocol: Protocol,
	options?: PairOptions,
): Promise<unknown> {
	const service = config.getService(protocol);
	if (!service) {
		throw new Error(`no service for protocol ${protocol}`);
	}

	const methods = PROTOCOLS.get(protocol);
	if (!methods) {
		throw new Error(`unknown protocol: ${protocol}`);
	}

	const settings = options?.storage
		? await options.storage.getSettings(config)
		: createSettings();

	const deviceListener = new StateProducer<object>();
	const coreDispatcher = new MessageDispatcher() as CoreStateDispatcher;
	const sessionManager = await createSession();

	const core = await createCore(config, service, {
		settings,
		deviceListener,
		sessionManager,
		coreDispatcher,
	});

	return methods.pair(core);
}

function _protocolSettingsKey(protocol: Protocol): string | null {
	const map: Record<number, string> = {
		1: "dmap",
		2: "mrp",
		3: "airplay",
		4: "companion",
		5: "raop",
	};
	return map[protocol as number] ?? null;
}
