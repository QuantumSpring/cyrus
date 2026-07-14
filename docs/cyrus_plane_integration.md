# Cyrus Plane Transport Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `plane` platform to the Cyrus fork (`/Users/ondrej/Dev/cyrus`, branch off `dev`) — a `plane-event-transport` package (webhook receiver + translator + `PlaneIssueTrackerService`) wired into EdgeWorker — so a local Plane instance can trigger Claude Code sessions and receive streamed AgentRunActivities.

**Architecture:** `PlaneEventTransport` mounts `POST /plane/webhook` on the shared Fastify server, verifies the raw-body HMAC, dedupes deliveries, and translates the Plane `agent_run` payload into **Linear-SDK-shaped `AgentSessionEvent` webhooks emitted on the legacy `"event"` channel** — that is the path the CLI platform uses and the only one EdgeWorker's session machinery actually implements (the `InternalMessage` handlers at `EdgeWorker.ts:2414-2489` are TODO stubs). `PlaneIssueTrackerService` implements the `IIssueTrackerService` hot path against the fork's Cloud-mirror API using the pinned official SDK for runs/activities and plain `fetch` for issues/comments/states.

**Tech Stack:** TypeScript (NodeNext), pnpm workspace (no turbo), Fastify 5, vitest, `@makeplane/plane-node-sdk@0.2.11` (pinned exact), biome.

**Spec:** `/Users/ondrej/Dev/plane/docs/superpowers/specs/2026-07-14-cyrus-plane-integration-design.md`
**Depends on:** Plan 1 (`2026-07-14-plane-agents-api.md`) — specifically its **canonical webhook payload** (copied into the fixture in Task 2) and a locally running Plane with the Agents API for the E2E task.

> **Spec deviation (documented):** the spec names `PlaneMessageTranslator` producing internal *session-created*/*session-prompted* messages. In the current fork those internal-message handlers are unimplemented stubs; sessions run only via the legacy `"event"` channel with Linear-shaped payloads. This plan therefore builds `PlaneWebhookTranslator` targeting that working path. Same seams, same behavior, honest naming.

**Branch:**
```bash
cd /Users/ondrej/Dev/cyrus && git checkout dev && git pull && git checkout -b feat/plane-transport
```

**Test/build commands:**
```bash
pnpm install                                        # after adding the package / deps
pnpm --filter cyrus-plane-event-transport test:run  # single package tests
pnpm --filter cyrus-plane-event-transport build
pnpm build                                          # whole workspace
pnpm typecheck
pnpm lint                                           # biome check
```

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/issue-tracker/index.ts:106` | Modify | add `"plane"` to `SUPPORTED_PLATFORMS` |
| `packages/core/src/issue-tracker/IAgentEventTransport.ts` | Modify | `PlaneEventTransportConfig` + union |
| `packages/core/src/config-types.ts:96` | Modify | `platform?: "linear" \| "cli" \| "plane"` |
| `packages/core/src/config-schemas.ts:130-167` | Modify | optional `planeWorkspaceSlug`/`planeProjectId` on `RepositoryConfig` |
| `packages/plane-event-transport/` | Create | the new package (see scaffold) |
| `packages/edge-worker/package.json` | Modify | dep `cyrus-plane-event-transport: workspace:*` |
| `packages/edge-worker/src/EdgeWorker.ts` | Modify | tracker branches (~:362, ~:2027), `initializeComponents` plane branch (~:577), `skipTunnel` (~:334) |
| `packages/edge-worker/src/AgentSessionManager.ts:164` | Modify | accept + stream `"plane"` platform |
| `apps/cli/src/services/WorkerService.ts:200-256` | Modify | set `platform` from `CYRUS_PLATFORM` env |

Package scaffold (copy layout from `packages/github-event-transport/`):
```
packages/plane-event-transport/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                      # barrel
    types.ts                      # PlaneAgentRunWebhook payload types + transport config
    plane-webhook-utils.ts        # HMAC verify (raw bytes) + delivery dedupe
    PlaneWebhookTranslator.ts     # Plane payload → AgentSessionEvent-shaped webhook
    PlaneEventTransport.ts        # Fastify route, verify, dedupe, translate, emit("event")
    PlaneIssueTrackerService.ts   # IIssueTrackerService impl (SDK + fetch)
  test/
    fixtures.ts                   # canonical payloads from Plan 1
    plane-webhook-utils.test.ts
    PlaneWebhookTranslator.test.ts
    PlaneEventTransport.test.ts
    PlaneIssueTrackerService.test.ts
  scripts/
    replay-webhook.mjs            # signs a fixture and POSTs it to a running Cyrus
```

---

### Task 1: Core registration

**Files:**
- Modify: `packages/core/src/issue-tracker/index.ts:106`, `packages/core/src/issue-tracker/IAgentEventTransport.ts`, `packages/core/src/config-types.ts:96`, `packages/core/src/config-schemas.ts:130-167`

- [ ] **Step 1: SUPPORTED_PLATFORMS**

In `packages/core/src/issue-tracker/index.ts:106`:
```ts
export const SUPPORTED_PLATFORMS = ["linear", "cli", "plane"] as const;
```

- [ ] **Step 2: Transport config union**

In `packages/core/src/issue-tracker/IAgentEventTransport.ts`, next to the existing config variants add:
```ts
export interface PlaneEventTransportConfig extends AgentEventTransportConfigBase {
	platform: "plane";
	verificationMode: "direct"; // Plane signs with the webhook's shared secret
	secret: string; // PLANE_WEBHOOK_SECRET
}
```
and extend the union (currently at lines 65-68):
```ts
export type AgentEventTransportConfig =
	| LinearDirectEventTransportConfig
	| LinearProxyEventTransportConfig
	| CLIEventTransportConfig
	| PlaneEventTransportConfig;
```

- [ ] **Step 3: Runtime platform type**

In `packages/core/src/config-types.ts:96`:
```ts
	platform?: "linear" | "cli" | "plane";
```

- [ ] **Step 4: Repository config fields**

In `packages/core/src/config-schemas.ts` inside the `RepositoryConfig` zod object (lines 130-167), after the linear fields add:
```ts
	planeWorkspaceSlug: z.string().optional(),
	planeProjectId: z.string().optional(),
```
Check whether `linearToken`/`linearWorkspaceId` are required in the schema; if so, leave them (ConfigService does not enforce zod on load — `ConfigService.ts:30` — and the PoC config will carry empty strings for them; note this in the config example in Task 9).

- [ ] **Step 5: Build + typecheck core**

Run: `pnpm --filter cyrus-core build && pnpm --filter cyrus-core typecheck`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/
git commit -m "feat(plane): register plane platform in core (SUPPORTED_PLATFORMS, transport config, repo fields)"
```

---

### Task 2: Package scaffold + payload types + fixtures

**Files:**
- Create: `packages/plane-event-transport/{package.json,tsconfig.json,vitest.config.ts}`, `src/{index.ts,types.ts}`, `test/fixtures.ts`

- [ ] **Step 1: package.json** (mirror `packages/github-event-transport/package.json`)

```json
{
	"name": "cyrus-plane-event-transport",
	"version": "0.1.0",
	"type": "module",
	"main": "dist/index.js",
	"types": "dist/index.d.ts",
	"scripts": {
		"build": "tsc",
		"dev": "tsc --watch",
		"typecheck": "tsc --noEmit",
		"test": "vitest",
		"test:run": "vitest run"
	},
	"dependencies": {
		"@makeplane/plane-node-sdk": "0.2.11",
		"cyrus-core": "workspace:*",
		"fastify": "^5.2.0"
	},
	"devDependencies": {
		"@types/node": "^22.0.0",
		"typescript": "^5.5.0",
		"vitest": "^3.1.4"
	}
}
```
Match the exact devDependency versions used by `github-event-transport` (open its package.json and copy them verbatim). `tsconfig.json` and `vitest.config.ts`: copy from `github-event-transport` unchanged.

- [ ] **Step 2: Payload types**

```ts
// packages/plane-event-transport/src/types.ts
export type { PlaneEventTransportConfig } from "cyrus-core"; // re-export for consumers

export interface PlaneIssueDetail {
	id: string;
	name: string;
	sequence_id: number;
	project_identifier: string;
	description_stripped: string | null;
	priority: string | null;
	state_id: string | null;
	url: string;
}

export interface PlaneAgentRunData {
	id: string;
	status: string;
	type: "comment_thread" | "assignment";
	agent_user: string;
	issue: string | null;
	project: string | null;
	workspace: string;
	source_comment: string | null;
	started_at: string;
	ended_at: string | null;
	external_link: string | null;
	workspace_slug: string;
	prompt: string;
	issue_detail: PlaneIssueDetail | null;
	source_comment_detail: { id: string; comment_html: string } | null;
	agent_user_detail: { id: string; display_name: string; agent_slug: string };
	web_url: string | null;
}

/** Envelope produced by Plane's webhook_send_task (see Plan 1, "Canonical webhook payload"). */
export interface PlaneAgentRunWebhook {
	event: "agent_run";
	action: "created" | "prompted";
	webhook_id: string;
	workspace_id: string;
	workspace_slug: string;
	data: PlaneAgentRunData;
	activity: unknown | null;
}

