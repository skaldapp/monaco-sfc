import type { WorkerLanguageService } from "@volar/monaco/worker";
import type Monaco from "monaco-editor";

import {
  foldingProvider,
  // formatter,
  language,
} from "@nuxtlabs/monarch-mdc";
import {
  activateAutoInsertion,
  activateMarkers,
  registerProviders,
} from "@volar/monaco";

export default (monaco: typeof Monaco, worker: Worker) => {
  const getSyncUris = () => monaco.editor.getModels().map(({ uri }) => uri),
    langs = ["vue", "markdown"],
    // tabSize = 2,
    webWorker: Monaco.editor.MonacoWebWorker<WorkerLanguageService> =
      monaco.editor.createWebWorker({ worker });

  monaco.languages.register({ id: "vue" });

  monaco.languages.setMonarchTokensProvider("markdown", language);
  // monaco.languages.registerDocumentFormattingEditProvider("mdc", {
  //   provideDocumentFormattingEdits: (model) => [
  //     {
  //       range: model.getFullModelRange(),
  //       text: formatter(model.getValue(), { tabSize }),
  //     },
  //   ],
  // });
  // monaco.languages.registerOnTypeFormattingEditProvider("mdc", {
  //   autoFormatTriggerCharacters: ["\n"],
  //   provideOnTypeFormattingEdits: (model, position) =>
  //     model
  //       .getLineContent(position.lineNumber - 1)
  //       .trim()
  //       .endsWith("---")
  //       ? []
  //       : [
  //           {
  //             range: model.getFullModelRange(),
  //             text: formatter(model.getValue(), {
  //               isFormatOnType: true,
  //               tabSize,
  //             }),
  //           },
  //         ],
  // });
  monaco.languages.registerFoldingRangeProvider("markdown", {
    provideFoldingRanges: (model) => foldingProvider(model),
  });

  void registerProviders(webWorker, langs, getSyncUris, monaco.languages);
  activateMarkers(webWorker, langs, "vue", getSyncUris, monaco.editor);
  activateAutoInsertion(webWorker, langs, getSyncUris, monaco.editor);
};
