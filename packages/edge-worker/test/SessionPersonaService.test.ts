import { describe, expect, it } from "vitest";
import { SessionPersonaService } from "../src/SessionPersonaService.js";

describe("SessionPersonaService", () => {
	const service = new SessionPersonaService();

	it("detects pm persona from #pm tag", () => {
		expect(service.detectPersonaFromComment("please review #pm now")).toBe(
			"pm",
		);
	});

	it("detects plan persona from #plan tag", () => {
		expect(service.detectPersonaFromComment("please create #plan now")).toBe(
			"plan",
		);
	});

	it("returns default when no persona tag is present", () => {
		expect(service.detectPersonaFromComment("plain comment")).toBe("default");
	});

	it("strips both #pm and #plan tags from comment body", () => {
		expect(service.stripPersonaTags("  #plan build this #pm quickly  ")).toBe(
			"build this quickly",
		);
	});
});
