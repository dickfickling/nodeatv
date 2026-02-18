/**
 * Protocol registry - maps Protocol enum to protocol methods.
 */

import type { Protocol } from "../const.js";
import { Protocol as P } from "../const.js";
import type { Core, SetupData } from "../core/core.js";
import type {
	DevInfoExtractor,
	ScanHandlerDeviceInfoName,
	ServiceInfoMethod,
} from "../core/scan.js";
import * as airplay from "./airplay/index.js";
import * as companion from "./companion/index.js";
import * as dmap from "./dmap/index.js";
import * as mrp from "./mrp/index.js";
import * as raop from "./raop/index.js";

export interface ProtocolMethods {
	scan: () => Record<string, ScanHandlerDeviceInfoName>;
	setup: (core: Core) => Generator<SetupData>;
	pair: (core: Core, options?: Record<string, unknown>) => unknown;
	deviceInfo?: DevInfoExtractor;
	serviceInfo?: ServiceInfoMethod;
}

export const PROTOCOLS: Map<Protocol, ProtocolMethods> = new Map([
	[
		P.DMAP,
		{
			scan: dmap.scan,
			setup: dmap.setup,
			pair: dmap.pair,
			deviceInfo: dmap.deviceInfo,
			serviceInfo: dmap.serviceInfo,
		},
	],
	[
		P.MRP,
		{
			scan: mrp.scan,
			setup: mrp.setup,
			pair: mrp.pair,
			deviceInfo: mrp.deviceInfo,
			serviceInfo: mrp.serviceInfo,
		},
	],
	[
		P.Companion,
		{
			scan: companion.scan,
			setup: companion.setup,
			pair: companion.pair,
			deviceInfo: companion.deviceInfo,
			serviceInfo: companion.serviceInfo,
		},
	],
	[
		P.AirPlay,
		{
			scan: airplay.scan,
			setup: airplay.setup,
			pair: airplay.pair,
			deviceInfo: airplay.deviceInfo,
			serviceInfo: airplay.serviceInfo,
		},
	],
	[
		P.RAOP,
		{
			scan: raop.scan,
			setup: raop.setup,
			pair: raop.pair,
			deviceInfo: raop.deviceInfo,
			serviceInfo: raop.serviceInfo,
		},
	],
]);
