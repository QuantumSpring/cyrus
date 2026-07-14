import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	DeliveryDeduper,
	verifyPlaneSignature,
} from "../src/plane-webhook-utils.js";

const SECRET = "test-secret";
const body = JSON.stringify({ hello: "world" });
const sign = (payload: string, secret: string) =>
	createHmac("sha256", secret).update(payload).digest("hex");

describe("verifyPlaneSignature", () => {
	it("accepts a valid signature over the raw body", () => {
		expect(verifyPlaneSignature(body, sign(body, SECRET), SECRET)).toBe(true);
	});
	it("rejects a signature made with a different secret", () => {
		expect(verifyPlaneSignature(body, sign(body, "other"), SECRET)).toBe(false);
	});
	it("rejects a tampered body", () => {
		expect(verifyPlaneSignature(`${body} `, sign(body, SECRET), SECRET)).toBe(
			false,
		);
	});
	it("rejects missing/malformed headers without throwing", () => {
		expect(verifyPlaneSignature(body, undefined, SECRET)).toBe(false);
		expect(verifyPlaneSignature(body, "", SECRET)).toBe(false);
		expect(verifyPlaneSignature(body, "zz-not-hex", SECRET)).toBe(false);
	});
});

describe("DeliveryDeduper", () => {
	it("flags repeat delivery ids", () => {
		const deduper = new DeliveryDeduper(3);
		expect(deduper.seen("a")).toBe(false);
		expect(deduper.seen("a")).toBe(true);
	});
	it("evicts oldest beyond capacity", () => {
		const deduper = new DeliveryDeduper(2);
		deduper.seen("a");
		deduper.seen("b");
		deduper.seen("c"); // evicts "a"
		expect(deduper.seen("a")).toBe(false);
	});
	it("treats undefined delivery id as never seen", () => {
		const deduper = new DeliveryDeduper(2);
		expect(deduper.seen(undefined)).toBe(false);
		expect(deduper.seen(undefined)).toBe(false);
	});
});
