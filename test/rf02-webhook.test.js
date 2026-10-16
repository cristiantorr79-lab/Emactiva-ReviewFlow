import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createRf02WebhookHandler } from "../src/rf02-webhook.js";
import { createRf02InboxHttpAdapter } from "../src/rf02-inbox-http-adapter.js";

const appSecret = "synthetic-meta-app-secret-32-characters";
const verifyToken = "synthetic-meta-verify-token-32-chars";
const payload = (body = " LISTO ", overrides = {}) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { messages: [{ id: "wamid.synthetic-1", from: "12025550101", timestamp: "1792112400", type: "text", text: { body }, ...overrides }] } }] }] });
const signed = value => { const rawBody=Buffer.from(JSON.stringify(value)); return { method:"POST",path:"/webhooks/whatsapp",rawBody,signature:`sha256=${createHmac("sha256",appSecret).update(rawBody).digest("hex")}` }; };
const setup = persistEvent => { const logs=[]; return { logs, handler:createRf02WebhookHandler({appSecret,verifyToken,persistEvent:persistEvent??(async()=>({status:"persisted"})),logger:event=>logs.push(event)})}; };

test("GET verification requires exact external token and returns only challenge", async () => {
  const {handler}=setup();
  const ok=await handler({method:"GET",path:"/webhooks/whatsapp",query:{"hub.mode":"subscribe","hub.verify_token":verifyToken,"hub.challenge":"challenge_123"}});
  assert.equal(ok.status,200); assert.equal(ok.body,"challenge_123");
  assert.equal((await handler({method:"GET",path:"/webhooks/whatsapp",query:{"hub.mode":"subscribe","hub.verify_token":"wrong","hub.challenge":"challenge_123"}})).status,403);
});

test("valid HMAC persists only the minimal LISTO event", async () => {
  const events=[]; const {handler,logs}=setup(async event=>{events.push(event);return {status:"persisted"};});
  const result=await handler(signed(payload("  listo\t")));
  assert.equal(result.status,200); assert.deepEqual(events,[{provider_event_id:"wamid.synthetic-1",phone_e164:"+12025550101",received_at:"2026-10-16T01:00:00.000Z",event_type:"LISTO",processing_status:"pending"}]);
  assert.doesNotMatch(JSON.stringify(logs),/12025550101|wamid\.synthetic/);
});

test("missing, malformed and invalid signatures fail before persistence", async () => {
  let writes=0; const {handler}=setup(async()=>{writes++;return {status:"persisted"};}); const request=signed(payload());
  for(const signature of [undefined,"sha256=xyz",`sha256=${"0".repeat(64)}`,`SHA256=${"0".repeat(64)}`]) assert.equal((await handler({...request,signature})).status,401);
  assert.equal(writes,0);
});

test("normalization accepts only complete text LISTO and ignores unknown events", async () => {
  let writes=0; const {handler}=setup(async()=>{writes++;return {status:"persisted"};});
  for(const value of [payload("LISTO ahora"),payload("NO LISTO"),payload(""),payload("LISTO",{type:"image",text:undefined})]) assert.equal((await handler(signed(value))).status,200);
  assert.equal(writes,0);
  const invalid=await handler(signed(payload("LISTO",{id:"invalid id"}))); assert.equal(invalid.status,400); assert.equal(writes,0);
});

test("confirmed duplicate succeeds, but failed or ambiguous persistence requests redelivery", async () => {
  for(const [status,expected] of [["duplicate",200],["failed",503],["ambiguous",503]]) { const {handler}=setup(async()=>({status})); assert.equal((await handler(signed(payload()))).status,expected); }
  const {handler}=setup(async()=>{throw new Error("uncertain write")}); assert.equal((await handler(signed(payload()))).status,503);
});

test("inbox HTTP adapter accepts only a confirmed matching persistence response", async () => {
  const event={provider_event_id:"wamid.synthetic-1"}; const token="synthetic-internal-token-32-characters";
  const adapter=createRf02InboxHttpAdapter({endpoint:"https://n8n.example.test/webhook/rf02-inbox",serviceToken:token,fetchImpl:async(_url,options)=>{assert.equal(options.headers.authorization,`Bearer ${token}`);return {ok:true,json:async()=>({apiVersion:"v1",status:"persisted",providerEventId:event.provider_event_id})};}});
  assert.deepEqual(await adapter(event),{status:"persisted"});
  const uncertain=createRf02InboxHttpAdapter({endpoint:"https://n8n.example.test/webhook/rf02-inbox",serviceToken:token,fetchImpl:async()=>({ok:true,json:async()=>({apiVersion:"v1",status:"persisted",providerEventId:"other"})})});
  assert.deepEqual(await uncertain(event),{status:"ambiguous"});
});

test("inbox adapter keeps HTTPS by default and permits only explicitly authorized loopback HTTP", async () => {
  const token="synthetic-internal-token-32-characters"; const fetchImpl=async()=>({ok:true,json:async()=>({apiVersion:"v1",status:"persisted",providerEventId:"event-1"})});
  assert.doesNotThrow(()=>createRf02InboxHttpAdapter({endpoint:"https://n8n.example.test/webhook/rf02-inbox",serviceToken:token,fetchImpl}));
  for(const endpoint of ["http://localhost:5680/webhook/rf02-inbox","http://127.0.0.1:5680/webhook/rf02-inbox"]){
    assert.throws(()=>createRf02InboxHttpAdapter({endpoint,serviceToken:token,fetchImpl}),/INVALID_INBOX_ADAPTER_CONFIG/);
    const adapter=createRf02InboxHttpAdapter({endpoint,serviceToken:token,allowLoopbackHttp:true,fetchImpl});
    assert.deepEqual(await adapter({provider_event_id:"event-1"}),{status:"persisted"});
  }
});

test("loopback authorization never permits other HTTP destinations or embedded credentials", () => {
  const token="synthetic-internal-token-32-characters"; const fetchImpl=async()=>({});
  for(const endpoint of [
    "http://192.168.1.10:5680/webhook/rf02-inbox",
    "http://10.0.0.2:5680/webhook/rf02-inbox",
    "http://n8n.example.test/webhook/rf02-inbox",
    "http://127.1:5680/webhook/rf02-inbox",
    "http://localhost.example.test:5680/webhook/rf02-inbox",
    "http://user:password@localhost:5680/webhook/rf02-inbox",
    "https://user:password@n8n.example.test/webhook/rf02-inbox",
  ]) assert.throws(()=>createRf02InboxHttpAdapter({endpoint,serviceToken:token,allowLoopbackHttp:true,fetchImpl}),/INVALID_INBOX_ADAPTER_CONFIG/);
});

test("inbox adapter still requires a valid bearer token", () => {
  const base={endpoint:"https://n8n.example.test/webhook/rf02-inbox",fetchImpl:async()=>({})};
  for(const serviceToken of [undefined,"", "too-short"]) assert.throws(()=>createRf02InboxHttpAdapter({...base,serviceToken}),/INVALID_INBOX_ADAPTER_CONFIG/);
});
