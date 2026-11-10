import { describe, expect, it } from "vitest";
import { looksLikeSecret, secretKind } from "../src/core/secrets.js";

describe("secretKind", () => {
  it("separates known formats from suspects", () => {
    expect(secretKind("ghp_0123456789abcdefghijABCD")).toBe("known");
    expect(secretKind("a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6")).toBe("suspect");
    expect(secretKind("my-app-2024-production-build")).toBeUndefined();
  });
});

describe("looksLikeSecret", () => {
  it.each([
    "sk-live-0123456789abcdefghij",
    "ghp_0123456789abcdefghijABCD",
    "github_pat_11ABCDEFG0123456789_abcdefghijklmnop",
    "xoxb-1234567890-abcdefghij",
    "AKIA0123456789ABCDEF",
    "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6",
    "Bearer abcdef0123456789abcdef0123",
    "--token=ghp_0123456789abcdefghijABCD",
  ])("flags %s", (value) => {
    expect(looksLikeSecret(value)).toBe(true);
  });

  it.each([
    "${TOKEN}",
    "Bearer ${TOKEN}",
    "${GITHUB_TOKEN_0123456789abcdefghij}",
    "--access-mode=restricted",
    "https://mcp.context7.com/mcp",
    "postgres-mcp",
    "abcdefghijklmnopqrstuvwxyzabcdefghijklmn",
    "@playwright/mcp@0.0.83",
  ])("accepts %s", (value) => {
    expect(looksLikeSecret(value)).toBe(false);
  });
});