export function isPlaneAgentRunWebhook(body: unknown): body is PlaneAgentRunWebhook {
	if (typeof body !== "object" || body === null) return false;
	const b = body as Record<string, unknown>;
	return b.event === "agent_run" && (b.action === "created" || b.action === "prompted");
}
```

- [ ] **Step 3: Fixtures** — copy the canonical payload from Plan 1 verbatim (or a captured `WebhookLog.request_body` from Plan 1 Task 13 if available):

```ts
// packages/plane-event-transport/test/fixtures.ts
import type { PlaneAgentRunWebhook } from "../src/types.js";

export const createdWebhookFixture: PlaneAgentRunWebhook = {
	event: "agent_run",
	action: "created",
	webhook_id: "6c8b4a7e-0000-0000-0000-000000000001",
	workspace_id: "b1f90000-0000-0000-0000-000000000002",
	workspace_slug: "quantum",
	data: {
		id: "3f2c0000-0000-0000-0000-000000000003",
		status: "created",
		type: "comment_thread",
		agent_user: "9a110000-0000-0000-0000-000000000004",
		issue: "77aa0000-0000-0000-0000-000000000005",
		project: "51de0000-0000-0000-0000-000000000006",
		workspace: "b1f90000-0000-0000-0000-000000000002",
		source_comment: "c0de0000-0000-0000-0000-000000000007",
		started_at: "2026-07-14T12:00:00Z",
		ended_at: null,
		external_link: null,
		workspace_slug: "quantum",
		prompt: "fix the failing test in packages/x",
		issue_detail: {
			id: "77aa0000-0000-0000-0000-000000000005",
			name: "Fix failing test",
			sequence_id: 42,
			project_identifier: "QS",
			description_stripped: "The test fails because…",
			priority: "medium",
			state_id: "0aa10000-0000-0000-0000-000000000008",
			url: "http://localhost/quantum/projects/51de…/issues/77aa…",
		},
		source_comment_detail: {
			id: "c0de0000-0000-0000-0000-000000000007",
			comment_html: "<p>fix the failing test in packages/x</p>",
		},
		agent_user_detail: { id: "9a11…", display_name: "Cyrus", agent_slug: "cyrus" },
		web_url: "http://localhost",
	},
	activity: null,
};

export const promptedWebhookFixture: PlaneAgentRunWebhook = {
	...createdWebhookFixture,
	action: "prompted",
	data: { ...createdWebhookFixture.data, status: "in_progress", prompt: "also update the README" },
};
```

- [ ] **Step 4: Barrel, install, build**

`src/index.ts`:
```ts
export * from "./types.js";
```
Run: `pnpm install && pnpm --filter cyrus-plane-event-transport build`
Expected: clean build

- [ ] **Step 5: Commit**

```bash
git add packages/plane-event-transport/ pnpm-lock.yaml
git commit -m "feat(plane): scaffold plane-event-transport package with payload types and fixtures"
```

---

### Task 3: Webhook utils — signature verify + delivery dedupe (TDD)

**Files:**
- Create: `packages/plane-event-transport/src/plane-webhook-utils.ts`
- Test: `packages/plane-event-transport/test/plane-webhook-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/plane-event-transport/test/plane-webhook-utils.test.ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DeliveryDeduper, verifyPlaneSignature } from "../src/plane-webhook-utils.js";

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
		expect(verifyPlaneSignature(body + " ", sign(body, SECRET), SECRET)).toBe(false);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// packages/plane-event-transport/src/plane-webhook-utils.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: 7 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/plane-event-transport/
