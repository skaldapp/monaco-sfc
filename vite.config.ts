import config from "@skaldapp/configs/vite";
import { defineConfig, mergeConfig } from "vite";

const path = "path-browserify",
  alias = { path },
  emptyOutDir = false,
  entry = "src/vue.worker.ts",
  external = ["monaco-editor/esm/vs/editor/editor.worker"],
  fileName = "vue.worker",
  resolve = { alias },
  rolldownOptions = { external };

export default mergeConfig(
  config,
  defineConfig({
    build: {
      emptyOutDir,
      lib: { entry, fileName, formats: ["es"] },
      rolldownOptions,
    },
    resolve,
  }),
);
