// Safe env loading — all vars optional, validated before use

export interface EnvConfig {
  CLASSSCOUT_BASE_URL: string;
  CLASSSCOUT_INGEST_KEY: string;
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  MONGODB_CARDS_COLLECTION: string;
  NODE_ENV: string;
  PORT: number;
}

const defaults = {
  CLASSSCOUT_BASE_URL: "",
  CLASSSCOUT_INGEST_KEY: "",
  MONGODB_URI: "",
  MONGODB_DB_NAME: "classscout",
  MONGODB_CARDS_COLLECTION: "providers",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: 3001,
};

function get(key: string, fallback: string = ""): string {
  return process.env[key]?.trim() ?? fallback;
}

export const env: EnvConfig = {
  CLASSSCOUT_BASE_URL: get("CLASSSCOUT_BASE_URL"),
  CLASSSCOUT_INGEST_KEY: get("CLASSSCOUT_INGEST_KEY"),
  MONGODB_URI: get("MONGODB_URI"),
  MONGODB_DB_NAME: get("MONGODB_DB_NAME", defaults.MONGODB_DB_NAME),
  MONGODB_CARDS_COLLECTION: get("MONGODB_CARDS_COLLECTION", defaults.MONGODB_CARDS_COLLECTION),
  NODE_ENV: defaults.NODE_ENV,
  PORT: parseInt(get("PORT", String(defaults.PORT)), 10) || defaults.PORT,
};

export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!env.MONGODB_URI) {
    errors.push("MONGODB_URI is not set — MongoDB delivery unavailable");
  }

  if (!env.CLASSSCOUT_INGEST_KEY) {
    errors.push("CLASSSCOUT_INGEST_KEY is not set — ingest API delivery unavailable");
  }

  return { valid: errors.length === 0, errors };
}
