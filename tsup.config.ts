import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    redis: "src/adapters/redis/index.ts",
    memory: "src/adapters/memory/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: "terser",
  terserOptions: {
    compress: {
      drop_console: true,
      drop_debugger: true,
      pure_funcs: ["console.debug", "console.log"],
      passes: 3,
      unsafe: true,
      unsafe_arrows: true,
      unsafe_methods: true,
      dead_code: true,
      collapse_vars: true,
      reduce_vars: true,
      toplevel: true,
      booleans_as_integers: true,
    },
    mangle: {
      toplevel: true,
      properties: {
        regex: /^_/,
      },
    },
    format: {
      comments: false,
      ecma: 2022,
    },
  },
  treeshake: true,
  splitting: false,
  sourcemap: false,
  target: "es2022",
  noExternal: [],
  esbuildOptions(options) {
    options.legalComments = "none";
    options.drop = ["debugger"];
    options.pure = ["console.debug", "console.log"];
  },
});
