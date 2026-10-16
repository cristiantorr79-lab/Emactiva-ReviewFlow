import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const output = fileURLToPath(new URL("../workflows/ReviewFlow_RF02_Inbox_Persistencia.json", import.meta.url));
const columns = ["provider_event_id","phone_e164","received_at","event_type","processing_status","service_id"];
const documentId = { __rl:true, mode:"list", value:"" };
const sheetName = { __rl:true, mode:"list", value:"" };
const code = `const body=$input.first().json.body??$input.first().json;const event=body?.event;if(body?.apiVersion!=="v1"||!event||!/^[A-Za-z0-9._:-]{1,200}$/.test(event.provider_event_id)||!/^\\+[1-9]\\d{7,14}$/.test(event.phone_e164)||event.event_type!=="LISTO"||event.processing_status!=="pending"||typeof event.received_at!=="string"||Number.isNaN(Date.parse(event.received_at)))throw new Error("INVALID_MINIMAL_EVENT");const allowed=["provider_event_id","phone_e164","received_at","event_type","processing_status"];if(Object.keys(event).some(k=>!allowed.includes(k)))throw new Error("UNEXPECTED_EVENT_FIELD");return [{json:{...event}}];`;
const decide = `const event=$("Validate minimal authenticated event").first().json;const rows=$input.all().map(i=>i.json).filter(r=>r&&Object.keys(r).length);const matches=rows.filter(r=>r.provider_event_id===event.provider_event_id);if(matches.length>1)throw new Error("DUPLICATE_STATE_AMBIGUOUS");if(matches.length===1){const x=matches[0];if(x.phone_e164!==event.phone_e164||x.received_at!==event.received_at||x.event_type!=="LISTO")throw new Error("DUPLICATE_ID_CONFLICT");return [{json:{route:"duplicate",event}}];}return [{json:{route:"append",event}}];`;
const verify = `const event=$("Select append route").first().json.event;const rows=$input.all().map(i=>i.json).filter(r=>r&&Object.keys(r).length);const matches=rows.filter(r=>r.provider_event_id===event.provider_event_id);if(matches.length!==1)throw new Error("PERSISTENCE_NOT_CONFIRMED");const x=matches[0];if(x.phone_e164!==event.phone_e164||x.received_at!==event.received_at||x.event_type!=="LISTO"||x.processing_status!=="pending")throw new Error("PERSISTENCE_MISMATCH");return [{json:{apiVersion:"v1",status:"persisted",providerEventId:event.provider_event_id}}];`;
const respond = name => ({ parameters:{respondWith:"json",responseBody:"={{ $json }}",options:{}},id:name.toLowerCase().replaceAll(" ","-"),name,type:"n8n-nodes-base.respondToWebhook",typeVersion:1.4,position:[1520,name.includes("duplicate")?300:0] });
const workflow = {
  name:"ReviewFlow RF-02 — Persistencia inbox_events (inactivo)",active:false,
  nodes:[
    {parameters:{httpMethod:"POST",path:"rf02-inbox-events",authentication:"headerAuth",responseMode:"responseNode",options:{}},id:"rf02-webhook",name:"Internal authenticated webhook",type:"n8n-nodes-base.webhook",typeVersion:2.1,position:[0,120],webhookId:"rf02-inbox-events-unconfigured"},
    {parameters:{jsCode:code},id:"rf02-validate",name:"Validate minimal authenticated event",type:"n8n-nodes-base.code",typeVersion:2,position:[240,120]},
    {parameters:{operation:"read",documentId,sheetName,options:{}},id:"rf02-read",name:"Read inbox_events for provider ID",type:"n8n-nodes-base.googleSheets",typeVersion:4.7,position:[480,120],alwaysOutputData:true},
    {parameters:{jsCode:decide},id:"rf02-decide",name:"Classify new or duplicate",type:"n8n-nodes-base.code",typeVersion:2,position:[720,120]},
    {parameters:{conditions:{options:{caseSensitive:true,leftValue:"",typeValidation:"strict",version:2},conditions:[{id:"append-route",leftValue:"={{ $json.route }}",rightValue:"append",operator:{type:"string",operation:"equals"}}],combinator:"and"},options:{}},id:"rf02-if",name:"Select append route",type:"n8n-nodes-base.if",typeVersion:2.2,position:[940,120]},
    {parameters:{operation:"append",documentId,sheetName,columns:{mappingMode:"defineBelow",value:{provider_event_id:"={{ $json.event.provider_event_id }}",phone_e164:"={{ $json.event.phone_e164 }}",received_at:"={{ $json.event.received_at }}",event_type:"={{ $json.event.event_type }}",processing_status:"pending",service_id:""},matchingColumns:[],schema:columns.map(id=>({id,displayName:id,required:false,defaultMatch:false,display:true,type:"string",canBeUsedToMatch:true,removed:false}))},options:{}},id:"rf02-append",name:"Append pending event",type:"n8n-nodes-base.googleSheets",typeVersion:4.7,position:[1160,0]},
    {parameters:{operation:"read",documentId,sheetName,options:{}},id:"rf02-reread",name:"Reread inbox_events",type:"n8n-nodes-base.googleSheets",typeVersion:4.7,position:[1380,0],alwaysOutputData:true},
    {parameters:{jsCode:verify},id:"rf02-verify",name:"Verify durable event",type:"n8n-nodes-base.code",typeVersion:2,position:[1600,0]},
    respond("Respond persisted"),
    {parameters:{jsCode:'const event=$json.event;return [{json:{apiVersion:"v1",status:"duplicate",providerEventId:event.provider_event_id}}];'},id:"rf02-duplicate",name:"Build duplicate response",type:"n8n-nodes-base.code",typeVersion:2,position:[1160,300]},
    respond("Respond duplicate"),
  ],
  connections:{
    "Internal authenticated webhook":{main:[[{node:"Validate minimal authenticated event",type:"main",index:0}]]},
    "Validate minimal authenticated event":{main:[[{node:"Read inbox_events for provider ID",type:"main",index:0}]]},
    "Read inbox_events for provider ID":{main:[[{node:"Classify new or duplicate",type:"main",index:0}]]},
    "Classify new or duplicate":{main:[[{node:"Select append route",type:"main",index:0}]]},
    "Select append route":{main:[[{node:"Append pending event",type:"main",index:0}],[{node:"Build duplicate response",type:"main",index:0}]]},
    "Append pending event":{main:[[{node:"Reread inbox_events",type:"main",index:0}]]},
    "Reread inbox_events":{main:[[{node:"Verify durable event",type:"main",index:0}]]},
    "Verify durable event":{main:[[{node:"Respond persisted",type:"main",index:0}]]},
    "Build duplicate response":{main:[[{node:"Respond duplicate",type:"main",index:0}]]},
  },
  settings:{executionOrder:"v1",saveDataErrorExecution:"none",saveDataSuccessExecution:"none",saveManualExecutions:false,saveExecutionProgress:false},pinData:{},versionId:"00000000-0000-4000-8000-000000000002",meta:{templateCredsSetupCompleted:false},tags:[]
};