git commit -m "feat(plane): raw-body HMAC verification and delivery dedupe"
```

---

### Task 4: PlaneWebhookTranslator (TDD)

Translates the Plane payload into the Linear-SDK-shaped `AgentSessionEvent` webhook consumed by `EdgeWorker.handleWebhook` (guards: `isAgentSessionCreatedWebhook`/`isAgentSessionPromptedWebhook` in `packages/core/src/issue-tracker/types.ts:849-862` check only `type === "AgentSessionEvent"` and `action`).

**Files:**
- Create: `packages/plane-event-transport/src/PlaneWebhookTranslator.ts`
- Test: `packages/plane-event-transport/test/PlaneWebhookTranslator.test.ts`

- [ ] **Step 0 (read before coding):** Open `packages/edge-worker/src/EdgeWorker.ts` and read `handleAgentSessionCreatedWebhook` (~line 3158) and `handleUserPromptedAgentActivity` (~line 4111). List every field they access on `webhook.agentSession`, `webhook.agentActivity`, and the webhook root. The translator below covers the fields known from exploration (`agentSession.id`, `agentSession.issue.{id,identifier,title,description,url,branchName,team,labels}`, `agentSession.comment?.body`, `guidance`, `organizationId`, `agentActivity.{content.body,signal}`) — extend it and the tests for anything extra you find. This step is the plan's main known-unknown; budget real attention here.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/plane-event-transport/test/PlaneWebhookTranslator.test.ts
import { describe, expect, it } from "vitest";
import { PlaneWebhookTranslator } from "../src/PlaneWebhookTranslator.js";
import { createdWebhookFixture, promptedWebhookFixture } from "./fixtures.js";

describe("PlaneWebhookTranslator", () => {
	const translator = new PlaneWebhookTranslator();

	it("translates action=created into an AgentSessionEvent created webhook", () => {
		const event = translator.toAgentSessionEvent(createdWebhookFixture);
		expect(event.type).toBe("AgentSessionEvent");
		expect(event.action).toBe("created");
		expect(event.organizationId).toBe(createdWebhookFixture.data.workspace);
		expect(event.agentSession.id).toBe(createdWebhookFixture.data.id);
		expect(event.agentSession.issue.id).toBe(createdWebhookFixture.data.issue);
		expect(event.agentSession.issue.identifier).toBe("QS-42");
		expect(event.agentSession.issue.title).toBe("Fix failing test");
		expect(event.agentSession.issue.branchName).toMatch(/^qs-42/);
		expect(event.agentSession.comment?.body).toBe("fix the failing test in packages/x");
	});

	it("translates action=prompted into an AgentSessionEvent prompted webhook", () => {
		const event = translator.toAgentSessionEvent(promptedWebhookFixture);
		expect(event.action).toBe("prompted");
		expect(event.agentActivity?.content?.body).toBe("also update the README");
	});

	it("synthesizes issue prompt as comment body for assignment runs", () => {
		const assignment = {
			...createdWebhookFixture,
			data: { ...createdWebhookFixture.data, type: "assignment" as const, source_comment_detail: null },
		};
		const event = translator.toAgentSessionEvent(assignment);
		expect(event.agentSession.comment?.body).toBe(assignment.data.prompt);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// packages/plane-event-transport/src/PlaneWebhookTranslator.ts
import type { PlaneAgentRunWebhook } from "./types.js";

const slugify = (value: string) =>
	value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

/**
 * Produces the Linear-SDK-shaped AgentSessionEvent webhook that
 * EdgeWorker.handleWebhook dispatches on (the working legacy "event" path —
 * the InternalMessage bus handlers are unimplemented stubs, see plan header).
 * Typed as a structural literal; EdgeWorker consumes it via type guards that
 * check only `type` and `action`.
 */
export class PlaneWebhookTranslator {
	toAgentSessionEvent(webhook: PlaneAgentRunWebhook) {
		const { data } = webhook;
		const detail = data.issue_detail;
		const identifier = detail ? `${detail.project_identifier}-${detail.sequence_id}` : (data.issue ?? data.id);

		const agentSession = {
			id: data.id,
			status: "active",
			issue: {
				id: data.issue ?? "",
				identifier,
				title: detail?.name ?? "",
				description: detail?.description_stripped ?? "",
				url: detail?.url ?? "",
				branchName: `${slugify(identifier)}-${slugify(detail?.name ?? "agent-run")}`,
				team: detail
					? { id: data.project ?? "", key: detail.project_identifier, name: detail.project_identifier }
					: undefined,
				labels: { nodes: [] },
			},
			// Session prompt: mention comment body for comment_thread runs,
			// synthesized issue prompt for assignment runs.
			comment: { id: data.source_comment ?? data.id, body: data.prompt },
		};

		if (webhook.action === "prompted") {
			return {
				type: "AgentSessionEvent" as const,
				action: "prompted" as const,
				organizationId: data.workspace,
				createdAt: new Date().toISOString(),
				agentSession,
				agentActivity: {
					id: `plane-prompt-${Date.now()}`,
					content: { type: "prompt", body: data.prompt },
					signal: undefined,
				},
			};
		}
		return {
			type: "AgentSessionEvent" as const,
			action: "created" as const,
			organizationId: data.workspace,
			createdAt: new Date().toISOString(),
			agentSession,
			guidance: undefined,
		};
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: PASS. Then reconcile with your Step 0 field list — add fields + assertions for anything the handlers read that the fixture lacks.

- [ ] **Step 5: Commit**

```bash
git add packages/plane-event-transport/
git commit -m "feat(plane): translate agent_run webhooks to AgentSessionEvent shape"
```

---

### Task 5: PlaneEventTransport (TDD)

**Files:**
- Create: `packages/plane-event-transport/src/PlaneEventTransport.ts`
- Test: `packages/plane-event-transport/test/PlaneEventTransport.test.ts`

- [ ] **Step 1: Write the failing tests** (mock-Fastify pattern from `packages/github-event-transport/test/GitHubEventTransport.test.ts` — copy its `createMockFastify` helper)

```ts
// packages/plane-event-transport/test/PlaneEventTransport.test.ts
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaneEventTransport } from "../src/PlaneEventTransport.js";
import { createdWebhookFixture } from "./fixtures.js";

const SECRET = "hook-secret";

function createMockFastify() {
	const routes: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
	return {
		post: vi.fn((path: string, optsOrHandler: unknown, maybeHandler?: unknown) => {
			routes[path] = (maybeHandler ?? optsOrHandler) as (typeof routes)[string];
		}),
		routes,
	};
}

