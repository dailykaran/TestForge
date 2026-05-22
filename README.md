# Test Case Recorder

An intelligent desktop application that automatically records user interactions and generates professional QA test cases using AI (Claude or Gemini). Perfect for QA teams, test automation engineers, and developers who need to streamline test documentation.

## 🎯 Overview

**Test Case Recorder** is an Electron-based desktop application that:
- Records all user interactions (clicks, keyboard input, scrolling, navigation, etc.)
- Captures screenshots during test execution
- Uses AI (Claude 3.5 Sonnet or Gemini 2.0 Flash) to analyze recorded actions
- Generates structured, professional QA test case documentation
- Exports test cases as Word documents (.docx)
- Supports multiple AI model configurations for flexibility

## ✨ Key Features

- **🎬 Real-time Action Recording**: Captures 11 types of user interactions including clicks, keyboard input, scrolling, drag operations, and navigation
- **📸 Automatic Screenshots**: Takes screenshots on every click action for visual documentation
- **🤖 AI-Powered Test Generation**: Uses Claude or Gemini APIs to generate structured test cases from recorded actions
- **📋 Professional Documentation**: Generates test cases with:
  - Test Case IDs (TC_#)
  - Descriptive names and module classification
  - Preconditions
  - Numbered atomic steps
  - Expected results
  - Priority levels (High/Medium/Low)
  - Test type classification (Functional/UI/Navigation/Regression)
- **💾 Export Capabilities**: Save test cases as Word documents (.docx) for easy sharing
- **⚙️ Flexible Configuration**: Support for multiple AI models and API keys
- **🔐 Privacy-First Design**: API keys stored locally in memory, no cloud persistence

## 📋 System Requirements

- **Operating System**: Windows, macOS, or Linux
- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **AI API Keys**: Either Claude (Anthropic) or Gemini (Google) API key

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd testcase-recorder
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Environment Variables
Create a `.env` file in the root directory (optional for development):
```env
# API Configuration is done via the Settings UI
# No environment variables required for basic operation
```

## 📖 Usage Guide

### Starting the Application

**Development Mode:**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
```

**Preview Production Build:**
```bash
npm preview
```

### Application Workflow

1. **Dashboard**: Start screen with options to begin recording
2. **Setup**: Select the screen/window to record from
3. **Recording**: Active recording session where interactions are captured
4. **Review**: Review captured actions and generate test cases using AI
5. **Settings**: Configure API keys and select AI models

### Step-by-Step: Creating a Test Case

1. **Configure API Keys** (first time):
   - Go to Settings
   - Enter your Claude API key or Gemini API key
   - Select your preferred AI model
   - Save settings

2. **Start Recording**:
   - Click "New Recording" from Dashboard
   - Select the screen/window to record
   - Click "Start Recording"
   - Perform your user actions (clicks, typing, navigation, etc.)
   - Application automatically captures screenshots and logs actions

3. **Stop Recording**:
   - Click "Stop Recording" when done
   - Review the recorded actions

4. **Generate Test Cases**:
   - Click "Generate Test Cases"
   - AI analyzes recorded actions and screenshots
   - Structured test cases are generated

5. **Export Results**:
   - Review generated test cases
   - Click "Export" to save as Word document (.docx)

## 🏗️ Architecture

### Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Desktop Framework**: Electron 42
- **Build Tool**: Vite
- **State Management**: Zustand
- **UI Components**: Lucide React (icons)
- **AI Services**: 
  - Claude API (Anthropic)
  - Gemini API (Google)
- **User Input Monitoring**: uiohook-napi
- **Screenshot Capture**: screenshot-desktop
- **Export**: docx library for Word document generation

### Project Structure

```
├── electron/                    # Electron main process
│   ├── main.ts                 # App entry point
│   ├── ipcHandlers.ts          # IPC communication handlers
│   ├── actionObserver.ts       # User interaction capture
│   ├── screenshotCapture.ts    # Screenshot functionality
│   └── preload.ts              # Preload script for context isolation
├── src/
│   ├── pages/                  # React pages
│   │   ├── Dashboard.tsx
│   │   ├── RecordingSetup.tsx
│   │   ├── Recording.tsx
│   │   ├── Review.tsx
│   │   └── Settings.tsx
│   ├── services/               # AI services
│   │   ├── claudeService.ts    # Claude API integration
│   │   ├── geminiService.ts    # Gemini API integration
│   │   └── exportService.ts    # Export functionality
│   ├── store/
│   │   └── useAppStore.ts      # Zustand state management
│   ├── App.tsx                 # Main React component
│   ├── types.ts                # TypeScript type definitions
│   └── index.css               # Global styles
├── public/                     # Static assets
├── dist-electron/              # Compiled Electron code
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
└── electron-builder.config.js  # Electron Builder configuration
```

### Data Flow

```
User Actions
    ↓
Action Observer (electron/actionObserver.ts)
    ↓
Screenshot Capture (on click events)
    ↓
Action Storage (Zustand store)
    ↓
IPC Communication (to React UI)
    ↓
Review Page (user confirmation)
    ↓
AI Service (Claude/Gemini API)
    ↓
Test Case Generation
    ↓
Export Service (Word document)
```

## 🤖 AI Model Configuration

### Supported Models

#### Google Gemini
- **Gemini 2.0 Flash** (Recommended): Fast, cost-effective, multimodal
- **Gemini 3.1 Pro**: Advanced reasoning capabilities
- **Gemini 3 Pro**: Balanced performance

**Gemini Advantages:**
- Lowest cost (~$0.01-$0.05 per session)
- Faster processing
- Good for high-volume testing

#### Anthropic Claude
- **Claude 3.5 Sonnet** (Recommended for quality): Superior reasoning, detailed analysis
- **Claude 3.5 Haiku**: Fast, lightweight option
- **Claude 3 Sonnet**: Balanced option

**Claude Advantages:**
- Higher quality test case generation
- Better understanding of complex workflows
- More consistent formatting

### Estimated API Costs (per recording session)

| Model | Input Cost | Output Cost | Estimated Total |
|-------|-----------|-----------|-----------------|
| Gemini 2.0 Flash | $0.001 | $0.001 | $0.01-$0.05 |
| Claude 3.5 Sonnet | $0.003 | $0.015 | $0.05-$0.15 |

## 🔧 Development

### Available Scripts

```bash
# Development server with HMR
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run ESLint
npm run lint
```

### Project Structure for Developers

- **Electron Process**: Handles native system interactions (action capturing, screenshot, file I/O)
- **Renderer Process**: React UI for user interaction and test case review
- **IPC Communication**: Secure message passing between Electron and React

### Key Files

| File | Purpose |
|------|---------|
| `electron/actionObserver.ts` | Monitors and captures user interactions |
| `electron/screenshotCapture.ts` | Handles screenshot functionality |
| `src/services/claudeService.ts` | Claude API integration |
| `src/services/geminiService.ts` | Gemini API integration |
| `src/services/exportService.ts` | Export test cases to .docx |
| `src/store/useAppStore.ts` | Global state management |

## 📦 Building for Production

### Create Standalone Executable

```bash
npm run build
```

This will:
1. Compile TypeScript
2. Build React app with Vite
3. Create Electron distribution files
4. Generate installer (via electron-builder)

### Output Location
- Windows: `dist/` (installer .exe)
- macOS: `dist/` (DMG file)
- Linux: `dist/` (AppImage or deb)

## 🔐 Security Considerations

- **API Keys**: Stored in memory only, not persisted to disk
- **Context Isolation**: Electron preload script enables context isolation
- **Node Integration**: Disabled for renderer process
- **IPC Security**: Limited message passing between processes
- **Screenshots**: Temporary storage, cleared after export

## 🐛 Troubleshooting

### Common Issues

**"API Key not set" error**
- Go to Settings
- Enter your Claude or Gemini API key
- Save and retry

**Screenshots not captured**
- Check system permissions for screenshot access
- Ensure the app has screen recording permissions (macOS/Linux)

**Test case generation fails**
- Verify API key is valid and has sufficient quota
- Check internet connection
- Ensure model name is correct in settings

**High API costs**
- Switch to Gemini 2.0 Flash for cost efficiency
- Reduce number of screenshots (fewer clicks = fewer screenshots)
- Use batch processing for multiple recordings

## 📝 Recorded Action Types

The application captures the following interaction types:

| Action | Description |
|--------|-------------|
| CLICK | Mouse left button press |
| DOUBLE_CLICK | Double click action |
| RIGHT_CLICK | Right-click (context menu) |
| KEY_PRESS | Keyboard input |
| SCROLL | Mouse wheel scroll |
| DRAG | Click and drag operation |
| WINDOW_OPEN | New window creation |
| NAVIGATION | URL/route change |
| INPUT | Text field entry |
| DROPDOWN | Select element change |
| SCREENSHOT_TRIGGER | Explicit screenshot capture |

## 🤝 Contributing

We welcome contributions! Please feel free to submit pull requests or open issues for bugs and feature requests.

## 📄 License

This project is part of the AI Test Case Generation suite. See LICENSE file for details.

## 📞 Support

For issues, questions, or suggestions:
- Check the [CODEBASE_ANALYSIS.md](CODEBASE_ANALYSIS.md) for detailed technical documentation
- Review existing issues on the repository
- Create a new issue with detailed steps to reproduce

## 🎓 Learn More

- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Claude API Documentation](https://docs.anthropic.com)
- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
