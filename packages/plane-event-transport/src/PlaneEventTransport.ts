import { EventEmitter } from "node:events";
import type { PlaneEventTransportConfig } from "cyrus-core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { PlaneWebhookTranslator } from "./PlaneWebhookTranslator.js";
import {
	DeliveryDeduper,
	verifyPlaneSignature,
} from "./plane-webhook-utils.js";
import { isPlaneAgentRunWebhook } from "./types.js";

export declare interface PlaneEventTransport {
	on(event: "event", listener: (payload: unknown) => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	emit(event: "event", payload: unknown): boolean;
	emit(event: "error", error: Error): boolean;
}

/**
 * PlaneEventTransport - receives Plane agent_run webhooks, verifies the raw-body
 * HMAC signature, dedupes redeliveries, translates the payload into the
 * Linear-SDK-shaped AgentSessionEvent webhook, and emits it on the legacy
 * "event" channel that EdgeWorker.handleWebhook already consumes.
 */
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
					const rawBody =
						(request as FastifyRequest & { rawBody?: string }).rawBody ?? "";
					const signature = request.headers["x-plane-signature"] as
						| string
						| undefined;
					if (!verifyPlaneSignature(rawBody, signature, this.config.secret)) {
						return reply.code(401).send({ error: "invalid signature" });
					}
					const delivery = request.headers["x-plane-delivery"] as
						| string
						| undefined;
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
					this.emit(
						"error",
						error instanceof Error ? error : new Error(String(error)),
					);
					return reply.code(200).send({ status: "error" });
				}
			},
		);
	}

	removeAllListeners(): this {
		return super.removeAllListeners();
	}
}