const serialized=`${JSON.stringify(workflow,null,2)}\n`;
if(process.argv.includes("--check")){
  assert.equal(await readFile(output,"utf8"),serialized,"RF-02 workflow is not synchronized with its generator");
  assert.equal(workflow.active,false); assert.equal(workflow.nodes.some(node=>/whatsapp|schedule/i.test(node.type)),false);
  assert.equal(workflow.nodes.filter(node=>node.type==="n8n-nodes-base.googleSheets"&&node.parameters.operation==="append").length,1);
  assert.equal(workflow.nodes.filter(node=>node.type==="n8n-nodes-base.googleSheets"&&node.parameters.operation==="read").every(node=>node.alwaysOutputData===true),true);
  const synthetic={provider_event_id:"wamid.synthetic-1",phone_e164:"+12025550101",received_at:"2026-10-16T01:00:00.000Z",event_type:"LISTO",processing_status:"pending"};
  const runCode=(source,items,lookup={})=>runInNewContext(`(async()=>{${source}})()`,{$input:{first:()=>items[0],all:()=>items},$:name=>({first:()=>({json:lookup[name]})})});
  assert.equal((await runCode(code,[{json:{apiVersion:"v1",event:synthetic}}]))[0].json.provider_event_id,synthetic.provider_event_id);
  assert.equal((await runCode(decide,[{json:{}}],{"Validate minimal authenticated event":synthetic}))[0].json.route,"append");
  assert.equal((await runCode(decide,[{json:synthetic}],{"Validate minimal authenticated event":synthetic}))[0].json.route,"duplicate");
  await assert.rejects(runCode(decide,[{json:synthetic},{json:synthetic}],{"Validate minimal authenticated event":synthetic}),/DUPLICATE_STATE_AMBIGUOUS/);
  await assert.rejects(runCode(decide,[{json:{...synthetic,phone_e164:"+12025550102"}}],{"Validate minimal authenticated event":synthetic}),/DUPLICATE_ID_CONFLICT/);
  assert.equal((await runCode(verify,[{json:synthetic}],{"Select append route":{event:synthetic}}))[0].json.status,"persisted");
  await assert.rejects(runCode(verify,[{json:{}}],{"Select append route":{event:synthetic}}),/PERSISTENCE_NOT_CONFIRMED/);
  process.stdout.write("RF-02 workflow check: PASS\n");
}else{await writeFile(output,serialized,"utf8");process.stdout.write(`Generated ${output}\n`);}