function makeRequest(body: unknown, secret = SECRET, overrides: Record<string, string | undefined> = {}) {
	const raw = JSON.stringify(body);
	return {
		body,
		rawBody: raw,
		headers: {
			"x-plane-signature": createHmac("sha256", secret).update(raw).digest("hex"),
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
			// biome-ignore lint/suspicious/noExplicitAny: mock
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
		await fastify.routes["/plane/webhook"](makeRequest(createdWebhookFixture), reply);
		expect(reply.code).toHaveBeenCalledWith(200);
		expect(events).toHaveLength(1);
		expect((events[0] as { type: string }).type).toBe("AgentSessionEvent");
	});

	it("rejects an invalid signature with 401 and emits nothing", async () => {
		const events: unknown[] = [];
		transport.on("event", (event) => events.push(event));
		const reply = makeReply();
		await fastify.routes["/plane/webhook"](makeRequest(createdWebhookFixture, "wrong"), reply);
		expect(reply.code).toHaveBeenCalledWith(401);
		expect(events).toHaveLength(0);
	});

	it("acks duplicate deliveries with 200 but emits only once", async () => {
		const events: unknown[] = [];
		transport.on("event", (event) => events.push(event));
		await fastify.routes["/plane/webhook"](makeRequest(createdWebhookFixture), makeReply());
		const reply = makeReply();
		await fastify.routes["/plane/webhook"](makeRequest(createdWebhookFixture), reply);
		expect(reply.code).toHaveBeenCalledWith(200);
		expect(events).toHaveLength(1);
	});

	it("acks non-agent_run events with 200 and emits nothing", async () => {
		const events: unknown[] = [];
		transport.on("event", (event) => events.push(event));
		const reply = makeReply();
		await fastify.routes["/plane/webhook"](
			makeRequest({ event: "issue", action: "created" }, SECRET, { delivery: "d-2" }),
			reply,
		);
		expect(reply.code).toHaveBeenCalledWith(200);
		expect(events).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: FAIL — module not found

- [ ] **Step 3: Implement** (structure mirrors `GitHubEventTransport.ts`: `extends EventEmitter`, `declare interface` for typed events; raw body comes from the shared server's global JSON parser — `SharedApplicationServer.ts:85-100` stashes it on `request.rawBody`)

```ts
// packages/plane-event-transport/src/PlaneEventTransport.ts
import { EventEmitter } from "node:events";
import type { PlaneEventTransportConfig } from "cyrus-core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { DeliveryDeduper, verifyPlaneSignature } from "./plane-webhook-utils.js";
import { PlaneWebhookTranslator } from "./PlaneWebhookTranslator.js";
import { isPlaneAgentRunWebhook } from "./types.js";

export declare interface PlaneEventTransport {
	on(event: "event", listener: (payload: unknown) => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	emit(event: "event", payload: unknown): boolean;
	emit(event: "error", error: Error): boolean;
}

export class PlaneEventTransport extends EventEmitter {
	private readonly translator = new PlaneWebhookTranslator();
	private readonly deduper = new DeliveryDeduper();

	constructor(private readonly config: PlaneEventTransportConfig) {
		super();
	}

	register(): void {
		this.config.fastifyServer.post(
			"/plane/webhook",
			{ config: { rawBody: true } },
			async (request: FastifyRequest, reply: FastifyReply) => {
				try {
					const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? "";
					const signature = request.headers["x-plane-signature"] as string | undefined;
					if (!verifyPlaneSignature(rawBody, signature, this.config.secret)) {
						return reply.code(401).send({ error: "invalid signature" });
					}
					const delivery = request.headers["x-plane-delivery"] as string | undefined;
					if (this.deduper.seen(delivery)) {
						return reply.code(200).send({ status: "duplicate" });
					}
					const body = request.body;
					if (!isPlaneAgentRunWebhook(body)) {
						// Ack permanently-unprocessable events so Plane doesn't retry them
						return reply.code(200).send({ status: "ignored" });
					}
					this.emit("event", this.translator.toAgentSessionEvent(body));
					return reply.code(200).send({ status: "ok" });
				} catch (error) {
					this.emit("error", error instanceof Error ? error : new Error(String(error)));
					return reply.code(200).send({ status: "error" });
				}
			},
		);
	}

	removeAllListeners(): this {
		return super.removeAllListeners();
	}
}
```
Add to `src/index.ts`:
```ts
export * from "./PlaneEventTransport.js";
export * from "./PlaneWebhookTranslator.js";
export * from "./plane-webhook-utils.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add packages/plane-event-transport/
git commit -m "feat(plane): webhook transport with verify, dedupe, translate, emit"
```

---

### Task 6: PlaneIssueTrackerService — REST hot path (TDD)

**Files:**
- Create: `packages/plane-event-transport/src/PlaneIssueTrackerService.ts`
- Test: `packages/plane-event-transport/test/PlaneIssueTrackerService.test.ts`

- [ ] **Step 0 (read before coding):** Open `packages/core/src/issue-tracker/IIssueTrackerService.ts` and `packages/core/src/issue-tracker/adapters/…/CLIIssueTrackerService.ts`. Note the exact return-object shapes CLI builds for `Issue`, `Comment`, `Connection<T>`, and `WorkflowState` — mirror those literal shapes (they prove plain objects satisfy the types without the Linear SDK client).

- [ ] **Step 1: Write the failing tests** (mock `fetch` globally; no live server)

```ts
// packages/plane-event-transport/test/PlaneIssueTrackerService.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaneIssueTrackerService } from "../src/PlaneIssueTrackerService.js";

const CONFIG = {
	apiUrl: "http://localhost:8000",
	apiKey: "plane_api_test",
	workspaceSlug: "quantum",
	projectId: "51de0000-0000-0000-0000-000000000006",
	webUrl: "http://localhost",
};

const jsonResponse = (data: unknown, status = 200) =>
	({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) }) as Response;

describe("PlaneIssueTrackerService", () => {
	let service: PlaneIssueTrackerService;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		service = new PlaneIssueTrackerService(CONFIG);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("getPlatformType returns plane", () => {
		expect(service.getPlatformType()).toBe("plane");
	});

	it("fetchIssue GETs the v1 issue endpoint with the API key and maps the shape", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ id: "77aa", name: "Fix it", sequence_id: 42, description_html: "<p>d</p>", state: "0aa1" }),
		);
		const issue = await service.fetchIssue("77aa");
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${CONFIG.apiUrl}/api/v1/workspaces/quantum/projects/${CONFIG.projectId}/issues/77aa/`);
		expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe(CONFIG.apiKey);
		expect(issue.id).toBe("77aa");
		expect(issue.title).toBe("Fix it");
	});

	it("createComment POSTs comment_html", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ id: "c1", comment_html: "<p>hello</p>" }, 201));
		const comment = await service.createComment("77aa", { body: "hello" });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain("/issues/77aa/comments/");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string).comment_html).toContain("hello");
		expect(comment.id).toBe("c1");
	});

	it("updateIssue PATCHes state", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ id: "77aa", state: "s2", name: "Fix it", sequence_id: 42 }));
		await service.updateIssue("77aa", { stateId: "s2" });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain("/issues/77aa/");
		expect(init.method).toBe("PATCH");
		expect(JSON.parse(init.body as string)).toEqual({ state: "s2" });
	});

	it("fetchWorkflowStates maps Plane state groups to Linear-style types", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ results: [{ id: "s1", name: "In Review", group: "started", sequence: 2 }] }),
		);
		const states = await service.fetchWorkflowStates("any-team-id");
		expect(states.nodes[0]).toMatchObject({ id: "s1", name: "In Review", type: "started" });
	});

	it("throws a descriptive error on non-2xx", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "not found" }, 404));
		await expect(service.fetchIssue("nope")).rejects.toThrow(/404/);
	});

	it("unimplemented methods throw not-implemented", async () => {
		await expect(service.fetchTeams()).rejects.toThrow(/not implemented/i);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service (REST portion)**

```ts
// packages/plane-event-transport/src/PlaneIssueTrackerService.ts
import type {
	AgentEventTransportConfig,
	IAgentEventTransport,
	IIssueTrackerService,
} from "cyrus-core";
import { PlaneEventTransport } from "./PlaneEventTransport.js";

export interface PlaneIssueTrackerConfig {
	apiUrl: string; // http://localhost:8000
	apiKey: string; // PLANE_BOT_TOKEN
	workspaceSlug: string;
	projectId: string;
	webUrl?: string;
}

// Plane state group → Linear WorkflowState type
const STATE_TYPE_MAP: Record<string, string> = {
	backlog: "backlog",
	unstarted: "unstarted",
	started: "started",
	completed: "completed",
	cancelled: "canceled",
};

const notImplemented = (method: string) => {
	throw new Error(`PlaneIssueTrackerService.${method} is not implemented for the PoC`);
};

export class PlaneIssueTrackerService implements IIssueTrackerService {
	constructor(private readonly config: PlaneIssueTrackerConfig) {}

	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const url = `${this.config.apiUrl}/api/v1/workspaces/${this.config.workspaceSlug}${path}`;
		const response = await fetch(url, {
			...init,
			headers: {
				"X-Api-Key": this.config.apiKey,
				"Content-Type": "application/json",
				...(init.headers ?? {}),
			},
		});
		if (!response.ok) {
			throw new Error(`Plane API ${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
		}
		return (await response.json()) as T;
	}

	private issuePath(issueId: string, suffix = ""): string {
		return `/projects/${this.config.projectId}/issues/${issueId}/${suffix}`;
	}

	// biome-ignore lint/suspicious/noExplicitAny: mapped to core Issue shape (see CLIIssueTrackerService)
	private toIssue(raw: any): any {
		const identifier = raw.project_identifier
			? `${raw.project_identifier}-${raw.sequence_id}`
			: String(raw.sequence_id ?? raw.id);
		return {
			id: raw.id,
			identifier,
			title: raw.name,
			description: raw.description_stripped ?? raw.description_html ?? "",
			url: this.config.webUrl
				? `${this.config.webUrl}/${this.config.workspaceSlug}/projects/${this.config.projectId}/issues/${raw.id}`
				: "",
			branchName: undefined,
			state: raw.state ? { id: raw.state } : undefined,
		};
	}

	// biome-ignore lint/suspicious/noExplicitAny: mapped to core Comment shape
	private toComment(raw: any): any {
		return { id: raw.id, body: raw.comment_stripped ?? raw.comment_html ?? "", createdAt: raw.created_at };
	}

	// --- hot path ---

	async fetchIssue(idOrIdentifier: string) {
		return this.toIssue(await this.request(this.issuePath(idOrIdentifier)));
	}

	async updateIssue(issueId: string, updates: { stateId?: string; [key: string]: unknown }) {
		const body: Record<string, unknown> = {};
		if (updates.stateId) body.state = updates.stateId;
		return this.toIssue(
			await this.request(this.issuePath(issueId), { method: "PATCH", body: JSON.stringify(body) }),
		);
	}

	async fetchComments(issueId: string) {
		// biome-ignore lint/suspicious/noExplicitAny: raw API payload
		const data = await this.request<any>(this.issuePath(issueId, "comments/"));
		const results = Array.isArray(data) ? data : (data.results ?? []);
		// biome-ignore lint/suspicious/noExplicitAny: raw API payload
		return { nodes: results.map((comment: any) => this.toComment(comment)), pageInfo: { hasNextPage: false } };
	}

	async createComment(issueId: string, input: { body: string }) {
		const raw = await this.request(this.issuePath(issueId, "comments/"), {
			method: "POST",
			body: JSON.stringify({ comment_html: `<p>${input.body}</p>` }),
		});
		return this.toComment(raw);
	}

	async fetchWorkflowStates(_teamId: string) {
		// biome-ignore lint/suspicious/noExplicitAny: raw API payload
		const data = await this.request<any>(`/projects/${this.config.projectId}/states/`);
		const results = Array.isArray(data) ? data : (data.results ?? []);
		return {
			// biome-ignore lint/suspicious/noExplicitAny: raw API payload
			nodes: results.map((state: any) => ({
				id: state.id,
				name: state.name,
				type: STATE_TYPE_MAP[state.group] ?? "unstarted",
				position: state.sequence,
			})),
			pageInfo: { hasNextPage: false },
		};
	}

	getPlatformType(): string {
		return "plane";
	}

	getPlatformMetadata(): Record<string, unknown> {
		return { workspaceSlug: this.config.workspaceSlug, projectId: this.config.projectId };
	}

	createEventTransport(config: AgentEventTransportConfig): IAgentEventTransport {
		if (config.platform !== "plane") {
			throw new Error(`PlaneIssueTrackerService cannot create a ${config.platform} transport`);
		}
		return new PlaneEventTransport(config);
	}

	// --- agent session/activity methods: Task 7 ---
	// biome-ignore lint/suspicious/noExplicitAny: implemented in Task 7
	async createAgentSessionOnIssue(_input: any): Promise<any> { return notImplemented("createAgentSessionOnIssue"); }
	// biome-ignore lint/suspicious/noExplicitAny: implemented in Task 7
	async createAgentSessionOnComment(_input: any): Promise<any> { return notImplemented("createAgentSessionOnComment"); }
	// biome-ignore lint/suspicious/noExplicitAny: implemented in Task 7
	async fetchAgentSession(_sessionId: string): Promise<any> { return notImplemented("fetchAgentSession"); }
	// biome-ignore lint/suspicious/noExplicitAny: implemented in Task 7
	async createAgentActivity(_input: any): Promise<any> { return notImplemented("createAgentActivity"); }
	async emitStopSignalEvent(_sessionId: string): Promise<void> {
		// no-op: stop signals arrive via Plane webhooks (mirrors LinearIssueTrackerService)
	}

	// --- not needed for the PoC ---
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchIssueChildren(..._args: any[]): Promise<any> { return notImplemented("fetchIssueChildren"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchIssueAttachments(..._args: any[]): Promise<any> { return notImplemented("fetchIssueAttachments"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchComment(..._args: any[]): Promise<any> { return notImplemented("fetchComment"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchCommentWithAttachments(..._args: any[]): Promise<any> { return notImplemented("fetchCommentWithAttachments"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchTeams(..._args: any[]): Promise<any> { return notImplemented("fetchTeams"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchTeam(..._args: any[]): Promise<any> { return notImplemented("fetchTeam"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchLabels(..._args: any[]): Promise<any> { return notImplemented("fetchLabels"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchLabel(..._args: any[]): Promise<any> { return notImplemented("fetchLabel"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async getIssueLabels(..._args: any[]): Promise<any> { return notImplemented("getIssueLabels"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchWorkflowState(..._args: any[]): Promise<any> { return notImplemented("fetchWorkflowState"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchUser(..._args: any[]): Promise<any> { return notImplemented("fetchUser"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchCurrentUser(..._args: any[]): Promise<any> { return notImplemented("fetchCurrentUser"); }
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async requestFileUpload(..._args: any[]): Promise<any> { return notImplemented("requestFileUpload"); }
}
```
Adjust return-shape details (`Connection` field names, `Issue.state`, exact interface signatures) to what Step 0 found — the interface types in `IIssueTrackerService.ts` are authoritative; prefer typed returns over `any` wherever the core types are importable. Export the service from `src/index.ts`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter cyrus-plane-event-transport test:run && pnpm --filter cyrus-plane-event-transport typecheck`
Expected: PASS / clean. Typecheck is the real gate here — it proves the class satisfies `IIssueTrackerService`.

- [ ] **Step 5: Commit**

```bash
git add packages/plane-event-transport/
git commit -m "feat(plane): PlaneIssueTrackerService REST hot path"
```

---

### Task 7: Agent activities — SDK mapping + rate-limit throttle (TDD)

**Files:**
- Modify: `packages/plane-event-transport/src/PlaneIssueTrackerService.ts`
- Test: extend `packages/plane-event-transport/test/PlaneIssueTrackerService.test.ts`

- [ ] **Step 1: Write the failing tests** (inject a mock SDK client)

```ts
describe("createAgentActivity", () => {
	let sdkMock: { agentRuns: { activities: { create: ReturnType<typeof vi.fn> }; retrieve: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } };
	let service: PlaneIssueTrackerService;

	beforeEach(() => {
		vi.useFakeTimers();
		sdkMock = {
			agentRuns: {
				activities: { create: vi.fn().mockResolvedValue({ id: "act-1" }) },
				retrieve: vi.fn(),
				create: vi.fn(),
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: injected mock
		service = new PlaneIssueTrackerService(CONFIG, sdkMock as any);
	});
	afterEach(() => vi.useRealTimers());

	it("maps thought to an ephemeral activity with signal continue", async () => {
		const result = await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "thought", body: "planning" },
		});
		expect(result.success).toBe(true);
		expect(sdkMock.agentRuns.activities.create).toHaveBeenCalledWith("quantum", "run-1", {
			type: "thought",
			content: { type: "thought", body: "planning" },
			ephemeral: true,
			signal: "continue",
		});
	});

	it("maps a final response with signal stop, non-ephemeral", async () => {
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "response", body: "done" },
			signal: "stop",
		});
		expect(sdkMock.agentRuns.activities.create).toHaveBeenCalledWith("quantum", "run-1", {
			type: "response",
			content: { type: "response", body: "done" },
			ephemeral: false,
			signal: "stop",
		});
	});

	it("maps elicitation to signal select", async () => {
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "elicitation", body: "which repo?" },
		});
		expect(sdkMock.agentRuns.activities.create.mock.calls[0][2].signal).toBe("select");
	});

	it("coalesces rapid ephemeral activities (rate limit: 60 req/min)", async () => {
		await service.createAgentActivity({ agentSessionId: "run-1", content: { type: "thought", body: "one" } });
		// within the 2s window: queued, not sent
		await service.createAgentActivity({ agentSessionId: "run-1", content: { type: "thought", body: "two" } });
		await service.createAgentActivity({ agentSessionId: "run-1", content: { type: "thought", body: "three" } });
		expect(sdkMock.agentRuns.activities.create).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2100);
		// only the latest queued ephemeral goes out
		expect(sdkMock.agentRuns.activities.create).toHaveBeenCalledTimes(2);
		expect(sdkMock.agentRuns.activities.create.mock.calls[1][2].content.body).toBe("three");
	});

	it("non-ephemeral activities are never dropped by the throttle", async () => {
		await service.createAgentActivity({ agentSessionId: "run-1", content: { type: "thought", body: "one" } });
		await service.createAgentActivity({
			agentSessionId: "run-1", content: { type: "response", body: "done" }, signal: "stop",
		});
		await vi.advanceTimersByTimeAsync(2100);
		const sentTypes = sdkMock.agentRuns.activities.create.mock.calls.map((call) => call[2].type);
		expect(sentTypes).toContain("response");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: FAIL — constructor doesn't accept an SDK client / methods throw

- [ ] **Step 3: Implement**

Extend the service:
```ts
import { PlaneClient } from "@makeplane/plane-node-sdk";

const MIN_ACTIVITY_INTERVAL_MS = 2000;

export class PlaneIssueTrackerService implements IIssueTrackerService {
	private readonly sdk: PlaneClient;
	private lastActivitySentAt = 0;
	// biome-ignore lint/suspicious/noExplicitAny: queued SDK request body
	private pendingEphemeral: { runId: string; request: any } | null = null;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly config: PlaneIssueTrackerConfig,
		sdk?: PlaneClient,
	) {
		// IMPORTANT: `apiKey` (→ X-Api-Key header), NOT `accessToken` (→ Bearer).
		// Plane's external API authenticates bot tokens via X-Api-Key; using
		// accessToken makes every SDK call 401.
		this.sdk = sdk ?? new PlaneClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });
	}

	// biome-ignore lint/suspicious/noExplicitAny: core AgentActivityCreateInput
	async createAgentActivity(input: any): Promise<any> {
		const { agentSessionId, content, ephemeral, signal } = input;
		const type = content.type as string;
		const planeSignal =
			signal === "stop" || signal === "Stop" ? "stop" : type === "elicitation" ? "select" : "continue";
		const isEphemeral = ephemeral ?? (type === "thought" || type === "action");
		const request = { type, content, ephemeral: isEphemeral, signal: planeSignal };

		if (isEphemeral && Date.now() - this.lastActivitySentAt < MIN_ACTIVITY_INTERVAL_MS) {
			// Coalesce: keep only the newest ephemeral, flush after the window
			this.pendingEphemeral = { runId: agentSessionId, request };
			this.scheduleFlush();
			return { success: true, agentActivity: { id: "queued" } };
		}
		return this.sendActivity(agentSessionId, request);
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return;
		const wait = Math.max(0, MIN_ACTIVITY_INTERVAL_MS - (Date.now() - this.lastActivitySentAt));
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			const pending = this.pendingEphemeral;
			this.pendingEphemeral = null;
			if (pending) {
				void this.sendActivity(pending.runId, pending.request).catch(() => {
					/* logged in sendActivity */
				});
			}
		}, wait + 100);
	}

	// biome-ignore lint/suspicious/noExplicitAny: SDK request body
	private async sendActivity(runId: string, request: any): Promise<any> {
		this.lastActivitySentAt = Date.now();
		try {
			const activity = await this.sdk.agentRuns.activities.create(this.config.workspaceSlug, runId, request);
			return { success: true, agentActivity: activity };
		} catch (error) {
			// One retry after backoff on rate-limit-ish failures
			await new Promise((resolvePromise) => setTimeout(resolvePromise, MIN_ACTIVITY_INTERVAL_MS));
			const activity = await this.sdk.agentRuns.activities.create(this.config.workspaceSlug, runId, request);
			return { success: true, agentActivity: activity };
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: core input types
	async createAgentSessionOnIssue(input: any): Promise<any> {
		const run = await this.sdk.agentRuns.create(this.config.workspaceSlug, {
			agent_slug: this.config.agentSlug ?? "cyrus",
			issue: input.issueId,
			project: this.config.projectId,
		});
		return { success: true, agentSession: run };
	}

	// biome-ignore lint/suspicious/noExplicitAny: core input types
	async createAgentSessionOnComment(input: any): Promise<any> {
		const run = await this.sdk.agentRuns.create(this.config.workspaceSlug, {
			agent_slug: this.config.agentSlug ?? "cyrus",
			issue: input.issueId,
			project: this.config.projectId,
			source_comment: input.commentId,
		});
		return { success: true, agentSession: run };
	}

	async fetchAgentSession(sessionId: string) {
		return this.sdk.agentRuns.retrieve(this.config.workspaceSlug, sessionId);
	}
}
```
Add optional `agentSlug?: string` to `PlaneIssueTrackerConfig`. Verify the SDK client property path (`sdk.agentRuns.activities.create` / `sdk.agentRuns.create` / `sdk.agentRuns.retrieve`) against `node_modules/@makeplane/plane-node-sdk/dist/client/plane-client.d.ts` — adjust if the client nests them differently.

Two contract notes (verified against SDK 0.2.11 + Plan 1):
- `ephemeral` is **not** in the SDK's `CreateAgentRunActivityRequest` — it's a fork extension. The SDK forwards the body verbatim, and Plan 1's `AgentRunActivityCreateSerializer` explicitly accepts `ephemeral`, so this works end-to-end; don't "fix" it by dropping the field.
- `action`-type activities must carry `content: {type: "action", action, parameters}` (not `{type, body}`). The adapter forwards `content` as-is; in Step 0's read of the activity flow, confirm what shape upstream (`LinearActivitySink`) emits for tool actions and add a translation + test if it emits `{type, body}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter cyrus-plane-event-transport test:run`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add packages/plane-event-transport/
git commit -m "feat(plane): agent activity mapping with coalescing throttle and SDK run methods"
```

---

### Task 8: EdgeWorker + CLI wiring

**Files:**
- Modify: `packages/edge-worker/package.json`, `packages/edge-worker/src/EdgeWorker.ts` (~:334, ~:362, ~:577, ~:2027), `packages/edge-worker/src/AgentSessionManager.ts` (~:164), `apps/cli/src/services/WorkerService.ts` (~:200-256)

- [ ] **Step 1: Dependency**

In `packages/edge-worker/package.json` dependencies add `"cyrus-plane-event-transport": "workspace:*"`, then `pnpm install`.

- [ ] **Step 2: Tracker instantiation — both sites**

At `EdgeWorker.ts:362-374` (and the twin at ~:2027-2039), extend the platform expression:
```ts
const issueTracker =
	this.config.platform === "cli"
		? (() => {
				const service = new CLIIssueTrackerService();
				service.seedDefaultData();
				return service;
			})()
		: this.config.platform === "plane"
			? new PlaneIssueTrackerService({
					apiUrl: process.env.PLANE_API_URL ?? "",
					apiKey: process.env.PLANE_BOT_TOKEN ?? "",
					workspaceSlug: repo.planeWorkspaceSlug ?? "",
					projectId: repo.planeProjectId ?? "",
					webUrl: process.env.PLANE_WEB_URL,
					agentSlug: process.env.PLANE_AGENT_SLUG ?? "cyrus",
				})
			: new LinearIssueTrackerService(
					new LinearClient({ accessToken: repo.linearToken }),
					this.buildOAuthConfig(resolvedRepo),
				);
```
Import `PlaneIssueTrackerService` from `cyrus-plane-event-transport` next to the Linear imports (~:98). At the second site the repo variable name may differ — read the surrounding loop and match it.

- [ ] **Step 3: initializeComponents plane branch**

At `EdgeWorker.ts:577`, convert the `if (cli) … else linear` into `if (cli) … else if (plane) … else linear`:
```ts
} else if (this.config.platform === "plane") {
	const planeEventTransport = new PlaneEventTransport({
		platform: "plane",
		fastifyServer: this.sharedApplicationServer.getFastifyInstance(),
		verificationMode: "direct",
		secret: process.env.PLANE_WEBHOOK_SECRET ?? "",
	});
	planeEventTransport.on("event", (event) => {
		const repos = Array.from(this.repositories.values());
		this.handleWebhook(event as unknown as Webhook, repos);
	});
	planeEventTransport.on("error", (error: Error) => {
		this.handleError(error);
	});
	planeEventTransport.register();
	this.logger.info("✅ Plane event transport registered");
	this.logger.info("   Webhook endpoint: /plane/webhook");
}
```
Import `PlaneEventTransport` from `cyrus-plane-event-transport`.

- [ ] **Step 4: skipTunnel**

At `EdgeWorker.ts:334`:
```ts
const skipTunnel = config.platform === "cli" || config.platform === "plane";
```
(Local demo has no tunnel; nothing else changes since `CLOUDFLARE_TOKEN` is unset locally anyway.)

- [ ] **Step 5: AgentSessionManager platform**

In `packages/edge-worker/src/AgentSessionManager.ts` (~:164): add `"plane"` to the platform parameter union of `createLinearAgentSession`. **Likely no streaming-gate change is needed**: `handleAgentSessionCreatedWebhook` calls `createLinearAgentSession` (~EdgeWorker.ts:3081) without a `platform` argument, so it defaults to `"linear"`, `externalSessionId` is set, and activities already stream to the per-repo tracker — which for plane repos is `PlaneIssueTrackerService`. Verify by reading the call site; only extend `platform === "linear"` gates if a plane session actually passes a different platform value. Grep `packages/edge-worker/src` for `platform ===` comparisons that gate activity/comment posting and extend only what's actually hit (list changes in the commit message).

- [ ] **Step 6: CLI platform selection**

In `apps/cli/src/services/WorkerService.ts` where `EdgeWorkerConfig` is assembled (~:200-256), add:
```ts
platform: (process.env.CYRUS_PLATFORM as "linear" | "cli" | "plane" | undefined) ?? undefined,
```
(`undefined` preserves today's Linear default.)

- [ ] **Step 7: Build + typecheck + full test suite**

Run: `pnpm build && pnpm typecheck && pnpm test:packages:run && pnpm lint`
Expected: clean; no existing linear/cli tests broken.

- [ ] **Step 8: Commit**

```bash
git add packages/edge-worker/ apps/cli/ pnpm-lock.yaml
git commit -m "feat(plane): wire plane platform into EdgeWorker, session manager, and CLI"
```

---

### Task 9: Replay script + local instance config

**Files:**
- Create: `packages/plane-event-transport/scripts/replay-webhook.mjs`
- Create (on disk, not committed): `~/.cyrus-plane/config.json`, `~/.cyrus-plane/.env`

- [ ] **Step 1: Replay script** (the Plan-1/Plan-2 seam — signs a payload exactly like Plane's `webhook_send_task` and POSTs it)

```js
// packages/plane-event-transport/scripts/replay-webhook.mjs
// Usage: PLANE_WEBHOOK_SECRET=... node scripts/replay-webhook.mjs [payload.json] [url]
// Default payload: a "created" agent_run fixture; default url: http://localhost:3456/plane/webhook
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const secret = process.env.PLANE_WEBHOOK_SECRET;
if (!secret) {
	console.error("PLANE_WEBHOOK_SECRET is required");
	process.exit(1);
}
const url = process.argv[3] ?? "http://localhost:3456/plane/webhook";
const payload = process.argv[2]
	? JSON.parse(readFileSync(process.argv[2], "utf8"))
	: JSON.parse(readFileSync(new URL("./sample-created-payload.json", import.meta.url), "utf8"));

const body = JSON.stringify(payload);
const signature = createHmac("sha256", secret).update(body).digest("hex");

const response = await fetch(url, {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		"X-Plane-Signature": signature,
		"X-Plane-Event": "agent_run",
		"X-Plane-Delivery": randomUUID(),
	},
	body,
});
console.log(response.status, await response.text());
```
Also create `packages/plane-event-transport/scripts/sample-created-payload.json` — the created-fixture JSON from Task 2, **updated with real ids** captured from Plan 1's `WebhookLog` once available (a fresh `X-Plane-Delivery` is generated per run, so replays aren't deduped).

- [ ] **Step 2: Local config** (not committed)

`~/.cyrus-plane/config.json` — mirror the shape of your existing `~/.cyrus/config.json` repositories array:
```json
{
	"repositories": [
		{
			"id": "plane-poc",
			"name": "target-repo",
			"repositoryPath": "/Users/ondrej/Dev/<target-repo>",
			"baseBranch": "main",
			"workspaceBaseDir": "/Users/ondrej/.cyrus-plane/workspaces",
			"linearWorkspaceId": "",
			"linearToken": "",
			"planeWorkspaceSlug": "<your workspace slug>",
			"planeProjectId": "<test project uuid>",
			"isActive": true
		}
	]
}
```
`~/.cyrus-plane/.env`:
```bash
CYRUS_PLATFORM=plane
CYRUS_SERVER_PORT=3456
PLANE_API_URL=http://localhost:8000
PLANE_WEB_URL=http://localhost:3000
PLANE_BOT_TOKEN=<from Plan 1 create_agent_bot>
PLANE_WEBHOOK_SECRET=<from the Plane webhook settings page>
PLANE_AGENT_SLUG=cyrus
```
Check how `apps/cli` loads env (`Application.ts` reads `join(cyrusHome, ".env")`) and start with:
```bash
cd /Users/ondrej/Dev/cyrus && pnpm build
node apps/cli/dist/src/app.js --cyrus-home ~/.cyrus-plane
```

- [ ] **Step 3: Replay smoke test against the running instance**

```bash
PLANE_WEBHOOK_SECRET=<secret> node packages/plane-event-transport/scripts/replay-webhook.mjs
```
Expected: `200 {"status":"ok"}`, and the Cyrus log shows the AgentSession-created handling kicking off (worktree creation may fail on the fake issue id — the goal here is transport → handler wiring; use real ids for the full flow in Task 10).

- [ ] **Step 4: Commit**

```bash
git add packages/plane-event-transport/scripts/
git commit -m "feat(plane): signed webhook replay script for local integration testing"
```

---

### Task 10: End-to-end demo (manual)

Prereqs: Plan 1 merged/checked out and running locally (`docker compose -f docker-compose-local.yml up -d` + `pnpm dev` in the plane repo), bot + webhook configured per Plan 1 Task 13 with the webhook URL set to `http://host.docker.internal:3456/plane/webhook`, Cyrus running per Task 9.

- [ ] **Step 1: Trigger via @mention.** On a test work item, comment `@Cyrus <small real task against the target repo>`.
- [ ] **Step 2: Verify the chain**, in order:
  1. Plane worker log: `agent_run` webhook sent (`WebhookLog` row, response 200).
  2. Cyrus log: AgentSession created for the run id; worktree created; Claude Code session started.
  3. Plane UI: "Agent runs" section shows the run `in_progress` with streaming `thought`/`action` ephemeral activities.
  4. PR opened via `gh` on the target repo.
  5. Final `response` activity with `signal: stop` → run `completed` in the UI.
- [ ] **Step 3: Trigger via assignment.** Assign the Cyrus bot to a second work item; verify the same chain with run `type: assignment`.
- [ ] **Step 4: Follow-up prompt.** While a run is `awaiting`/active, @mention the bot again on the same issue; verify a `prompted` webhook and session continuation (no second run).
- [ ] **Step 5: Record gaps.** Any handler crash on missing Linear-specific fields goes back into Task 4's translator (add field + fixture + test). Iterate until the Definition of Done from the spec holds:
  > @mention in Plane → live streamed activities in the work-item run UI → PR opened → final response → issue state changed — fully local, both triggers.
- [ ] **Step 6: Final quality gates + PR prep**

```bash
pnpm build && pnpm typecheck && pnpm test:packages:run && pnpm lint
```
Expected: all clean. Then hand back for review/merge decision (do not push without the user's go-ahead).
