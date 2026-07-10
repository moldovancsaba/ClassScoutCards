export const env = {
  // ClassScout Ingest API
  CLASSSCOUT_BASE_URL: process.env.CLASSSCOUT_BASE_URL || "http://localhost:3000",
  CLASSSCOUT_INGEST_KEY: process.env.CLASSSCOUT_INGEST_KEY || "",
  
  // MongoDB (optional, for direct writes)
  MONGODB_URI: process.env.MONGODB_URI || "",
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || "classscout",
  
  // App
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3001"),
};

export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!env.CLASSSCOUT_INGEST_KEY) {
    errors.push("CLASSSCOUT_INGEST_KEY is required");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
