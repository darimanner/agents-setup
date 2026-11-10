import { createInterface } from "node:readline/promises";

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /** Present only in an interactive terminal; commands fall back to flags without it. */
  prompt?: (question: string) => Promise<string>;
}

export function processIo(): Io {
  const io: Io = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  };
  if (process.stdin.isTTY && process.stdout.isTTY) {
    io.prompt = async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    };
  }
  return io;
}
