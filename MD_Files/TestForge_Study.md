# TestForge Product Study

## 1. Product Summary

**TestForge** is a desktop application for automating the capture of user interactions and generating professional QA test cases using AI. It is built with Electron and React, and it integrates with Claude or Gemini APIs to transform recorded user actions into structured test documentation.

### Core value proposition
- Automatically captures desktop user actions
- Generates QA test cases with AI assistance
- Produces exportable Word documents for sharing with QA and development teams
- Helps speed up test documentation and improve consistency

## 2. Key Features

- **Real-time interaction recording**: monitors clicks, keyboard input, scrolling, navigation, and other desktop actions
- **Screenshot capture**: automatically takes screenshots during test execution for visual evidence
- **AI-powered analysis**: uses Anthropic Claude or Google Gemini to generate test case descriptions and structure
- **Export to .docx**: generates Word documents containing test cases and step definitions
- **Configurable AI models**: supports multiple AI provider options and model selections
- **Local API key handling**: stores API keys locally in a privacy-friendly way

## 3. Supported Workflows

1. Configure API keys and a preferred AI model in the settings page
2. Start a new recording session from the dashboard
3. Perform actions in the selected screen/window while the recorder captures interaction events
4. Stop recording and review captured actions on the Review page
5. Generate AI-based test cases from the recorded session
6. Export the generated test cases as a Word document

## 4. Architecture Overview

### Technology stack
- **Electron**: desktop application platform
- **React 19 + TypeScript**: renderer UI
- **Vite**: build and development tooling
- **Tailwind CSS**: utility-first styling
- **Zustand**: application state management
- **uiohook-napi**: native user interaction tracking
- **screenshot-desktop**: screenshot capture
- **docx**: Word document generation

### Main functional layers
- `electron/`: native desktop and system interaction layer
  - `main.ts`: Electron startup and app lifecycle
  - `ipcHandlers.ts`: secure renderer/main communication
  - `actionObserver.ts`: capture of user interactions
  - `screenshotCapture.ts`: screenshot creation
  - `preload.ts`: preload script for secure IPC access
- `src/`: renderer application
  - `src/pages/`: user-facing screens such as Dashboard, Recording, Review, Settings
  - `src/services/`: AI and export services
  - `src/store/`: global state store
  - `src/App.tsx`: application shell

## 5. AI Model Support

### Claude (Anthropic)
- `Claude 3.5 Sonnet` for high-quality output
- `Claude 3.5 Haiku` for faster and lighter processing
- Suitable when test case quality and contextual understanding are a priority

### Gemini (Google)
- `Gemini 2.0 Flash` for fast, cost-effective responses
- `Gemini 3.1 Pro` and `Gemini 3 Pro` for advanced reasoning
- Suitable for teams that need high volume and fast response

## 6. Installation and Development

### Requirements
- Node.js 18+
- npm 9+
- Desktop OS: Windows, macOS, or Linux

### Common commands
- `npm install` — install dependencies
- `npm run dev` — start development server
- `npm run build` — build production app
- `npm run preview` — preview production build
- `npm run lint` — run ESLint checks

## 7. Product Strengths

- Great fit for QA teams and automation engineers who need structured test case output
- Reduces manual effort in test documentation
- Combines visual documentation with AI-generated narrative
- Supports multiple AI providers to avoid vendor lock-in

## 8. Notes for Users

- API keys are required for AI-powered generation
- The recorder is designed for desktop applications and local screen capture
- Export format is currently `.docx`, making it easy to share with stakeholders

## 9. File and Project Summary

- `package.json` shows Electron app dependencies and scripts
- `electron/` contains native desktop logic, recording, screenshot, and IPC
- `src/` contains the React-based UI, AI services, and state management
- `vite.config.ts` and `tsconfig.json` support the build configuration
- `MD_Files/` is the designated documentation folder
