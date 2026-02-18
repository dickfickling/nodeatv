import { describe, expect, it } from "vitest";
import { Protocol } from "../../src/const.js";
import { Relayer } from "../../src/core/relayer.js";
import { InvalidStateError, NotSupportedError } from "../../src/exceptions.js";

class BaseClass {
	noArgs(): string | undefined {
		return undefined;
	}

	withArgs(_arg: number): number | undefined {
		return undefined;
	}

	withKwargs(_opts: { a: number; b: number }): number | undefined {
		return undefined;
	}

	get prop(): number | undefined {
		return undefined;
	}

	async asyncNoArgs(): Promise<string | undefined> {
		return undefined;
	}

	async asyncWithArgs(_arg: number): Promise<number | undefined> {
		return undefined;
	}
}

class SubClass1 extends BaseClass {
	noArgs(): string {
		return "subclass1";
	}

	withArgs(arg: number): number {
		return arg * 2;
	}

	withKwargs(opts: { a: number; b: number }): number {
		return opts.a * opts.b;
	}

	get prop(): number {
		return 123;
	}

	async asyncNoArgs(): Promise<string> {
		return "subclass1";
	}

	async asyncWithArgs(arg: number): Promise<number> {
		return arg * 2;
	}
}

class SubClass2 extends BaseClass {
	withArgs(arg: number): number {
		return arg;
	}
}

class SubClass3 extends BaseClass {
	withKwargs(opts: { a: number; b: number }): number {
		return opts.a - opts.b;
	}
}

class SubClass4 extends BaseClass {
	private retString: string;

	constructor(retString: string) {
		super();
		this.retString = retString;
	}

	noArgs(): string {
		return this.retString;
	}
}

