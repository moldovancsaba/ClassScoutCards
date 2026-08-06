import { afterEach, describe, expect, it } from "vitest";
import { checkCardBridgeAuth } from "./requireCardBridgeKey";
import { env } from "@/lib/env";

const original = env.CARD_BRIDGE_API_KEY;

afterEach(() => {
  env.CARD_BRIDGE_API_KEY = original;
});

describe("checkCardBridgeAuth", () => {
  it("503 when CARD_BRIDGE_API_KEY is not configured — fail closed, distinct from a bad credential", () => {
    env.CARD_BRIDGE_API_KEY = "";
    const result = checkCardBridgeAuth("Bearer anything");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(503);
    expect(!result.ok && result.error).toMatch(/not configured/i);
  });

  it("an empty (whitespace-only) CARD_BRIDGE_API_KEY is treated as unconfigured", () => {
    env.CARD_BRIDGE_API_KEY = "   ";
    const result = checkCardBridgeAuth("Bearer anything");
    expect(!result.ok && result.status).toBe(503);
  });

  it("401 when configured but no Authorization header is supplied at all", () => {
    env.CARD_BRIDGE_API_KEY = "s3cr3t";
    const result = checkCardBridgeAuth(undefined);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(401);
    expect(!result.ok && result.error).toMatch(/missing credentials/i);
  });

  it("ok for a matching Authorization: Bearer credential", () => {
    env.CARD_BRIDGE_API_KEY = "s3cr3t";
    expect(checkCardBridgeAuth("Bearer s3cr3t")).toEqual({ ok: true });
  });

  it("401 for a wrong bearer token", () => {
    env.CARD_BRIDGE_API_KEY = "s3cr3t";
    const result = checkCardBridgeAuth("Bearer wrong-key");
    expect(!result.ok && result.status).toBe(401);
  });

  it("401 for a credential that differs only in length (constant-time compare's early length check)", () => {
    env.CARD_BRIDGE_API_KEY = "s3cr3t";
    const result = checkCardBridgeAuth("Bearer s3cr3tt");
    expect(!result.ok && result.status).toBe(401);
  });

  it("Bearer scheme is case-insensitive", () => {
    env.CARD_BRIDGE_API_KEY = "s3cr3t";
    expect(checkCardBridgeAuth("bearer s3cr3t")).toEqual({ ok: true });
  });
});
