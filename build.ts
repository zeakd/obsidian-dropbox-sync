import { readFileSync, copyFileSync, mkdirSync } from "fs";

const isWatch = Bun.argv.includes("--watch");

function loadEnv(): Record<string, string> {
  try {
    const content = readFileSync(".env", "utf-8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return vars;
  } catch {
    return {};
  }
}

const env = loadEnv();

const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  outdir: "dist",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "browser",
  sourcemap: isWatch ? "inline" : "none",
  define: {
    __DROPBOX_APP_KEY__: JSON.stringify(env.DROPBOX_APP_KEY ?? ""),
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const msg of result.logs) {
    console.error(msg);
  }
  process.exit(1);
}

// manifest.json, styles.css를 dist/에 복사
mkdirSync("dist", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("styles.css", "dist/styles.css");

console.log(`Build succeeded: dist/main.js (${(result.outputs[0]?.size ?? 0) / 1024 | 0}KB)`);
