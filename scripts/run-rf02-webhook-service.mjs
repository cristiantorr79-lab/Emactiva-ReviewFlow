import { createRf02WebhookServer } from "../src/rf02-webhook.js";
import { createRf02InboxHttpAdapter } from "../src/rf02-inbox-http-adapter.js";

const required = name => { const value = process.env[name]; if (!value) throw new Error(`MISSING_${name}`); return value; };
const host = process.env.RF02_HOST || "127.0.0.1";
const port = Number(process.env.RF02_PORT || 18802);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("INVALID_RF02_PORT");
const allowLoopbackHttp = process.env.RF02_ALLOW_LOOPBACK_HTTP === "true";
const persistEvent = createRf02InboxHttpAdapter({ endpoint: required("RF02_INBOX_ENDPOINT"), serviceToken: required("RF02_INBOX_SERVICE_TOKEN"), allowLoopbackHttp });
const server = createRf02WebhookServer({ appSecret: required("RF02_META_APP_SECRET"), verifyToken: required("RF02_META_VERIFY_TOKEN"), persistEvent, logger: event => process.stdout.write(`${JSON.stringify(event)}\n`) });
server.listen(port, host, () => process.stdout.write(`${JSON.stringify({ event: "rf02_webhook_started", host, port })}\n`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(error => { if (error) process.exitCode = 1; }));
