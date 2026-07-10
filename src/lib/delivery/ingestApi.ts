import { Provider } from "@/lib/types/provider";

interface IngestApiConfig {
  baseUrl: string;
  apiKey: string;
}

interface IngestResponse {
  success: boolean;
  cardsSent: number;
  errors: string[];
  endpoint?: string;
  method?: string;
}

/**
 * Deliver cards to the main ClassScout ingest endpoint.
 * This is the primary delivery path — cards are validated and ingested
 * into the ClassScout MongoDB Atlas cluster after passing quality gates.
 */
export async function deliverViaIngestApi(
  cards: Provider[],
  config: IngestApiConfig
): Promise<IngestResponse> {
  if (!config.apiKey) {
    return {
      success: false,
      cardsSent: 0,
      errors: ["CLASSSCOUT_INGEST_KEY not configured"],
    };
  }

  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/api/ingest/providers`;
  const errors: string[] = [];

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-Source": "classscout-cards-api",
      },
      body: JSON.stringify({
        providers: cards,
        source: "cards-api",
        ingestedAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        cardsSent: 0,
        errors: [
          `Ingest API error: ${response.status} ${response.statusText}`,
          errorText,
        ],
      };
    }

    const result = await response.json();

    return {
      success: true,
      cardsSent: result.accepted?.length ?? cards.length,
      errors: result.errors ?? [],
      endpoint,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    errors.push(`Failed to reach ingest API: ${message}`);
    return {
      success: false,
      cardsSent: 0,
      errors,
    };
  }
}

/**
 * Health check for the ingest endpoint. Called by /api/status.
 * Returns a lightweight response without sending actual data.
 */
export async function checkIngestHealth(config: IngestApiConfig): Promise<{
  healthy: boolean;
  error?: string;
  endpoint?: string;
}> {
  if (!config.apiKey) {
    return { healthy: false, error: "CLASSSCOUT_INGEST_KEY not configured" };
  }

  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/api/health`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "X-Source": "classscout-cards-api",
      },
      signal: AbortSignal.timeout(5000),
    });

    return {
      healthy: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      endpoint,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { healthy: false, error: message, endpoint };
  }
}