describe("Relayer", () => {
	it("handles base cases", async () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP]);
		relayer.register(new SubClass1(), Protocol.MRP);

		expect((relayer.relay("noArgs") as () => string)()).toBe("subclass1");
		expect((relayer.relay("withArgs") as (a: number) => number)(3)).toBe(6);
		expect(
			(relayer.relay("withKwargs") as (o: { a: number; b: number }) => number)({
				a: 2,
				b: 3,
			}),
		).toBe(6);
		expect(relayer.relay("prop")).toBe(123);
		expect(
			await (relayer.relay("asyncNoArgs") as () => Promise<string>)(),
		).toBe("subclass1");
		expect(
			await (relayer.relay("asyncWithArgs") as (a: number) => Promise<number>)(
				3,
			),
		).toBe(6);
	});

	it("respects class priority", () => {
		const relayer = new Relayer(BaseClass, [
			Protocol.MRP,
			Protocol.DMAP,
			Protocol.AirPlay,
		]);
		relayer.register(new SubClass1(), Protocol.AirPlay);
		relayer.register(new SubClass3(), Protocol.MRP);
		relayer.register(new SubClass2(), Protocol.DMAP);

		expect((relayer.relay("noArgs") as () => string)()).toBe("subclass1");
		expect((relayer.relay("withArgs") as (a: number) => number)(3)).toBe(3);
		expect(
			(relayer.relay("withKwargs") as (o: { a: number; b: number }) => number)({
				a: 4,
				b: 1,
			}),
		).toBe(3);
	});

	it("raises NotSupportedError when no instance", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP]);
		expect(() => relayer.relay("noArgs")).toThrow(NotSupportedError);
	});

	it("raises NotSupportedError for unimplemented method", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP]);
		relayer.register(new SubClass2(), Protocol.MRP);
		expect(() => relayer.relay("noArgs")).toThrow(NotSupportedError);
	});

	it("raises Error for method not in interface", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP]);
		relayer.register(new SubClass2(), Protocol.MRP);
		expect(() => relayer.relay("missingMethod")).toThrow(Error);
	});

	it("raises Error when registering not-in-priority protocol", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP]);
		expect(() => relayer.register(new SubClass1(), Protocol.DMAP)).toThrow();
	});

	it("supports override priority", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP, Protocol.DMAP]);
		relayer.register(new SubClass1(), Protocol.DMAP);
		relayer.register(new SubClass2(), Protocol.MRP);

		expect(
			(
				relayer.relay("withArgs", [Protocol.MRP, Protocol.DMAP]) as (
					a: number,
				) => number
			)(3),
		).toBe(3);
		expect(
			(
				relayer.relay("withArgs", [Protocol.DMAP, Protocol.MRP]) as (
					a: number,
				) => number
			)(3),
		).toBe(6);
	});

	it("returns main instance", () => {
		const instance2 = new SubClass2();
		const relayer = new Relayer(BaseClass, [
			Protocol.MRP,
			Protocol.DMAP,
			Protocol.AirPlay,
		]);
		relayer.register(new SubClass1(), Protocol.DMAP);
		relayer.register(new SubClass3(), Protocol.AirPlay);
		relayer.register(instance2, Protocol.MRP);

		expect(relayer.mainInstance).toBe(instance2);
	});

	it("throws on missing main instance", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP]);
		expect(() => relayer.mainInstance).toThrow(NotSupportedError);
	});

	it("returns main protocol", () => {
		const relayer = new Relayer(BaseClass, [
			Protocol.MRP,
			Protocol.DMAP,
			Protocol.AirPlay,
		]);

		relayer.register(new SubClass1(), Protocol.AirPlay);
		expect(relayer.mainProtocol).toBe(Protocol.AirPlay);

		relayer.register(new SubClass1(), Protocol.DMAP);
		expect(relayer.mainProtocol).toBe(Protocol.DMAP);

		relayer.register(new SubClass1(), Protocol.MRP);
		expect(relayer.mainProtocol).toBe(Protocol.MRP);
	});

	it("returns null when no main protocol", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP]);
		expect(relayer.mainProtocol).toBeNull();
	});

	it("takeover overrides main protocol", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP, Protocol.DMAP]);
		relayer.register(new SubClass4("mrp"), Protocol.MRP);
		relayer.register(new SubClass4("dmap"), Protocol.DMAP);

		relayer.takeover(Protocol.DMAP);
		expect(relayer.mainProtocol).toBe(Protocol.DMAP);
	});

	it("gets instance of type", () => {
		const instance1 = new SubClass1();
		const instance2 = new SubClass2();
		const relayer = new Relayer(BaseClass, [
			Protocol.MRP,
			Protocol.DMAP,
			Protocol.AirPlay,
		]);
		relayer.register(instance1, Protocol.MRP);
		relayer.register(instance2, Protocol.DMAP);

		expect(relayer.get(Protocol.MRP)).toBe(instance1);
		expect(relayer.get(Protocol.DMAP)).toBe(instance2);
		expect(relayer.get(Protocol.AirPlay)).toBeNull();
	});

	it("takeover and release", () => {
		const relayer = new Relayer(BaseClass, [
			Protocol.MRP,
			Protocol.DMAP,
			Protocol.AirPlay,
		]);
		relayer.register(new SubClass4("airplay"), Protocol.AirPlay);
		relayer.register(new SubClass4("mrp"), Protocol.MRP);
		relayer.register(new SubClass4("dmap"), Protocol.DMAP);

		expect((relayer.relay("noArgs") as () => string)()).toBe("mrp");

		relayer.takeover(Protocol.AirPlay);
		expect((relayer.relay("noArgs") as () => string)()).toBe("airplay");

		relayer.release();
		expect((relayer.relay("noArgs") as () => string)()).toBe("mrp");
	});

	it("throws on double takeover", () => {
		const relayer = new Relayer(BaseClass, [Protocol.AirPlay]);
		relayer.register(new SubClass4("airplay"), Protocol.AirPlay);
		relayer.takeover(Protocol.DMAP);

		expect(() => relayer.takeover(Protocol.DMAP)).toThrow(InvalidStateError);
	});

	it("takeover overrides manual priority", () => {
		const relayer = new Relayer(BaseClass, [
			Protocol.MRP,
			Protocol.DMAP,
			Protocol.AirPlay,
		]);
		relayer.register(new SubClass4("airplay"), Protocol.AirPlay);
		relayer.register(new SubClass4("mrp"), Protocol.MRP);
		relayer.register(new SubClass4("dmap"), Protocol.DMAP);

		relayer.takeover(Protocol.AirPlay);

		expect(
			(
				relayer.relay("noArgs", [
					Protocol.DMAP,
					Protocol.MRP,
					Protocol.AirPlay,
				]) as () => string
			)(),
		).toBe("airplay");
	});

	it("takeover overrides main instance", () => {
		const relayer = new Relayer(BaseClass, [Protocol.MRP, Protocol.DMAP]);
		relayer.register(new SubClass4("mrp"), Protocol.MRP);
		relayer.register(new SubClass4("dmap"), Protocol.DMAP);

		relayer.takeover(Protocol.DMAP);
		expect(relayer.mainInstance.noArgs()).toBe("dmap");
	});

	it("gets all instances", () => {
		const mrp = new SubClass4("mrp");
		const dmap = new SubClass4("dmap");
		const airplay = new SubClass4("airplay");

		const relayer = new Relayer(BaseClass, [
			Protocol.MRP,
			Protocol.DMAP,
			Protocol.AirPlay,
		]);
		relayer.register(mrp, Protocol.MRP);
		relayer.register(dmap, Protocol.DMAP);
		relayer.register(airplay, Protocol.AirPlay);

		const instances = relayer.instances;
		expect(instances.length).toBe(3);
		expect(instances).toContain(mrp);
		expect(instances).toContain(dmap);
		expect(instances).toContain(airplay);
	});
});
