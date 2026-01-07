# @vuebro/monaco-sfc

A Monaco Editor language server for Vue Single File Components (SFC). This library provides Vue language support for the Monaco editor, offering rich editing experiences with syntax highlighting, IntelliSense, error detection, and more for Vue SFCs.

## Features

- Vue SFC (Single File Component) support
- Syntax highlighting for Vue, HTML, CSS, JavaScript, and TypeScript
- IntelliSense and auto-completion for Vue templates and scripts
- Error detection and linting
- Auto-closing of tags and brackets
- Folding support for regions
- Proper indentation and formatting rules
- Integration with Monaco Editor's web worker system

## Installation

```bash
npm install @vuebro/monaco-sfc
```

## Usage

```javascript
import initMonacoSFC from "@vuebro/monaco-sfc";

// Initialize with your Monaco instance
initMonacoSFC(monaco);

// Now you can create Vue SFC editors
const editor = monaco.editor.create(document.getElementById("container"), {
  value: "<template>\n  <div>Hello Vue in Monaco!</div>\n</template>",
  language: "vue",
});
```

## Dependencies

This package relies on:

- `@volar/monaco` - Vue Language Server integration for Monaco
- `@vue/language-core` - Vue Language Service core
- `@vue/language-service` - Vue Language Service
- `monaco-editor` - The Monaco Editor
- `vscode-uri` - URI handling for VS Code compatibility

## How It Works

This package sets up the Monaco Editor to handle Vue SFCs by:

1. Registering the 'vue' language with Monaco
2. Loading appropriate language configurations for Vue and its embedded languages
3. Creating a web worker to handle language service operations
4. Activating features like auto-insertion, markers, and syntax providers

## License

AGPL-3.0-only
