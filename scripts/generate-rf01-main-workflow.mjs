import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corePath = resolve(root, "src/rf01-core.js");
const outputPath = resolve(root, "workflows/ReviewFlow_RF01_Principal_actual.json");
const coreSource = await readFile(corePath, "utf8");
const coreHash = createHash("sha256").update(coreSource).digest("hex");
const core = coreSource.replace(/\bexport\s+/g, "").trim();

// Portable workflow-local configuration. Edit the generated Code node in n8n;
// secrets remain in credentials. Safety gates intentionally default to false.
const RF01_LOCAL_CONFIG = Object.freeze({
  confirmationWindowDays: 7,
  timezone: "",
  allowedStart: "",
  allowedEnd: "",
  criticalConfigPresent: false,
  exclusiveExecutionVerified: false,
  sheetsWriteEnabled: false,
  sendEnabled: false,
  authorizedServiceIds: [],
  ca09Test: { enabled: false, serviceId: "", operationKind: "request" },
  coordinator: {
    apiVersion: "v1",
    baseUrl: "",
    requestTimeoutMs: 20000,
    testMode: false,
    providerMode: "",
  },
});

const SERVICE_COLUMNS = ["service_id", "customer_name", "phone_e164", "appointment_at", "review_link", "status", "request_sent", "request_sent_at", "review_confirmed", "review_confirmed_at", "reminder_sent", "reminder_sent_at", "thanks_sent", "thanks_sent_at", "completed_at", "completion_reason", "operation_phase", "error_code", "updated_at"];
const EVENT_COLUMNS = ["provider_event_id", "phone_e164", "received_at", "event_type", "processing_status", "service_id"];
const document = { __rl: true, value: "", mode: "list", cachedResultName: "Select ReviewFlow document" };
const sheet = name => ({ __rl: true, value: "", mode: "list", cachedResultName: `Select ${name}` });
const schema = (columns, match) => columns.map(id => ({ id, displayName: id, required: false, defaultMatch: id === match, display: true, type: "string", canBeUsedToMatch: true, removed: false }));
const collect = source => `const rows=$input.all().map(i=>i.json).filter(r=>r&&Object.keys(r).length); return [{json:{source:"${source}",rows}}];`;
const read = (id, name, tab, x, y) => ({ parameters: { operation: "read", documentId: document, sheetName: sheet(tab), options: {} }, id, name, type: "n8n-nodes-base.googleSheets", typeVersion: 4.7, position: [x, y], alwaysOutputData: true });
const update = (id, name, tab, match, columns, value, x, y) => ({
  parameters: { operation: "update", documentId: document, sheetName: sheet(tab), columns: { mappingMode: "defineBelow", value, matchingColumns: [match], schema: schema(columns, match), attemptToConvertTypes: false, convertFieldsToString: false }, options: {} },
  id, name, type: "n8n-nodes-base.googleSheets", typeVersion: 4.7, position: [x, y],
});

