import { parse } from "yaml";
import { type Diagnostic, NAME_PATTERN } from "../types.js";

export function error(file: string, message: string): Diagnostic {
  return { level: "error", file, message };
}

export function warning(file: string, message: string): Diagnostic {
  return { level: "warning", file, message };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((v) => typeof v === "string");
}

export function nameProblem(kind: string, name: string): string | undefined {
  return NAME_PATTERN.test(name)
    ? undefined
    : `Invalid ${kind} name "${name}": use letters, digits, ".", "_" and "-", starting with a letter or digit`;
}

/** Parses a YAML document; an empty file is an empty object. */
export function parseYamlFile(
  file: string,
  text: string,
): { data: unknown; diagnostic?: Diagnostic } {
  try {
    return { data: parse(text) ?? {} };
  } catch (e) {
    return { data: undefined, diagnostic: error(file, `Invalid YAML: ${(e as Error).message}`) };
  }
}
