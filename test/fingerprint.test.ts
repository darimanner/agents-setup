import { describe, expect, it } from "vitest";
import { approvalItems } from "../src/core/fingerprint.js";
import type { LayerContent, McpServer } from "../src/core/types.js";

function layer(partial: Partial<LayerContent>): LayerContent {
  return {
    meta: { path: "." },
    rules: [],
    skills: [],
    mcp: [],
    hooks: [],
    plugins: [],
    ...partial,
  };
}

const stdio: McpServer = {
  layer: ".",
  name: "db",
  transport: "stdio",
  command: "uvx",
  args: ["postgres-mcp"],
  env: { DATABASE_URL: "${DATABASE_URL}" },
};
const http: McpServer = {
  layer: ".",
  name: "docs",
  transport: "http",
  url: "https://mcp.context7.com/mcp",
  headers: { Authorization: "Bearer ${TOKEN}" },
};

function fingerprintOf(server: McpServer): string {
  const [item] = approvalItems([layer({ mcp: [server] })], "claude-code");
  return item?.fingerprint ?? "";
}

describe("approvalItems", () => {
  it("covers MCP servers, hooks and this agent's plugins with ids", () => {
    const items = approvalItems(
      [
        layer({
          mcp: [stdio],
          hooks: [{ layer: ".", name: "fmt", event: "after-edit", command: "npm run format" }],
          plugins: [
            { layer: ".", agent: "claude-code", name: "superpowers", marketplace: "official" },
            { layer: ".", agent: "opencode", name: "wakatime" },
          ],
        }),
      ],
      "claude-code",
    );
    expect(items.map((i) => i.id)).toEqual(["mcp:.:db", "hook:.:fmt", "plugin:.:superpowers"]);
  });

  it("changes when a stdio arg changes", () => {
    expect(fingerprintOf({ ...stdio, args: ["other-mcp"] })).not.toBe(fingerprintOf(stdio));
  });

  it("changes when an http url changes", () => {
    expect(fingerprintOf({ ...http, url: "https://evil.example/mcp" })).not.toBe(
      fingerprintOf(http),
    );
  });

  it("changes when a header name is added", () => {
    const more = { ...http, headers: { ...http.headers, "X-Extra": "${X}" } };
    expect(fingerprintOf(more)).not.toBe(fingerprintOf(http));
  });

  it("does not change when an env value changes", () => {
    expect(fingerprintOf({ ...stdio, env: { DATABASE_URL: "${OTHER}" } })).toBe(
      fingerprintOf(stdio),
    );
  });

  it("does not change with key order", () => {
    const reordered: McpServer = {
      env: { DATABASE_URL: "${DATABASE_URL}" },
      args: ["postgres-mcp"],
      command: "uvx",
      transport: "stdio",
      name: "db",
      layer: ".",
    };
    expect(fingerprintOf(reordered)).toBe(fingerprintOf(stdio));
  });
});
