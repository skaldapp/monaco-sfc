import type {
  LanguageServicePlugin,
  WorkerLanguageService,
} from "@volar/monaco/worker";
import type { Language } from "@vue/language-service";
import type { worker } from "monaco-editor";

import { Window } from "@remote-dom/polyfill";
import { createNpmFileSystem } from "@volar/jsdelivr";
import { createTypeScriptWorkerLanguageService } from "@volar/monaco/worker";
import {
  createVueLanguagePlugin,
  generateGlobalTypes,
  getDefaultCompilerOptions,
  getGlobalTypesFileName,
  VueVirtualCode,
} from "@vue/language-core";
import { createVueLanguageServicePlugins } from "@vue/language-service";
import { postprocessLanguageService } from "@vue/typescript-plugin/lib/common";
import { collectExtractProps } from "@vue/typescript-plugin/lib/requests/collectExtractProps";
import { getComponentDirectives } from "@vue/typescript-plugin/lib/requests/getComponentDirectives";
import { getComponentEvents } from "@vue/typescript-plugin/lib/requests/getComponentEvents";
import { getComponentNames } from "@vue/typescript-plugin/lib/requests/getComponentNames";
import { getComponentProps } from "@vue/typescript-plugin/lib/requests/getComponentProps";
import { getComponentSlots } from "@vue/typescript-plugin/lib/requests/getComponentSlots";
import { getElementAttrs } from "@vue/typescript-plugin/lib/requests/getElementAttrs";
import { getElementNames } from "@vue/typescript-plugin/lib/requests/getElementNames";
import { getImportPathForFile } from "@vue/typescript-plugin/lib/requests/getImportPathForFile";
import { isRefAtPosition } from "@vue/typescript-plugin/lib/requests/isRefAtPosition";
import { resolveModuleName } from "@vue/typescript-plugin/lib/requests/resolveModuleName";
import markdownit from "markdown-it";
import { initialize } from "monaco-editor/esm/vs/editor/editor.worker";
import typescript, { convertCompilerOptionsFromJson } from "typescript";
import { create as createTypeScriptDirectiveCommentPlugin } from "volar-service-typescript/lib/plugins/directiveComment";
import { create as createTypeScriptSemanticPlugin } from "volar-service-typescript/lib/plugins/semantic";
import { MarkupContent } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";

/** Don't remove! It's prevent emoji errors. (Non-UTF characters in the code) */
Window.setGlobal(new Window());

const asFileName = ({ path }: { path: URI["path"] }) => path,
  asUri = (fileName: string) => URI.file(fileName),
  ctime = Date.now(),
  vueCompilerOptions = getDefaultCompilerOptions(),
  globalTypes = `${generateGlobalTypes(vueCompilerOptions)}
declare global {
    const $frontmatter: Record<string, any>;
    const $id: string;
}
declare module 'vue' {
    interface ComponentCustomProperties {
      $frontmatter: Record<string, any>;
      $id: string;
    }
}`,
  globalTypesPath =
    "/node_modules/" + getGlobalTypesFileName(vueCompilerOptions),
  md = markdownit(),
  npmFileSystem = createNpmFileSystem(),
  semanticPlugin = createTypeScriptSemanticPlugin(typescript),
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
  },
  { options: compilerOptions } = convertCompilerOptionsFromJson(
    {
      allowImportingTsExtensions: true,
      allowJs: true,
      checkJs: true,
      jsx: "Preserve",
      module: "ESNext",
      moduleResolution: "Bundler",
      target: "ESNext",
    },
    "",
  );

const fs = {
  ...npmFileSystem,
  readFile: (uri: URI) =>
    uri.path === globalTypesPath ? globalTypes : npmFileSystem.readFile(uri),
  stat: (uri: URI) =>
    uri.path === globalTypesPath
      ? { ctime, mtime: ctime, size: globalTypes.length, type: 1 }
      : npmFileSystem.stat(uri),
};

vueCompilerOptions.vitePressExtensions.push(".md");
vueCompilerOptions.globalTypesPath = () => globalTypesPath;

self.onmessage = () => {
  initialize((workerContext: worker.IWorkerContext) => {
    const workerLanguageService = createTypeScriptWorkerLanguageService({
      compilerOptions,
      env: { fs, workspaceFolders: [URI.file("/")] },
      languagePlugins: [
        createVueLanguagePlugin(
          typescript,
          compilerOptions,
          vueCompilerOptions,
          asFileName,
        ),
      ],
      languageServicePlugins: [
        {
          ...semanticPlugin,
          create: (context) => {
            const pluginInstance = semanticPlugin.create(context),
              languageService =
                pluginInstance.provide["typescript/languageService"](),
              proxy = postprocessLanguageService(
                typescript,
                context.language as Language,
                languageService,
                vueCompilerOptions,
                asUri,
              ),
              vueLanguageService = {
                getCodeFixesAtPosition:
                  proxy.getCodeFixesAtPosition.bind(proxy),
                getCompletionEntryDetails:
                  proxy.getCompletionEntryDetails.bind(proxy),
                getCompletionsAtPosition:
                  proxy.getCompletionsAtPosition.bind(proxy),
                getDefinitionAndBoundSpan:
                  proxy.getDefinitionAndBoundSpan.bind(proxy),
                getQuickInfoAtPosition:
                  proxy.getQuickInfoAtPosition.bind(proxy),
              };
            pluginInstance.provide["typescript/languageService"] = () => ({
              ...languageService,
              ...vueLanguageService,
            });
            return pluginInstance;
          },
        },
        createTypeScriptDirectiveCommentPlugin(),
        ...(createVueLanguageServicePlugins(typescript, {
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
                language as Language,
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
          getComponentEvents: (fileName, tag) => {
            const { program, virtualCode } = useContext(
              fileName,
              workerLanguageService,
            );
            return (
              virtualCode &&
              getComponentEvents(typescript, program, virtualCode, tag)
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
          getComponentProps: (fileName, tag) => {
            const { program, virtualCode } = useContext(
              fileName,
              workerLanguageService,
            );
            return (
              virtualCode &&
              getComponentProps(typescript, program, virtualCode, tag)
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
            return getElementAttrs(typescript, program, tag);
          },
          getElementNames: (fileName) => {
            const { program } = useContext(fileName, workerLanguageService);
            return getElementNames(typescript, program);
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
              contents &&
              md.render(
                MarkupContent.is(contents)
                  ? contents.value
                  : (Array.isArray(contents) ? contents : [contents])
                      .map((markedString) =>
                        typeof markedString === "string"
                          ? markedString
                          : `\`\`\`${markedString.language}\n${markedString.value}\n\`\`\``,
                      )
                      .join("\n"),
              )
            );
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
                language as Language,
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
        }).filter(
          ({ name }) => !name?.startsWith("vue-template"),
        ) as LanguageServicePlugin[]),
      ],
      typescript,
      uriConverter: { asFileName, asUri },
      workerContext,
    });
    return workerLanguageService;
  });
};
