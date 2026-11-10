import { describe, expect, it } from "vitest";
import { editYaml } from "../src/core/yaml-edit.js";

const M = "managed by agents-setup";
const USER = [
  "# my config",
  "mcp_servers:",
  "  mine:  # keep this",
  "    command: my-mcp",
  "",
  "# hooks section",
  "hooks:",
  "  pre_tool_call:",
  "    - command: my-guard  # mine",
  "model: x",
  "",
].join("\n");

describe("editYaml", () => {
  it("adds a key at the end of its map, leaving the rest as it was", () => {
    const out = editYaml(
      USER,
      [{ kind: "set", key: ["mcp_servers", "docs"], value: { url: "u" } }],
      M,
    );
    expect(out).toBe(
      USER.replace("    command: my-mcp\n", `    command: my-mcp\n  # ${M}\n  docs:\n    url: u\n`),
    );
  });

  it("adds a missing top-level key at the end of the file", () => {
    const out = editYaml("a: 1\n", [{ kind: "set", key: ["skills", "x"], value: true }], M);
    expect(out).toBe(`a: 1\n# ${M}\nskills:\n  x: true\n`);
    expect(editYaml("", [{ kind: "set", key: ["a"], value: 1 }], M)).toBe(`# ${M}\na: 1\n`);
  });

  it("fills an empty parent such as hooks: {}", () => {
    const out = editYaml(
      "hooks: {}\nz: 1\n",
      [{ kind: "set", key: ["hooks", "stop"], value: [1] }],
      M,
    );
    expect(out).toBe(`# ${M}\nhooks:\n  stop:\n    - 1\nz: 1\n`);
  });

  it("deletes a key with its marker and prunes the parent it emptied", () => {
    const added = editYaml(
      "a: 1\n",
      [{ kind: "set", key: ["mcp_servers", "docs"], value: { url: "u" } }],
      M,
    );
    const out = editYaml(added as string, [{ kind: "delete", key: ["mcp_servers", "docs"] }], M);
    expect(out).toBe("a: 1\n");
  });

  it("replaces, removes and appends list items around the user's", () => {
    const withOurs = editYaml(
      USER,
      [
        {
          kind: "items",
          key: ["hooks", "pre_tool_call"],
          remove: [],
          replace: [],
          append: [{ command: "ours" }, { command: "old" }],
          final: [],
        },
      ],
      M,
    ) as string;
    expect(withOurs).toContain(
      `    - command: my-guard  # mine\n    # ${M}\n    - command: ours\n    # ${M}\n    - command: old\nmodel: x\n`,
    );
    const out = editYaml(
      withOurs,
      [
        {
          kind: "items",
          key: ["hooks", "pre_tool_call"],
          remove: [2],
          replace: [[1, { command: "new" }]],
          append: [],
          final: [],
        },
      ],
      M,
    );
    expect(out).toBe(USER.replace("# mine\n", `# mine\n    # ${M}\n    - command: new\n`));
  });

  it("refuses flow-style layouts it cannot edit in place", () => {
    const flow = "mcp_servers: { mine: { command: x } }\n";
    expect(editYaml(flow, [{ kind: "set", key: ["mcp_servers", "docs"], value: 1 }], M)).toBe(
      undefined,
    );
  });
});
