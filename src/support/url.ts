export function isUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return Boolean(parsed.protocol && parsed.host);
	} catch {
		return false;
	}
}

export function isUrlOrScheme(url: string): boolean {
	try {
		const parsed = new URL(url);
		return Boolean(parsed.protocol);
	} catch {
		return false;
	}
}
