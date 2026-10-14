import { createRf01WhatsAppCloudProvider } from "./rf01-whatsapp-cloud-provider.js";

export function loadRf01CoordinatorRuntime(env = process.env, { now = () => new Date() } = {}) {
  const providerMode = env.RF01_PROVIDER_MODE || "simulated";
  const config = {
    databaseUrl: required(env, "RF01_DATABASE_URL"),
    serviceToken: required(env, "RF01_COORDINATOR_SERVICE_TOKEN"),
    host: env.RF01_COORDINATOR_HOST || "127.0.0.1",
    port: integer(env.RF01_COORDINATOR_PORT, 8787, 1, 65535, "RF01_COORDINATOR_PORT"),
    poolMax: integer(env.RF01_DB_POOL_MAX, 4, 1, 32, "RF01_DB_POOL_MAX"),
    timeoutMs: integer(env.RF01_PROVIDER_TIMEOUT_MS, 15_000, 1_000, 120_000, "RF01_PROVIDER_TIMEOUT_MS"),
    simulatedDelayMs: integer(env.RF01_SIMULATED_DELAY_MS, 0, 0, 60_000, "RF01_SIMULATED_DELAY_MS"),
    providerMode,
  };
  if (config.serviceToken.length < 32 || config.serviceToken.length > 512) throw new Error("INVALID_RF01_COORDINATOR_SERVICE_TOKEN");

  if (providerMode === "simulated") {
    return {
      config,
      send: async () => {
        if (config.simulatedDelayMs) await new Promise(resolve => setTimeout(resolve, config.simulatedDelayMs));
        return { status: "accepted", acceptedAt: now().toISOString(), resultCode: "SIMULATED_ACCEPTANCE" };
      },
    };
  }
  if (providerMode !== "whatsapp" || env.RF01_ALLOW_REAL_WHATSAPP !== "YES") throw new Error("REAL_WHATSAPP_NOT_EXPLICITLY_ALLOWED");
  return {
    config,
    send: createRf01WhatsAppCloudProvider({
      accessToken: required(env, "RF01_WA_ACCESS_TOKEN"),
      phoneNumberId: required(env, "RF01_WA_PHONE_NUMBER_ID"),
      businessName: required(env, "RF01_BUSINESS_NAME"),
      apiVersion: env.RF01_WA_API_VERSION || "v25.0",
    }),
  };
}

function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`MISSING_${name}`);
  return value;
}

function integer(value, fallback, minimum, maximum, name) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`INVALID_${name}`);
  return parsed;
}
