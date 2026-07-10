import type { Provider } from "@/lib/types/provider";

export interface IngestConfig {
  baseUrl: string;
  apiKey: string;
}

export interface IngestResult {
  success: boolean;
  ingestApi: boolean;
  cardsSent: number;
  response?: unknown;
  error?: string;
}

/**
 * Delivers generated cards to ClassScout via the ingest API
 * POST /api/ingest with Bearer token auth
 */
export async function deliverViaIngestApi(
  cards: Provider[],
  config: IngestConfig
): Promise<IngestResult> {
  if (!config.baseUrl || !config.apiKey) {
    return {
      success: false,
      ingestApi: false,
      cardsSent: 0,
      error: "Missing CLASSSCOUT_BASE_URL or CLASSSCOUT_INGEST_KEY",
    };
  }

  try {
    const url = `${config.baseUrl}/api/ingest`;
    const payload = {
      operations: [
        {
          collection: "providers",
          action: "upsertMany",
          data: cards,
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }

    if (!response.ok) {
      return {
        success: false,
        ingestApi: false,
        cardsSent: cards.length,
        response: json,
        error: `HTTP ${response.status}: ${text}`,
      };
    }

    return {
      success: true,
      ingestApi: true,
      cardsSent: cards.length,
      response: json,
    };
  } catch (error) {
    return {
      success: false,
      ingestApi: false,
      cardsSent: cards.length,
      error: `Ingest failed: ${error}`,
    };
  }
}

/**
 * Checks health/status of the ingest API connection
 */
export async function checkIngestHealth(config: IngestConfig): Promise<{
  healthy: boolean;
  capabilities?: unknown;
  error?: string;
}> {
  if (!config.baseUrl || !config.apiKey) {
    return { healthy: false, error: "Missing CLASSSCOUT_BASE_URL or CLASSSCOUT_INGEST_KEY" };
  }

  try {
    const url = `${config.baseUrl}/api/ingest`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      return { healthy: false, error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    let capabilities: unknown;
    try {
      capabilities = JSON.parse(text);
    } catch {
      capabilities = text;
    }

    return { healthy: true, capabilities };
  } catch (error) {
    return { healthy: false, error: `Health check failed: ${error}` };
  }
}
