import esbuild from "esbuild";
import { readFileSync } from "fs";

const prod = process.argv[2] !== "--watch";

// .env 파서 (dotenv 의존성 불필요)
function loadEnv() {
  try {
    const content = readFileSync(".env", "utf-8");
    const vars = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      vars[key] = value;
    }
    return vars;
  } catch {
    return {};
  }
}

const env = loadEnv();

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2022",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  logLevel: "info",
  define: {
    __DROPBOX_APP_KEY__: JSON.stringify(env.DROPBOX_APP_KEY ?? ""),
  },
});

if (prod) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
