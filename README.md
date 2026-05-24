# TestForge

TestForge is an intelligent Electron desktop application that records user interactions and uses AI to generate structured QA test cases. It is designed for QA teams, automation engineers, and developers who want to accelerate test documentation with minimal manual effort.

## 🎯 What TestForge Does

- Captures desktop user interactions such as clicks, keyboard events, scrolling, and navigation
- Takes screenshots during recording for visual context
- Sends recorded actions to AI services (Claude or Gemini)
- Generates professional QA test cases with steps, preconditions, expected results, and metadata
- Exports test cases as Word documents (`.docx`)

## ✨ Key Features

- **Real-time desktop recording** of user activities
- **AI-powered test case generation** using Claude or Gemini
- **Screenshot capture** to document UI steps visually
- **Structured documentation** with test case IDs, priorities, and types
- **Export support** for `.docx` delivery
- **Settings management** for API keys and model selection

## 📦 Supported Platforms

- Windows
- macOS
- Linux

## ⚙️ Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Claude API key or Gemini API key for AI generation

## 🚀 Getting Started

### Install dependencies

```bash
npm install
```

### Run the app in development

```bash
npm run dev
```

### Build the app for production

```bash
npm run build
```

### Preview the production build

```bash
npm preview
```

## 🧩 How to Use TestForge

1. Open the app and go to **Settings**.
2. Enter your Claude or Gemini API key and choose the AI model.
3. Start a new recording session from the **Dashboard**.
4. Perform the actions you want to capture.
5. Stop recording and review the captured steps.
6. Generate AI-based test cases.
7. Export the results as a `.docx` document.

## 🏗 Architecture Overview

TestForge uses a standard Electron app architecture with a native main process and a React renderer process.

- `electron/main.ts` — application entry point and window management
- `electron/preload.ts` — secure bridge between renderer and main
- `electron/ipcHandlers.ts` — IPC request handling
- `electron/actionObserver.ts` — user interaction recording
- `electron/screenshotCapture.ts` — screenshot capture logic
- `src/` — React UI and application state
- `src/services/` — AI integration and export generation
- `src/store/useAppStore.ts` — shared application state

## 🤖 AI Providers

### Claude (Anthropic)
- `Claude 3.5 Sonnet` — best for high-quality reasoning and detailed output
- `Claude 3.5 Haiku` — faster, lightweight option
- `Claude 3 Sonnet` — balanced flexibility

### Gemini (Google)
- `Gemini 2.0 Flash` — fast and cost-efficient
- `Gemini 3 Pro` — advanced reasoning
- `Gemini 3.1 Pro` — powerful and flexible

## 🧪 Available Scripts

```bash
npm run dev      # Start dev server
npm run build    # Build production assets
npm preview      # Preview production build
npm run lint     # Run ESLint
```

## 📁 Project Structure

```
├── electron/                    # Electron main process and native modules
├── src/                         # React renderer application
├── public/                      # Static assets
├── dist-electron/               # Compiled Electron output
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite configuration
└── electron-builder.config.js   # Packaging configuration
```

## 📚 Documentation

- `MD_Files/TestForge_Study.md` — product study
- `MD_Files/TestForge_Architecture.md` — architecture document
- `MD_Files/TestForge_Detailed_Study.md` — detailed product study

## ✅ Notes

- The app stores API keys locally and only uses them for AI generation.
- Recorded actions are forwarded to AI for automated test case creation.
- Exported `.docx` files are intended for QA review, reporting, or sharing.
