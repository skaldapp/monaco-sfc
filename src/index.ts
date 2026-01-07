import type { WorkerLanguageService } from "@volar/monaco/worker";
import type Monaco from "monaco-editor";

import {
  activateAutoInsertion,
  activateMarkers,
  registerProviders,
} from "@volar/monaco";

export default (monaco: typeof Monaco) => {
  const getSyncUris = () => monaco.editor.getModels().map(({ uri }) => uri),
    langs = ["vue", "markdown"],
    worker: Monaco.editor.MonacoWebWorker<WorkerLanguageService> =
      monaco.editor.createWebWorker({
        label: "vue",
        moduleId: "vs/language/vue/vueWorker",
      });

  monaco.languages.register({ id: "vue" });
  void registerProviders(worker, langs, getSyncUris, monaco.languages);
  activateMarkers(worker, langs, "vue", getSyncUris, monaco.editor);
  activateAutoInsertion(worker, langs, getSyncUris, monaco.editor);
};