const planner = String.raw`

const envelopes=$input.all().map(i=>i.json);
const servicesEnvelope=envelopes.find(x=>x.source==="services");
const eventsEnvelope=envelopes.find(x=>x.source==="inbox_events");
if(!servicesEnvelope||!eventsEnvelope) throw new Error("RF01_READ_INCOMPLETE");
const localConfig=${JSON.stringify(RF01_LOCAL_CONFIG)};
const ran=name=>{try{return Boolean($(name).first())}catch{return false;}};
const manualRun=ran("Manual Trigger"),scheduledRun=ran("Schedule Trigger (requires RF01_SCHEDULE_CRON)");
const executionMode=manualRun&&!scheduledRun?"manual_test":scheduledRun&&!manualRun?"scheduled_operational":"unknown_blocked";
const bool=v=>v===true||String(v??"").trim().toLowerCase()==="true";
const nullable=v=>v===""||v===undefined||v===null?null:v;
const flag=v=>{if(v===true||v===false)return v;if(typeof v==="string"&&/^(true|false)$/i.test(v.trim()))return v.trim().toLowerCase()==="true";return v;};
const services=servicesEnvelope.rows.map(r=>{const s={...r};for(const k of ["request_sent","review_confirmed","reminder_sent","thanks_sent"])s[k]=flag(s[k]);for(const k of ["request_sent_at","review_confirmed_at","reminder_sent_at","thanks_sent_at","completed_at","completion_reason","error_code"])s[k]=nullable(s[k]);return s;});
const events=eventsEnvelope.rows.map(r=>({...r,service_id:nullable(r.service_id)}));
const now=new Date();
const config={
  requestDelayHours:2, reminderDelayHours:12,
  confirmationWindowDays:Number(localConfig.confirmationWindowDays),
  timezone:String(localConfig.timezone||""), allowedStart:String(localConfig.allowedStart||""), allowedEnd:String(localConfig.allowedEnd||""),
  criticalConfigPresent:executionMode==="scheduled_operational"&&bool(localConfig.criticalConfigPresent), contactAuthorized:false,
  exclusiveExecutionVerified:executionMode==="scheduled_operational"&&bool(localConfig.exclusiveExecutionVerified),
  sheetsWriteEnabled:executionMode==="scheduled_operational"&&bool(localConfig.sheetsWriteEnabled),
  sendEnabled:executionMode==="scheduled_operational"&&bool(localConfig.sendEnabled),
  authorizedServiceIds:new Set(Array.isArray(localConfig.authorizedServiceIds)?localConfig.authorizedServiceIds.map(x=>String(x).trim()).filter(Boolean):[]),
  coordinator:{...localConfig.coordinator}
};
const validation=[];const serviceCounts=new Map();const eventCounts=new Map();
const configurationErrors=[];
if(!Number.isFinite(config.confirmationWindowDays)||config.confirmationWindowDays<=0)configurationErrors.push("INVALID_CONFIRMATION_WINDOW");
if(config.sendEnabled&&(!config.timezone||!/^\d\d:\d\d$/.test(config.allowedStart)||!/^\d\d:\d\d$/.test(config.allowedEnd)))configurationErrors.push("INVALID_ALLOWED_SCHEDULE");
for(const s of services){const errors=validateService(s);serviceCounts.set(s.service_id,(serviceCounts.get(s.service_id)||0)+1);if(errors.length)validation.push({record:"service",id:s.service_id,errors});}
for(const [id,count] of serviceCounts)if(count>1)validation.push({record:"service",id,errors:["DUPLICATE_SERVICE_ID"]});
for(const e of events){const errors=validateEvent(e);eventCounts.set(e.provider_event_id,(eventCounts.get(e.provider_event_id)||0)+1);if(errors.length)validation.push({record:"event",id:e.provider_event_id,errors});}
for(const [id,count] of eventCounts)if(count>1)validation.push({record:"event",id,errors:["DUPLICATE_PROVIDER_EVENT_ID"]});
const invalidServices=new Set(validation.filter(x=>x.record==="service").map(x=>x.id));
const invalidEvents=new Set(validation.filter(x=>x.record==="event").map(x=>x.id));
let command=null;const eventDiagnostics=[];const unresolvedServices=new Set();
for(const e of events){
 if(!["pending","ambiguous"].includes(e.processing_status))continue;
 if(invalidEvents.has(e.provider_event_id)){for(const s of services)if(s.phone_e164===e.phone_e164)unresolvedServices.add(s.service_id);eventDiagnostics.push({id:e.provider_event_id,result:"BLOCKED_INVALID_OR_DUPLICATE_EVENT"});continue;}
 const correlation=correlationForEvent(e,services,{confirmationWindowDays:config.confirmationWindowDays});
 if(correlation.uncertain||correlation.candidates.length!==1||invalidServices.has(correlation.candidates[0]?.service_id)){for(const s of correlation.potential)unresolvedServices.add(s.service_id);eventDiagnostics.push({id:e.provider_event_id,result:"NEEDS_RECONCILIATION"});continue;}
 if(command)continue;
 const s=correlation.candidates[0];
 if(!s.review_confirmed)command={kind:"confirm",service_id:s.service_id,provider_event_id:e.provider_event_id,received_at:e.received_at,service:s,event:e};
 else command={kind:"mark_duplicate_event",service_id:s.service_id,provider_event_id:e.provider_event_id,service:s,event:e};
}
function scheduleAllowed(){
 if(!config.timezone||!/^\d\d:\d\d$/.test(config.allowedStart)||!/^\d\d:\d\d$/.test(config.allowedEnd))return false;
 try{const parts=new Intl.DateTimeFormat("en-GB",{timeZone:config.timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);const hm=parts.find(x=>x.type==="hour").value+":"+parts.find(x=>x.type==="minute").value;return config.allowedStart<=config.allowedEnd?hm>=config.allowedStart&&hm<=config.allowedEnd:hm>=config.allowedStart||hm<=config.allowedEnd;}catch{return false;}
}
if(!command){
 for(const s of [...services].sort((a,b)=>String(a.service_id).localeCompare(String(b.service_id)))){
  if(invalidServices.has(s.service_id)||unresolvedServices.has(s.service_id)||s.operation_phase!=="idle")continue;
  let kind=null;if(s.review_confirmed&&!s.thanks_sent)kind="thanks";else if(eligibleForRequest(s,now,{requestDelayHours:2}))kind="request";else if(eligibleForReminder(s,now,{reminderDelayHours:12}))kind="reminder";
  if(kind){command={kind,service_id:s.service_id,service:s};break;}
 }
}
const writeAuthorized=config.exclusiveExecutionVerified&&config.sheetsWriteEnabled;
const isOutgoingCommand=command&&["request","reminder","thanks"].includes(command.kind);
const coordinatorUrl=String(config.coordinator.baseUrl||"").replace(/\/$/,"");
const coordinatorTimeoutMs=Number(config.coordinator.requestTimeoutMs);
function coordinatorUrlAllowed(value){
 if(typeof value!=="string"||/\s|\\/.test(value))return false;
 const match=/^(https?):\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(value);if(!match||match[2].includes("@"))return false;
 const authority=match[2];let hostname="",port="";
 if(authority.startsWith("[")){const end=authority.indexOf("]");if(end<0)return false;hostname=authority.slice(0,end+1).toLowerCase();const rest=authority.slice(end+1);if(rest&&!rest.startsWith(":"))return false;port=rest.slice(1);}
 else{const parts=authority.split(":");if(parts.length>2)return false;hostname=parts[0].toLowerCase();port=parts[1]||"";}
 if(!hostname||(port&&(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)))return false;
 const protocol=match[1].toLowerCase()+":";if(protocol==="https:")return true;
 const localGatesClosed=![localConfig.criticalConfigPresent,localConfig.exclusiveExecutionVerified,localConfig.sheetsWriteEnabled,localConfig.sendEnabled].some(bool);
 return protocol==="http:"&&hostname==="host.docker.internal"&&executionMode==="manual_test"&&config.coordinator.testMode===true&&config.coordinator.providerMode==="simulated"&&localGatesClosed;
}
const coordinatorConfigured=config.coordinator.apiVersion==="v1"&&coordinatorUrlAllowed(coordinatorUrl)&&Number.isSafeInteger(coordinatorTimeoutMs)&&coordinatorTimeoutMs>=1000&&coordinatorTimeoutMs<=120000;
const sendAuthorized=writeAuthorized&&config.sendEnabled&&config.criticalConfigPresent&&config.authorizedServiceIds.has(command?.service_id)&&scheduleAllowed()&&coordinatorConfigured;
const ca09=localConfig.ca09Test||{};const ca09TestAuthorized=Boolean(command&&executionMode==="manual_test"&&coordinatorConfigured&&ca09.enabled===true&&/^synthetic-ca09-[A-Za-z0-9._:-]+$/.test(ca09.serviceId)&&command.service_id===ca09.serviceId&&command.kind===ca09.operationKind&&command.kind==="request"&&!writeAuthorized&&!config.sendEnabled&&!config.criticalConfigPresent);
const executionAuthorized=Boolean(command&&configurationErrors.length===0&&((isOutgoingCommand?sendAuthorized:writeAuthorized)||ca09TestAuthorized));
return [{json:{workflow:"RF-01",mode:"SAFE_DISABLED_BY_DEFAULT",execution_mode:executionMode,execution_id:String($execution.id||""),checked_at:now.toISOString(),services_read:services.length,events_read:events.length,validation,configuration_errors:configurationErrors,event_diagnostics:eventDiagnostics,command,execution_authorized:executionAuthorized,ca09_test_authorized:ca09TestAuthorized,gates:{exclusive_execution:config.exclusiveExecutionVerified,sheets_write:config.sheetsWriteEnabled,send:config.sendEnabled,critical_config:config.criticalConfigPresent,contact_authorized:config.authorizedServiceIds.has(command?.service_id),schedule_allowed:scheduleAllowed()},policy:{confirmationWindowDays:config.confirmationWindowDays},coordinator:{apiVersion:config.coordinator.apiVersion,baseUrl:coordinatorUrl,requestTimeoutMs:coordinatorTimeoutMs,urlAllowed:coordinatorConfigured}}}];
`;
const plannerCode = `// GENERATED from src/rf01-core.js\n// source_sha256: ${coreHash}\n\n${core}${planner}`;
const gateCode = String.raw`
const p=$input.first().json;
if(!p.execution_authorized||!p.command)return [{json:{route:"blocked",result:"BLOCKED",execution_mode:p.execution_mode,checked_at:p.checked_at,gates:p.gates,validation:p.validation,configuration_errors:p.configuration_errors,event_diagnostics:p.event_diagnostics,reason:"OPERATIVE_GATES_NOT_VERIFIED"}}];
return [{json:{...p.command,route:p.command.kind==="confirm"?"confirmation":p.command.kind==="mark_duplicate_event"?"event_only":"outgoing",executionId:p.execution_id,coordinator:p.coordinator,policy:p.policy,checked_at:p.checked_at,ca09Test:p.ca09_test_authorized===true}}];
`;
const filter = route => `return $input.all().filter(i=>i.json.route==="${route}");`;
const confirmPrepare = String.raw`
const x=$input.first().json;return [{json:{...x,coordinatorUrl:x.coordinator.baseUrl+"/v1/services/state/resolve",coordinatorTimeoutMs:x.coordinator.requestTimeoutMs,coordinatorRequest:{apiVersion:"v1",service:x.service}}}];
`;
const prepareCoordinatorCommand = String.raw`
const source=(()=>{for(const n of ["Prepare confirmation state","Revalidate and prepare checkpoint"]){try{return $(n).first().json}catch{}}throw new Error("AUTHORITATIVE_SOURCE_MISSING")})();const raw=$input.first().json;const body=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};const version=Number(body.serviceVersion);const projection=body.projection&&typeof body.projection==="object"&&!Array.isArray(body.projection)?body.projection:null;if(body.apiVersion!=="v1"||body.outcome!=="accepted"||body.code!=="STATE_RESOLVED"||!Number.isSafeInteger(version)||version<1||!projection||projection.service_id!==source.service_id)throw new Error("AUTHORITATIVE_STATE_NOT_RESOLVED");const operationRef="rf01:"+source.service_id+":"+source.kind;const confirmation=source.kind==="confirm";const coordinatorRequest=confirmation?{apiVersion:"v1",confirmation:{executionId:source.executionId,serviceId:source.service_id,expectedVersion:version,confirmedAt:source.received_at}}:{apiVersion:"v1",operation:{executionId:source.executionId,serviceId:source.service_id,operationKind:source.kind,operationRef,expectedVersion:version},message:{phoneE164:projection.phone_e164,customerName:projection.customer_name,reviewLink:projection.review_link}};return [{json:{...source,authoritativeVersion:version,operationRef,coordinatorUrl:source.coordinator.baseUrl+(confirmation?"/v1/confirmations":"/v1/operations/outgoing"),coordinatorTimeoutMs:source.coordinator.requestTimeoutMs,coordinatorRequest}}];
`;
const verifyConfirmation = String.raw`
const action=$("Filter confirmation projection").first().json;const rows=$input.all().map(i=>i.json).filter(r=>r&&Object.keys(r).length);const m=rows.filter(r=>r.service_id===action.service_id);if(m.length!==1||String(m[0].review_confirmed).toLowerCase()!=="true"||m[0].review_confirmed_at!==action.service.review_confirmed_at)throw new Error("CONFIRMATION_PROJECTION_NOT_PERSISTED");return [{json:{provider_event_id:action.provider_event_id,processing_status:"processed",service_id:action.service_id,operation:"confirmation"}}];
`;
const verifyEvent = String.raw`
const action=$("Persist processed event").first().json;const rows=$input.all().map(i=>i.json).filter(r=>r&&Object.keys(r).length);const m=rows.filter(r=>r.provider_event_id===action.provider_event_id);if(m.length!==1||m[0].processing_status!=="processed"||m[0].service_id!==action.service_id)throw new Error("EVENT_RESULT_NOT_PERSISTED");return [{json:{result:"PASS",operation:action.operation||"confirmation",service_id:action.service_id,provider_event_id:action.provider_event_id}}];
`;
const revalidateOutgoing = `
const action=$("Filter outgoing command").first().json;const inputs=$input.all().map(i=>i.json);const se=inputs.find(x=>x.source==="services"),ee=inputs.find(x=>x.source==="inbox_events");if(!se||!ee)throw new Error("OUTGOING_REREAD_INCOMPLETE");const normalize=s=>{const x={...s};for(const k of ["request_sent","review_confirmed","reminder_sent","thanks_sent"]){if(typeof x[k]==="string"&&/^(true|false)$/i.test(x[k].trim()))x[k]=x[k].trim().toLowerCase()==="true";}for(const k of ["request_sent_at","review_confirmed_at","reminder_sent_at","thanks_sent_at","completed_at","completion_reason","error_code"])if(x[k]===""||x[k]===undefined)x[k]=null;return x;};const allServices=se.rows.map(normalize);const rows=allServices.filter(r=>r.service_id===action.service_id);if(rows.length!==1||rows[0].phone_e164!==action.service.phone_e164)throw new Error("OUTGOING_IDENTITY_MISMATCH");const fresh=rows[0];if(validateService(fresh).length)throw new Error("OUTGOING_SERVICE_INVALID");if(action.kind==="reminder"){const windowDays=Number(action.policy?.confirmationWindowDays);if(!Number.isFinite(windowDays)||windowDays<=0)throw new Error("INVALID_CONFIRMATION_WINDOW");for(const e of ee.rows.filter(e=>["pending","ambiguous"].includes(e.processing_status))){if(validateEvent(e).length&&e.phone_e164===fresh.phone_e164)throw new Error("REMINDER_BLOCKED_BY_UNCERTAIN_EVENT");const c=correlationForEvent(e,allServices,{confirmationWindowDays:windowDays});if(c.uncertain&&c.potential.some(s=>s.service_id===fresh.service_id)||c.candidates.some(s=>s.service_id===fresh.service_id))throw new Error("REMINDER_BLOCKED_BY_UNRESOLVED_EVENT");}}if(!action.executionId||action.coordinator?.apiVersion!=="v1"||!/^https:\/\//.test(action.coordinator.baseUrl))throw new Error("COORDINATOR_CONFIG_INVALID");return [{json:{...action,service:fresh,coordinatorUrl:action.coordinator.baseUrl+"/v1/services/state/resolve",coordinatorTimeoutMs:action.coordinator.requestTimeoutMs,coordinatorRequest:{apiVersion:"v1",service:fresh}}}];
`;
const classifySend = String.raw`
const a=$("Prepare coordinator command").first().json;const raw=$input.first().json;const body=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};const version=Number(body.serviceVersion);const safeCode=typeof body.code==="string"&&/^[A-Z0-9_]{1,80}$/.test(body.code)?body.code:"NO_TRUSTED_RESPONSE";const projectionKeys=["service_id","status","request_sent","request_sent_at","review_confirmed","review_confirmed_at","reminder_sent","reminder_sent_at","thanks_sent","thanks_sent_at","completed_at","completion_reason","operation_phase","error_code","updated_at"];const projection=body.projection&&typeof body.projection==="object"&&!Array.isArray(body.projection)?Object.fromEntries(projectionKeys.map(k=>[k,body.projection[k]])):null;const validEnvelope=body.apiVersion==="v1"&&safeCode!=="NO_TRUSTED_RESPONSE";const newerProjection=validEnvelope&&projection&&projection.service_id===a.service_id&&Number.isSafeInteger(version)&&version>a.authoritativeVersion;const accepted=validEnvelope&&body.outcome==="accepted"&&safeCode==="PROVIDER_ACCEPTED"&&newerProjection;const recovered=validEnvelope&&body.outcome==="blocked"&&newerProjection&&["STALE_VERSION","SERVICE_ALREADY_CONFIRMED"].includes(safeCode);const knownBlocked=validEnvelope&&body.outcome==="blocked"&&["IDEMPOTENCY_KEY_EXISTS","RUN_ALREADY_ACTIVE","STALE_VERSION","SERVICE_ALREADY_CONFIRMED","OWNER_MISMATCH","COORDINATOR_UNAVAILABLE","STATE_NOT_DURABLE"].includes(safeCode);const rejected=validEnvelope&&body.outcome==="rejected"&&safeCode==="SEND_REJECTED";const result=accepted?"accepted":recovered?"recovered_projection":knownBlocked?"blocked":rejected?"rejected":"uncertain";const common={kind:a.kind,service_id:a.service_id,provider_event_id:a.provider_event_id??null,operationRef:a.operationRef,send_result:result,coordinator_code:safeCode,serviceVersion:Number.isSafeInteger(version)&&version>0?version:null};if(a.ca09Test)return [{json:{...common,route:"ca09_test_result",result}}];if(!accepted&&!recovered)return [{json:{...common,route:"blocked"}}];return [{json:{...common,route:a.kind==="confirm"?"confirmation_projection":"outgoing_projection",service:projection}}];
`;
const verifyFinal = String.raw`
const a=$("Classify coordinator result").first().json;const rows=$input.all().map(i=>i.json).filter(r=>r&&Object.keys(r).length);const m=rows.filter(r=>r.service_id===a.service_id);if(m.length!==1||m[0].operation_phase!==a.service.operation_phase)throw new Error("FINAL_STATE_NOT_PERSISTED");return [{json:{result:"PASS",operation:a.kind,send_result:a.send_result,service_id:a.service_id,operationRef:a.operationRef,coordinator_code:a.coordinator_code,note:"Aceptación del proveedor no demuestra entrega al destinatario ni exactamente una vez."}}];
`;

