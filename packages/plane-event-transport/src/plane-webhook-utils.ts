import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Plane's X-Plane-Signature: HMAC-SHA256 hex digest (no prefix) of the
 * exact raw request body, keyed by the webhook's secret. Always compare the
 * raw received bytes — never a re-serialized JSON object.
 */
export function verifyPlaneSignature(
	rawBody: string | Buffer,
	signatureHeader: string | undefined,
	secret: string,
): boolean {
	if (!signatureHeader || !secret) return false;
	const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
	const a = Buffer.from(expected);
	const b = Buffer.from(signatureHeader);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * In-memory LRU over X-Plane-Delivery ids. Plane retries at ~10/30 min on
 * non-200; this keeps redelivered payloads idempotent within a process
 * lifetime (a restart may reprocess a retry — acceptable for the PoC).
 */
export class DeliveryDeduper {
	private readonly ids = new Set<string>();
	constructor(private readonly capacity: number = 1000) {}

	/** Returns true if this delivery id was already processed. */
	seen(deliveryId: string | undefined): boolean {
		if (!deliveryId) return false;
		if (this.ids.has(deliveryId)) return true;
		this.ids.add(deliveryId);
		if (this.ids.size > this.capacity) {
			const oldest = this.ids.values().next().value;
			if (oldest !== undefined) this.ids.delete(oldest);
		}
		return false;
	}
}
