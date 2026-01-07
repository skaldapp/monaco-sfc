import config from "@vuebro/configs/vite";
import { defineConfig, mergeConfig } from "vite";

export default mergeConfig(
  config,
  defineConfig({
    build: {
      emptyOutDir: false,
      lib: {
        entry: "src/vue.worker.ts",
        fileName: "vue.worker",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["monaco-editor/esm/vs/editor/editor.worker"],
      },
    },
    resolve: { alias: { path: "path-browserify" } },
  }),
);
