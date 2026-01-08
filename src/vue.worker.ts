import type {
  Language,
  LanguageServiceContext,
  WorkerLanguageService,
} from "@volar/monaco/worker";
import type { worker } from "monaco-editor";

import { Window } from "@remote-dom/polyfill";
import { createNpmFileSystem } from "@volar/jsdelivr";
import { createTypeScriptWorkerLanguageService } from "@volar/monaco/worker";
import {
  createVueLanguagePlugin,
  getDefaultCompilerOptions,
  VueVirtualCode,
} from "@vue/language-core";
import { createVueLanguageServicePlugins } from "@vue/language-service";
import { postprocessLanguageService } from "@vue/typescript-plugin/lib/common";
import { collectExtractProps } from "@vue/typescript-plugin/lib/requests/collectExtractProps";
import { getComponentDirectives } from "@vue/typescript-plugin/lib/requests/getComponentDirectives";
import { getComponentMeta } from "@vue/typescript-plugin/lib/requests/getComponentMeta";
import { getComponentNames } from "@vue/typescript-plugin/lib/requests/getComponentNames";
import { getComponentSlots } from "@vue/typescript-plugin/lib/requests/getComponentSlots";
import { getElementAttrs } from "@vue/typescript-plugin/lib/requests/getElementAttrs";
import { getElementNames } from "@vue/typescript-plugin/lib/requests/getElementNames";
import { getImportPathForFile } from "@vue/typescript-plugin/lib/requests/getImportPathForFile";
import { isRefAtPosition } from "@vue/typescript-plugin/lib/requests/isRefAtPosition";
import { resolveModuleName } from "@vue/typescript-plugin/lib/requests/resolveModuleName";
import { initialize } from "monaco-editor/esm/vs/editor/editor.worker";
import typescript, { convertCompilerOptionsFromJson } from "typescript";
import { create as createTypeScriptDirectiveCommentPlugin } from "volar-service-typescript/lib/plugins/directiveComment";
import { create as createTypeScriptSemanticPlugin } from "volar-service-typescript/lib/plugins/semantic";
import { MarkupContent } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";

/* -------------------------------------------------------------------------- */

const ctime = Date.now(),
  globalDeclarations = `declare global {
  const $frontmatter: Record<string, any>;
  const $id: string;
}
declare module 'vue' {
  interface ComponentCustomProperties {
    $frontmatter: Record<string, any>;
    $id: string;
  }
}
export {};`,
  mtime = ctime,
  npmFileSystem = createNpmFileSystem(),
  semanticPlugin = createTypeScriptSemanticPlugin(typescript),
  size = globalDeclarations.length,
  type = 1,
  vueCompilerOptions = getDefaultCompilerOptions(),
  workspaceFolders = [URI.file("/")];

const asFileName = ({ path }: URI) => path,
  asUri = (fileName: string) => URI.file(fileName),
  create = (context: LanguageServiceContext) => {
    const pluginInstance = semanticPlugin.create(context),
      languageService = pluginInstance.provide["typescript/languageService"](),
      proxy = postprocessLanguageService(
        typescript,
        context.language,
        languageService,
        vueCompilerOptions,
        asUri,
      ),
      getCodeFixesAtPosition = proxy.getCodeFixesAtPosition.bind(proxy),
      getCompletionEntryDetails = proxy.getCompletionEntryDetails.bind(proxy),
      getCompletionsAtPosition = proxy.getCompletionsAtPosition.bind(proxy),
      getDefinitionAndBoundSpan = proxy.getDefinitionAndBoundSpan.bind(proxy),
      getQuickInfoAtPosition = proxy.getQuickInfoAtPosition.bind(proxy);
    pluginInstance.provide["typescript/languageService"] = () => ({
      ...languageService,
      getCodeFixesAtPosition,
      getCompletionEntryDetails,
      getCompletionsAtPosition,
      getDefinitionAndBoundSpan,
      getQuickInfoAtPosition,
    });
    return pluginInstance;
  },
  readFile = (uri: URI) =>
    uri.path.endsWith("global.d.ts")
      ? globalDeclarations
      : npmFileSystem.readFile(uri),
  stat = (uri: URI) =>
    uri.path.endsWith("global.d.ts")
      ? { ctime, mtime, size, type }
      : npmFileSystem.stat(uri),
  useContext = (
    fileName: string,
    { languageService: { context } }: WorkerLanguageService,
  ) => {
    const { language } = context;
    const languageServiceHost = context.inject(
        "typescript/languageServiceHost",
      ),
      program = context.inject("typescript/languageService").getProgram(),
      sourceScript = language.scripts.get(asUri(fileName)),
      virtualCode =
        sourceScript?.generated?.root instanceof VueVirtualCode
          ? sourceScript.generated.root
          : undefined;
    return {
      language,
      languageServiceHost,
      program,
      sourceScript,
      virtualCode,
    };
  };

/* -------------------------------------------------------------------------- */

