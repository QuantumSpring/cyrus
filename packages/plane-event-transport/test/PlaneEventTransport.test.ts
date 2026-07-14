import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaneEventTransport } from "../src/PlaneEventTransport.js";
import { createdWebhookFixture } from "./fixtures.js";

const SECRET = "hook-secret";

function createMockFastify() {
	const routes: Record<
		string,
		(req: unknown, reply: unknown) => Promise<unknown>
	> = {};
	return {
		post: vi.fn(
			(path: string, optsOrHandler: unknown, maybeHandler?: unknown) => {
				routes[path] = (maybeHandler ??
					optsOrHandler) as (typeof routes)[string];
			},
		),
		routes,
	};
}

function makeRequest(
	body: unknown,
	secret = SECRET,
	overrides: Record<string, string | undefined> = {},
) {
	const raw = JSON.stringify(body);
	return {
		body,
		rawBody: raw,
		headers: {
			"x-plane-signature": createHmac("sha256", secret)
				.update(raw)
				.digest("hex"),
			"x-plane-event": "agent_run",
			"x-plane-delivery": overrides.delivery ?? "d-1",
			...overrides,
		},
	};
}

function makeReply() {
	return { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
}

describe("PlaneEventTransport", () => {
	let fastify: ReturnType<typeof createMockFastify>;
	let transport: PlaneEventTransport;

	beforeEach(() => {
		fastify = createMockFastify();
		transport = new PlaneEventTransport({
			platform: "plane",
			fastifyServer: fastify as any,
			verificationMode: "direct",
			secret: SECRET,
		});
		transport.register();
	});

	it("registers POST /plane/webhook", () => {
		expect(fastify.routes["/plane/webhook"]).toBeDefined();
	});

	it("emits an AgentSessionEvent for a validly signed agent_run webhook", async () => {
		const events: unknown[] = [];
		transport.on("event", (event) => events.push(event));
		const reply = makeReply();
		await fastify.routes["/plane/webhook"](
			makeRequest(createdWebhookFixture),
			reply,
		);
		expect(reply.code).toHaveBeenCalledWith(200);
		expect(events).toHaveLength(1);
		expect((events[0] as { type: string }).type).toBe("AgentSessionEvent");
	});

	it("rejects an invalid signature with 401 and emits nothing", async () => {
		const events: unknown[] = [];
		transport.on("event", (event) => events.push(event));
		const reply = makeReply();
		await fastify.routes["/plane/webhook"](
			makeRequest(createdWebhookFixture, "wrong"),
			reply,
		);
		expect(reply.code).toHaveBeenCalledWith(401);
		expect(events).toHaveLength(0);
	});

	it("acks duplicate deliveries with 200 but emits only once", async () => {
		const events: unknown[] = [];
		transport.on("event", (event) => events.push(event));
		await fastify.routes["/plane/webhook"](
			makeRequest(createdWebhookFixture),
			makeReply(),
		);
		const reply = makeReply();
		await fastify.routes["/plane/webhook"](
			makeRequest(createdWebhookFixture),
			reply,
		);
		expect(reply.code).toHaveBeenCalledWith(200);
		expect(events).toHaveLength(1);
	});

	it("acks non-agent_run events with 200 and emits nothing", async () => {
		const events: unknown[] = [];
		transport.on("event", (event) => events.push(event));
		const reply = makeReply();
		await fastify.routes["/plane/webhook"](
			makeRequest({ event: "issue", action: "created" }, SECRET, {
				delivery: "d-2",
			}),
			reply,
		);
		expect(reply.code).toHaveBeenCalledWith(200);
		expect(events).toHaveLength(0);
	});
});
