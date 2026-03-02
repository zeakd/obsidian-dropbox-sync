import esbuild from "esbuild";

const prod = process.argv[2] !== "--watch";

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
});

if (prod) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