const { options: compilerOptions } = convertCompilerOptionsFromJson(
  {
    allowImportingTsExtensions: true,
    allowJs: true,
    checkJs: true,
    jsx: "Preserve",
    module: "ESNext",
    moduleResolution: "Bundler",
    target: "ESNext",
    types: ["global"],
  },
  "",
);

/* -------------------------------------------------------------------------- */

const fs = { ...npmFileSystem, readFile, stat },
  env = { fs, workspaceFolders },
  languagePlugins = [
    createVueLanguagePlugin(
      typescript,
      compilerOptions,
      vueCompilerOptions,
      asFileName,
    ),
  ],
  uriConverter = { asFileName, asUri };

/* -------------------------------------------------------------------------- */

/** Don't remove! It's prevent emoji errors. (Non-UTF characters in the code) */
Window.setGlobal(new Window());

vueCompilerOptions.vitePressExtensions.push(".md");

self.onmessage = () => {
  initialize((workerContext: worker.IWorkerContext) => {
    const workerLanguageService = createTypeScriptWorkerLanguageService({
      compilerOptions,
      env,
      languagePlugins,
      languageServicePlugins: [
        { ...semanticPlugin, create },
        createTypeScriptDirectiveCommentPlugin(),
        ...createVueLanguageServicePlugins(typescript, {
          collectExtractProps(fileName, templateCodeRange) {
            const { language, program, sourceScript, virtualCode } = useContext(
              fileName,
              workerLanguageService,
            );
            return (
              sourceScript &&
              virtualCode &&
              collectExtractProps(
                typescript,
                language,
                program,
                sourceScript,
                virtualCode,
                templateCodeRange,
              )
            );
          },
          getAutoImportSuggestions: () => undefined,
          getComponentDirectives: (fileName) => {
            const { program } = useContext(fileName, workerLanguageService);
            return getComponentDirectives(typescript, program, fileName);
          },
          getComponentMeta: (fileName, tag) => {
            const { language, program, virtualCode } = useContext(
              fileName,
              workerLanguageService,
            );
            return (
              virtualCode &&
              getComponentMeta(
                typescript,
                program,
                language as unknown as Language<string>,
                program.getSourceFile(fileName),
                virtualCode,
                tag,
              )
            );
          },
          getComponentNames: (fileName) => {
            const { program, virtualCode } = useContext(
              fileName,
              workerLanguageService,
            );
            return (
              virtualCode && getComponentNames(typescript, program, virtualCode)
            );
          },
          getComponentSlots(fileName) {
            const { program, virtualCode } = useContext(
              fileName,
              workerLanguageService,
            );
            return (
              virtualCode && getComponentSlots(typescript, program, virtualCode)
            );
          },
          getDocumentHighlights: () => undefined,
          getElementAttrs: (fileName, tag) => {
            const { program } = useContext(fileName, workerLanguageService);
            return getElementAttrs(typescript, program, fileName, tag);
          },
          getElementNames: (fileName) => {
            const { program } = useContext(fileName, workerLanguageService);
            return getElementNames(typescript, program, fileName);
          },
          getEncodedSemanticClassifications: () => undefined,
          getImportPathForFile: (fileName, incomingFileName, preferences) => {
            const { languageServiceHost, program } = useContext(
              fileName,
              workerLanguageService,
            );
            return getImportPathForFile(
              typescript,
              languageServiceHost,
              program,
              fileName,
              incomingFileName,
              preferences,
            );
          },
          getQuickInfoAtPosition: async (fileName, position) => {
            const { contents } =
              (await workerLanguageService.languageService.getHover(
                asUri(fileName),
                position,
              )) ?? {};
            return (
              contents && MarkupContent.is(contents)
                ? contents.value
                : (Array.isArray(contents) ? contents : [contents ?? ""])
                    .map((markedString) =>
                      typeof markedString === "string"
                        ? markedString
                        : markedString.value,
                    )
                    .join("\n")
            )
              .replace(/```typescript/g, "")
              .replace(/```/g, "")
              .replace(/---/g, "")
              .trim()
              .replace(/\n+/g, " | ");
          },
          isRefAtPosition(fileName, position) {
            const { language, program, sourceScript, virtualCode } = useContext(
              fileName,
              workerLanguageService,
            );
            return (
              sourceScript &&
              virtualCode &&
              isRefAtPosition(
                typescript,
                language,
                program,
                sourceScript,
                virtualCode,
                position,
              )
            );
          },
          resolveAutoImportCompletionEntry: () => undefined,
          resolveModuleName: (fileName, moduleName) => {
            const { languageServiceHost } = useContext(
              fileName,
              workerLanguageService,
            );
            return resolveModuleName(
              typescript,
              languageServiceHost,
              fileName,
              moduleName,
            );
          },
        }).filter(({ name }) => !name?.startsWith("vue-template")),
      ],
      typescript,
      uriConverter,
      workerContext,
    });
    return workerLanguageService;
  });
};