const serviceValues = columns => Object.fromEntries(columns.map(c => [c, `={{ $json.service.${c} }}`]));
const projectionColumns = ["service_id", "status", "request_sent", "request_sent_at", "review_confirmed", "review_confirmed_at", "reminder_sent", "reminder_sent_at", "thanks_sent", "thanks_sent_at", "completed_at", "completion_reason", "operation_phase", "error_code", "updated_at"];
const confirmationValues = serviceValues(projectionColumns);
const finalOutgoingValues = serviceValues(projectionColumns);
const nodes = [
 {parameters:{},id:"m1",name:"Manual Trigger",type:"n8n-nodes-base.manualTrigger",typeVersion:1,position:[0,0]},
 {parameters:{rule:{interval:[{field:"cronExpression",expression:"0 */15 * * * *"}]}},id:"s1",name:"Schedule Trigger (requires RF01_SCHEDULE_CRON)",type:"n8n-nodes-base.scheduleTrigger",typeVersion:1.2,position:[0,180],disabled:true,notes:"Portable placeholder: every 15 minutes. Configure visually and keep disabled until exclusive execution and all operative gates are verified.",notesInFlow:true},
 read("r1","Read services","services",240,-80),read("r2","Read inbox_events","inbox_events",240,120),
 {parameters:{jsCode:collect("services")},id:"c1",name:"Collect services",type:"n8n-nodes-base.code",typeVersion:2,position:[460,-80]},
 {parameters:{jsCode:collect("inbox_events")},id:"c2",name:"Collect inbox_events",type:"n8n-nodes-base.code",typeVersion:2,position:[460,120]},
 {parameters:{mode:"append",options:{}},id:"mg1",name:"Wait for source reads",type:"n8n-nodes-base.merge",typeVersion:3,position:[680,20]},
 {parameters:{jsCode:plannerCode},id:"p1",name:"Plan one safe RF-01 command",type:"n8n-nodes-base.code",typeVersion:2,position:[900,20]},
 {parameters:{jsCode:gateCode},id:"g1",name:"Enforce operative gates",type:"n8n-nodes-base.code",typeVersion:2,position:[1120,20],notes:"No writes or sends unless exclusive execution, configuration, per-service authorization and schedule are all verified.",notesInFlow:true},
 {parameters:{jsCode:filter("confirmation")},id:"fc",name:"Filter confirmation command",type:"n8n-nodes-base.code",typeVersion:2,position:[1340,-120]},
 {parameters:{jsCode:filter("outgoing")},id:"fo",name:"Filter outgoing command",type:"n8n-nodes-base.code",typeVersion:2,position:[1340,160]},
 {parameters:{jsCode:filter("event_only")},id:"fe",name:"Filter event-only command",type:"n8n-nodes-base.code",typeVersion:2,position:[1340,-280]},
 {parameters:{jsCode:filter("blocked")},id:"fb",name:"Blocked safe output",type:"n8n-nodes-base.code",typeVersion:2,position:[1340,20]},
 {parameters:{jsCode:'const x=$input.first().json;return [{json:{provider_event_id:x.provider_event_id,processing_status:"processed",service_id:x.service_id,operation:"duplicate_event"}}];'},id:"pe",name:"Prepare event-only projection",type:"n8n-nodes-base.code",typeVersion:2,position:[1560,-280]},
 {parameters:{jsCode:confirmPrepare},id:"cp",name:"Prepare confirmation state",type:"n8n-nodes-base.code",typeVersion:2,position:[1560,-120]},
 read("ros","Outgoing reread services","services",1560,100),read("roe","Outgoing reread inbox_events","inbox_events",1560,260),
 {parameters:{jsCode:collect("services")},id:"cos",name:"Collect outgoing services",type:"n8n-nodes-base.code",typeVersion:2,position:[1780,100]},
 {parameters:{jsCode:collect("inbox_events")},id:"coe",name:"Collect outgoing events",type:"n8n-nodes-base.code",typeVersion:2,position:[1780,260]},
 {parameters:{mode:"append",options:{}},id:"mg2",name:"Wait for outgoing rereads",type:"n8n-nodes-base.merge",typeVersion:3,position:[2000,180]},
 {parameters:{jsCode:`${core}\n${revalidateOutgoing}`},id:"rp",name:"Revalidate and prepare checkpoint",type:"n8n-nodes-base.code",typeVersion:2,position:[2220,180]},
 {parameters:{method:"POST",url:"={{ $json.coordinatorUrl }}",authentication:"genericCredentialType",genericAuthType:"httpHeaderAuth",sendHeaders:true,headerParameters:{parameters:[{name:"Content-Type",value:"application/json"}]},sendBody:true,contentType:"raw",rawContentType:"application/json",body:"={{ JSON.stringify($json.coordinatorRequest) }}",options:{timeout:"={{ $json.coordinatorTimeoutMs }}",response:{response:{neverError:true}}}},id:"rs",name:"Resolve authoritative service state",type:"n8n-nodes-base.httpRequest",typeVersion:4.2,position:[2500,20],onError:"stopWorkflow",notes:"Autodetect body only. HTTP status is authenticated coordinator data; transport failures stop before effects.",notesInFlow:true},
 {parameters:{jsCode:prepareCoordinatorCommand},id:"pc",name:"Prepare coordinator command",type:"n8n-nodes-base.code",typeVersion:2,position:[2720,20]},
 {parameters:{method:"POST",url:"={{ $json.coordinatorUrl }}",authentication:"genericCredentialType",genericAuthType:"httpHeaderAuth",sendHeaders:true,headerParameters:{parameters:[{name:"Content-Type",value:"application/json"}]},sendBody:true,contentType:"raw",rawContentType:"application/json",body:"={{ JSON.stringify($json.coordinatorRequest) }}",options:{timeout:"={{ $json.coordinatorTimeoutMs }}",response:{response:{neverError:true}}}},id:"wa",name:"RF-01 Coordinator HTTP",type:"n8n-nodes-base.httpRequest",typeVersion:4.2,position:[2940,20],onError:"stopWorkflow",notes:"Autodetect body only. 200/409/422 are classified from authenticated coordinator data; transport failures stop closed.",notesInFlow:true},
 {parameters:{jsCode:classifySend},id:"cl",name:"Classify coordinator result",type:"n8n-nodes-base.code",typeVersion:2,position:[3160,20]},
 {parameters:{jsCode:filter("confirmation_projection")},id:"fcp",name:"Filter confirmation projection",type:"n8n-nodes-base.code",typeVersion:2,position:[3380,-120]},
 {parameters:{jsCode:filter("outgoing_projection")},id:"fop",name:"Filter outgoing projection",type:"n8n-nodes-base.code",typeVersion:2,position:[3380,180]},
 {parameters:{jsCode:filter("ca09_test_result")},id:"fca09",name:"CA09 synthetic result",type:"n8n-nodes-base.code",typeVersion:2,position:[3380,320],notes:"Read-only workflow output. No Google Sheets projection is connected from this branch.",notesInFlow:true},
 update("uc","Persist confirmation","services","service_id",SERVICE_COLUMNS,confirmationValues,3600,-120),read("rrc","Reread confirmed service","services",3820,-120),
 {parameters:{jsCode:verifyConfirmation},id:"vc",name:"Verify confirmation persisted",type:"n8n-nodes-base.code",typeVersion:2,position:[4040,-120]},
 update("ue","Persist processed event","inbox_events","provider_event_id",EVENT_COLUMNS,{provider_event_id:"={{ $json.provider_event_id }}",processing_status:"={{ $json.processing_status }}",service_id:"={{ $json.service_id }}"},4260,-120),read("rre","Reread processed event","inbox_events",4480,-120),
 {parameters:{jsCode:verifyEvent},id:"ve",name:"Verify event persisted",type:"n8n-nodes-base.code",typeVersion:2,position:[4700,-120]},
 update("uf","Persist final outgoing state","services","service_id",SERVICE_COLUMNS,finalOutgoingValues,3600,180),read("rrf","Reread final outgoing state","services",3820,180),
 {parameters:{jsCode:verifyFinal},id:"vf",name:"Verify final state",type:"n8n-nodes-base.code",typeVersion:2,position:[4040,180]},
];
const connections={
 "Manual Trigger":{main:[[{node:"Read services",type:"main",index:0},{node:"Read inbox_events",type:"main",index:0}]]},
 "Schedule Trigger (requires RF01_SCHEDULE_CRON)":{main:[[{node:"Read services",type:"main",index:0},{node:"Read inbox_events",type:"main",index:0}]]},
 "Read services":{main:[[{node:"Collect services",type:"main",index:0}]]},"Read inbox_events":{main:[[{node:"Collect inbox_events",type:"main",index:0}]]},
 "Collect services":{main:[[{node:"Wait for source reads",type:"main",index:0}]]},"Collect inbox_events":{main:[[{node:"Wait for source reads",type:"main",index:1}]]},
 "Wait for source reads":{main:[[{node:"Plan one safe RF-01 command",type:"main",index:0}]]},"Plan one safe RF-01 command":{main:[[{node:"Enforce operative gates",type:"main",index:0}]]},
 "Enforce operative gates":{main:[[{node:"Filter confirmation command",type:"main",index:0},{node:"Filter outgoing command",type:"main",index:0},{node:"Filter event-only command",type:"main",index:0},{node:"Blocked safe output",type:"main",index:0}]]},
 "Filter event-only command":{main:[[{node:"Prepare event-only projection",type:"main",index:0}]]},"Prepare event-only projection":{main:[[{node:"Persist processed event",type:"main",index:0}]]},
 "Filter confirmation command":{main:[[{node:"Prepare confirmation state",type:"main",index:0}]]},"Prepare confirmation state":{main:[[{node:"Resolve authoritative service state",type:"main",index:0}]]},
 "Filter outgoing command":{main:[[{node:"Outgoing reread services",type:"main",index:0},{node:"Outgoing reread inbox_events",type:"main",index:0}]]},"Outgoing reread services":{main:[[{node:"Collect outgoing services",type:"main",index:0}]]},"Outgoing reread inbox_events":{main:[[{node:"Collect outgoing events",type:"main",index:0}]]},"Collect outgoing services":{main:[[{node:"Wait for outgoing rereads",type:"main",index:0}]]},"Collect outgoing events":{main:[[{node:"Wait for outgoing rereads",type:"main",index:1}]]},"Wait for outgoing rereads":{main:[[{node:"Revalidate and prepare checkpoint",type:"main",index:0}]]},"Revalidate and prepare checkpoint":{main:[[{node:"Resolve authoritative service state",type:"main",index:0}]]},
 "Resolve authoritative service state":{main:[[{node:"Prepare coordinator command",type:"main",index:0}]]},"Prepare coordinator command":{main:[[{node:"RF-01 Coordinator HTTP",type:"main",index:0}]]},"RF-01 Coordinator HTTP":{main:[[{node:"Classify coordinator result",type:"main",index:0}]]},"Classify coordinator result":{main:[[{node:"Filter confirmation projection",type:"main",index:0},{node:"Filter outgoing projection",type:"main",index:0},{node:"CA09 synthetic result",type:"main",index:0},{node:"Blocked safe output",type:"main",index:0}]]},
 "Filter confirmation projection":{main:[[{node:"Persist confirmation",type:"main",index:0}]]},"Persist confirmation":{main:[[{node:"Reread confirmed service",type:"main",index:0}]]},"Reread confirmed service":{main:[[{node:"Verify confirmation persisted",type:"main",index:0}]]},"Verify confirmation persisted":{main:[[{node:"Persist processed event",type:"main",index:0}]]},"Persist processed event":{main:[[{node:"Reread processed event",type:"main",index:0}]]},"Reread processed event":{main:[[{node:"Verify event persisted",type:"main",index:0}]]},
 "Filter outgoing projection":{main:[[{node:"Persist final outgoing state",type:"main",index:0}]]},"Persist final outgoing state":{main:[[{node:"Reread final outgoing state",type:"main",index:0}]]},"Reread final outgoing state":{main:[[{node:"Verify final state",type:"main",index:0}]]},
};
const generatedWorkflow={name:"ReviewFlow — RF-01 — Principal",nodes,connections,active:false,pinData:{},settings:{executionOrder:"v1"},tags:[]};
const authority=JSON.parse(await readFile(outputPath,"utf8"));
if(authority.name!==generatedWorkflow.name||authority.nodes.length!==37)throw new Error("Current workflow authority identity is invalid");
const generatedByName=new Map(generatedWorkflow.nodes.map(node=>[node.name,node]));
const ca10CodeNodes=new Set(["Prepare coordinator command","Classify coordinator result"]);
const ca10HttpNodes=new Set(["Resolve authoritative service state","RF-01 Coordinator HTTP"]);
const synchronizedNodes=authority.nodes.map(current=>{
 const generated=generatedByName.get(current.name);if(!generated)throw new Error(`Current workflow node is not represented by generator: ${current.name}`);
 if(ca10CodeNodes.has(current.name))return {...current,parameters:{...current.parameters,jsCode:generated.parameters.jsCode}};
 if(ca10HttpNodes.has(current.name))return {...current,parameters:generated.parameters,onError:"stopWorkflow",notes:generated.notes,notesInFlow:true};
 return current;
});
const synchronizedConnections=structuredClone(authority.connections);
synchronizedConnections["RF-01 Coordinator HTTP"]=generatedWorkflow.connections["RF-01 Coordinator HTTP"];
const workflow={...authority,nodes:synchronizedNodes,connections:synchronizedConnections,active:false};
const serialized=`${JSON.stringify(workflow,null,2)}\n`;

