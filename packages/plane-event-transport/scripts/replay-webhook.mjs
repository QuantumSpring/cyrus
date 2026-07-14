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
	: JSON.parse(
			readFileSync(
				new URL("./sample-created-payload.json", import.meta.url),
				"utf8",
			),
		);

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