if(process.argv.includes("--check")){
 const existing=await readFile(outputPath,"utf8");if(existing!==serialized)throw new Error("Main workflow out of sync");const parsed=JSON.parse(existing);
 if(parsed.active!==false||!parsed.nodes.some(n=>n.type==="n8n-nodes-base.scheduleTrigger"&&n.disabled===true))throw new Error("Schedule safety invalid");
 if(parsed.nodes.some(n=>JSON.stringify(n).includes("Bearer synthetic-secret")||n.parameters?.headerParameters?.parameters?.some(h=>String(h.name).toLowerCase()==="authorization")))throw new Error("Embedded authentication material");
 const updates=parsed.nodes.filter(n=>n.type==="n8n-nodes-base.googleSheets"&&n.parameters.operation==="update");if(updates.length!==3)throw new Error("Expected three projection/event update stages");
 const expectedUpdates={
  "Persist confirmation":{match:"service_id",keys:projectionColumns},
  "Persist processed event":{match:"provider_event_id",keys:["provider_event_id","processing_status","service_id"]},
  "Persist final outgoing state":{match:"service_id",keys:projectionColumns},
 };
 for(const [name,expected] of Object.entries(expectedUpdates)){
  const node=updates.find(n=>n.name===name);if(!node||node.id!==authority.nodes.find(n=>n.name===name)?.id)throw new Error(`Update node identity changed: ${name}`);
  if(JSON.stringify(node.parameters.columns.matchingColumns)!==JSON.stringify([expected.match]))throw new Error(`Invalid matching column: ${name}`);
  if(JSON.stringify(Object.keys(node.parameters.columns.value))!==JSON.stringify(expected.keys))throw new Error(`Invalid write set: ${name}`);
  for(const key of expected.keys){const path=name==="Persist processed event"?`$json.${key}`:`$json.service.${key}`;if(node.parameters.columns.value[key]!==`={{ ${path} }}`)throw new Error(`Invalid expression ${name}.${key}`);}
 }
 const triggerLookup=mode=>name=>({first:()=>{if((mode==="manual"&&name==="Manual Trigger")||(mode==="scheduled"&&name==="Schedule Trigger (requires RF01_SCHEDULE_CRON)"))return {json:{}};throw new Error("Node not executed");}});
 const context={__items:[{json:{source:"services",rows:[]}},{json:{source:"inbox_events",rows:[]}}],$:triggerLookup("manual"),$execution:{id:"synthetic-execution"},Intl};
 const wrapped=`const $input={all:()=>__items};(async()=>{${plannerCode}})()`;const planned=await runInNewContext(wrapped,context);if(planned[0].json.execution_authorized!==false)throw new Error("Default execution must be blocked");
 const baseService={service_id:"safe-service-1",customer_name:"Synthetic",phone_e164:"+12025550101",appointment_at:"2020-01-01T00:00:00Z",review_link:"https://example.test/review",status:"pending",request_sent:false,request_sent_at:null,review_confirmed:false,review_confirmed_at:null,reminder_sent:false,reminder_sent_at:null,thanks_sent:false,thanks_sent_at:null,completed_at:null,completion_reason:null,operation_phase:"idle",error_code:null,updated_at:"2020-01-01T00:00:00Z"};
 if(RF01_LOCAL_CONFIG.criticalConfigPresent||RF01_LOCAL_CONFIG.exclusiveExecutionVerified||RF01_LOCAL_CONFIG.sheetsWriteEnabled||RF01_LOCAL_CONFIG.sendEnabled)throw new Error("Operative gates must default to false");
 const coordinatorNode=parsed.nodes.find(n=>n.name==="RF-01 Coordinator HTTP");const coordinatorHeaders=coordinatorNode?.parameters?.headerParameters?.parameters??[];
 if(!coordinatorNode?.credentials?.httpHeaderAuth||coordinatorHeaders.some(h=>String(h.name).toLowerCase()==="authorization"))throw new Error("Coordinator node identity or external authentication invalid");
 if(coordinatorNode.parameters.url!=="={{ $json.coordinatorUrl }}"||coordinatorNode.parameters.body!=="={{ JSON.stringify($json.coordinatorRequest) }}")throw new Error("Coordinator request mapping invalid");
 for(const name of ["Resolve authoritative service state","RF-01 Coordinator HTTP"]){const node=parsed.nodes.find(n=>n.name===name);const response=node?.parameters?.options?.response?.response;if(node?.onError!=="stopWorkflow"||response?.neverError!==true||response?.fullResponse===true||Object.hasOwn(response??{},"responseFormat"))throw new Error(`Unsafe HTTP output configuration: ${name}`);}
 if((parsed.connections["RF-01 Coordinator HTTP"]?.main??[]).length!==1)throw new Error("HTTP transport error output remains connected");
 if(existing.includes("graph.facebook.com")||existing.includes("whatsapp_payload")||parsed.nodes.some(n=>n.name==="WhatsApp Business Cloud API"))throw new Error("Direct WhatsApp route remains");
 const runPlanner=async(services,events,mode="manual")=>{const ctx={__items:[{json:{source:"services",rows:services}},{json:{source:"inbox_events",rows:events}}],$:triggerLookup(mode),$execution:{id:"synthetic-execution"},Intl};return (await runInNewContext(wrapped,ctx))[0].json;};
 const runPlannerConfigured=async(config,mode="manual",services=[])=>{const configuredCode=plannerCode.replace(JSON.stringify(RF01_LOCAL_CONFIG),JSON.stringify(config));const ctx={__items:[{json:{source:"services",rows:services}},{json:{source:"inbox_events",rows:[]}}],$:triggerLookup(mode),$execution:{id:"synthetic-execution"},Intl};return (await runInNewContext(`const $input={all:()=>__items};(async()=>{${configuredCode}})()`,ctx))[0].json;};
 const withCoordinator=coordinator=>({...RF01_LOCAL_CONFIG,coordinator:{...RF01_LOCAL_CONFIG.coordinator,...coordinator}});
 if(!(await runPlannerConfigured(withCoordinator({baseUrl:"https://coordinator.example.test"}))).coordinator.urlAllowed)throw new Error("HTTPS coordinator rejected");
 const localTest=withCoordinator({baseUrl:"http://host.docker.internal:18787",testMode:true,providerMode:"simulated"});
 if(!(await runPlannerConfigured(localTest)).coordinator.urlAllowed)throw new Error("Explicit local simulated HTTP rejected");
 for(const invalid of [
  withCoordinator({baseUrl:"http://127.0.0.1:18787",testMode:true,providerMode:"simulated"}),
  withCoordinator({baseUrl:"http://host.docker.internal.evil:18787",testMode:true,providerMode:"simulated"}),
  withCoordinator({baseUrl:"http://user@host.docker.internal:18787",testMode:true,providerMode:"simulated"}),
  withCoordinator({baseUrl:"http://host.docker.internal:99999",testMode:true,providerMode:"simulated"}),
  withCoordinator({baseUrl:"http://host.docker.internal:18787",testMode:false,providerMode:"simulated"}),
  withCoordinator({baseUrl:"http://host.docker.internal:18787",testMode:true,providerMode:"whatsapp"}),
  {...localTest,sendEnabled:true},
 ])if((await runPlannerConfigured(invalid)).coordinator.urlAllowed)throw new Error("Unsafe local HTTP accepted");
 if((await runPlannerConfigured(localTest,"scheduled")).coordinator.urlAllowed)throw new Error("Scheduled HTTP accepted");
 const requestPlan=await runPlanner([baseService],[]);if(requestPlan.command?.kind!=="request"||requestPlan.execution_authorized!==false)throw new Error("Request planning/gate regression");
 if(requestPlan.execution_mode!=="manual_test"||Object.values(requestPlan.gates).some(Boolean))throw new Error("Manual execution is not read-only");
 const scheduledPlan=await runPlanner([baseService],[],"scheduled");if(scheduledPlan.execution_mode!=="scheduled_operational"||scheduledPlan.execution_authorized!==false||scheduledPlan.gates.exclusive_execution!==false)throw new Error("Scheduled execution safety regression");
 const ca09Service={...baseService,service_id:"synthetic-ca09-service-1"};const ca09Config={...localTest,ca09Test:{enabled:true,serviceId:ca09Service.service_id,operationKind:"request"}};
 const ca09Plan=await runPlannerConfigured(ca09Config,"manual",[ca09Service]);if(!ca09Plan.execution_authorized||!ca09Plan.ca09_test_authorized||Object.values(ca09Plan.gates).some(Boolean))throw new Error("CA09 safe test route rejected or opened a gate");
 for(const invalid of [{...ca09Config,ca09Test:{...ca09Config.ca09Test,serviceId:"service-1"}},{...ca09Config,ca09Test:{...ca09Config.ca09Test,enabled:false}}])if((await runPlannerConfigured(invalid,"manual",[ca09Service])).execution_authorized)throw new Error("Unsafe CA09 test configuration accepted");
 if((await runPlannerConfigured(ca09Config,"scheduled",[ca09Service])).ca09_test_authorized)throw new Error("Scheduled CA09 test accepted");
 const residualPlan=await runPlanner([{...baseService,operation_phase:"request_prepared"}],[]);if(residualPlan.command!==null)throw new Error("Residual prepared phase allowed resend");
 const duplicateEvent={provider_event_id:"duplicate-event",phone_e164:"+12025550101",received_at:"2026-10-11T00:00:00Z",event_type:"LISTO",processing_status:"pending"};
 const duplicatePlan=await runPlanner([{...baseService,status:"request_sent",request_sent:true,request_sent_at:"2026-10-10T00:00:00Z"}],[duplicateEvent,duplicateEvent]);if(duplicatePlan.command!==null||!duplicatePlan.event_diagnostics.some(x=>x.result==="BLOCKED_INVALID_OR_DUPLICATE_EVENT"))throw new Error("Duplicate event did not block unsafe action");
 const classify=async response=>{const action={kind:"request",service_id:baseService.service_id,authoritativeVersion:1,operationRef:"rf01:safe-service-1:request"};const ctx={__response:{json:response},__action:{json:action}};const script=`const $input={first:()=>__response};const $=()=>({first:()=>__action});(async()=>{${classifySend}})()`;return (await runInNewContext(script,ctx))[0].json;};
 const accepted=await classify({apiVersion:"v1",outcome:"accepted",state:"accepted",serviceVersion:3,projection:{...baseService,status:"request_sent",request_sent:true,request_sent_at:"2026-10-13T15:00:00.000Z",headers:{authorization:"Bearer synthetic-secret"}},code:"PROVIDER_ACCEPTED",headers:{authorization:"Bearer synthetic-secret"}});if(!accepted.service.request_sent||accepted.serviceVersion!==3||accepted.route!=="outgoing_projection")throw new Error("Authoritative coordinator projection not accepted");
 const conflict=await classify({apiVersion:"v1",outcome:"blocked",serviceVersion:2,projection:{...baseService},code:"STALE_VERSION"});if(conflict.route!=="outgoing_projection"||conflict.send_result!=="recovered_projection")throw new Error("Recoverable conflict contract regressed");
 const blockedConflict=await classify({apiVersion:"v1",outcome:"blocked",code:"RUN_ALREADY_ACTIVE"});if(blockedConflict.route!=="blocked"||blockedConflict.send_result!=="blocked")throw new Error("Non-recoverable conflict contract regressed");
 const rejected=await classify({apiVersion:"v1",outcome:"rejected",code:"SEND_REJECTED"});if(rejected.route!=="blocked"||rejected.send_result!=="rejected")throw new Error("Rejection contract regressed");
 for(const response of [{apiVersion:"v1",outcome:"uncertain",state:"ambiguous",code:"SEND_AMBIGUOUS"},{error:"synthetic timeout",request:{headers:{authorization:"Bearer synthetic-secret"}}},{apiVersion:"v1",outcome:"accepted",code:"PROVIDER_ACCEPTED"},{apiVersion:"v1",outcome:"accepted",code:"Bearer synthetic-secret",headers:{authorization:"Bearer synthetic-secret"}},{outcome:"blocked",code:"RUN_ALREADY_ACTIVE"}]){const blocked=await classify(response);const serializedBlocked=JSON.stringify(blocked);if(blocked.route!=="blocked"||blocked.send_result!=="uncertain"||blocked.service||/authorization|synthetic-secret|\"headers\"|\"request\"\s*:/i.test(serializedBlocked))throw new Error("Malformed, incomplete or sensitive coordinator result escaped fail-closed classification");}
 for(const required of ["Resolve authoritative service state","Prepare coordinator command","CA09 synthetic result","Persist confirmation","Verify confirmation persisted","Persist processed event","Verify event persisted","RF-01 Coordinator HTTP","Persist final outgoing state","Verify final state"])if(!parsed.nodes.some(n=>n.name===required))throw new Error(`Missing stage ${required}`);
 for(const forbidden of ["Persist outgoing checkpoint","Verify checkpoint persisted"])if(parsed.nodes.some(n=>n.name===forbidden))throw new Error(`Obsolete Sheets authority remains: ${forbidden}`);
 if(existing.includes("$vars")||existing.includes("RF01_CONFIRMATION_WINDOW_DAYS"))throw new Error("Global n8n variables remain");
 console.log("main workflow: JSON and reproducible source valid");console.log("single outgoing route: HTTPS coordinator only; direct WhatsApp route absent");console.log("coordinator projection and stale/uncertain blocking: valid");console.log("URL policy: HTTPS accepted; HTTP only manual + host.docker.internal + explicit simulated mode + closed gates");console.log("three Sheets writes are event/projection only; PostgreSQL expectedVersion is authoritative");console.log("workflow-local configuration synchronized from current authority; no secret value embedded; gates remain closed");console.log("manual execution: read-only gates forced closed; scheduled execution: operative gates default closed");console.log("focused plans: request blocked by gates, residual prepared and duplicate event safe");console.log("approved credential references, document IDs, sheet GIDs, node IDs and mappings preserved");
}else{await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,serialized,"utf8");console.log(`generated ${outputPath}`);console.log(`source_sha256 ${coreHash}`);}
