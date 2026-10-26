# TestForge DeepEval Feature

## 1. Purpose and scope

The DeepEval feature provides an on-demand evaluation workflow for one generated test-case text file at a time. It uses the Python [DeepEval](https://github.com/confident-ai/deepeval) library and an LLM judge supplied by either Google Gemini or Anthropic Claude.

The feature is intentionally isolated from normal test-case generation:

- DeepEval is used only after the user opens the **Deep Eval** dialog from the Review screen.
- The existing LangGraph generation workflow is unchanged.
- The existing in-app generation judge is unchanged.
- The renderer does not call Python directly.
- The renderer does not receive or store provider API keys.
- Evaluation input is selected through the native Electron file picker.

The current implementation evaluates a single `.txt` test-case file per run. It can optionally compare that output with:

1. A short summary typed in the dialog.
2. A `.txt` RAG context file containing requirements, specifications, retrieved reference chunks, or approved examples.

The result contains a score, threshold, pass/fail status, and judge reasoning for each selected metric.

## 2. High-level architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│ React renderer                                                   │
│                                                                  │
│ Review.tsx                                                       │
│   └── Deep Eval button                                           │
│         └── DeepEvalDialog.tsx                                  │
│               ├── Environment check                              │
│               ├── Native file selection request                  │
│               ├── Gemini / Claude model selection                │
│               ├── Metric and threshold selection                 │
│               └── Results and expandable metric details          │
└───────────────────────────────┬──────────────────────────────────┘
                                │ window.testforgeAI.deepEval
                                │ contextBridge
┌───────────────────────────────▼──────────────────────────────────┐
│ Electron main process                                            │
│                                                                  │
│ ipcHandlers.ts                                                   │
│   └── setupDeepEvalHandlers()                                    │
│         └── deepEval.ts                                          │
│               ├── Native file dialog                            │
│               ├── File-size and file-type validation             │
│               ├── Keychain lookup                                │
│               ├── Python executable resolution                   │
│               ├── Child-process lifecycle                        │
│               ├── Timeout and cancellation                       │
│               └── JSON result parsing                             │
└───────────────────────────────┬──────────────────────────────────┘
                                │ child_process.spawn()
                                │ command-line arguments + env key
┌───────────────────────────────▼──────────────────────────────────┐
│ Python sidecar: eval/                                            │
│                                                                  │
│ run_eval.py                                                      │
│   ├── Builds DeepEval LLMTestCase                               │
│   ├── Creates selected metrics                                   │
│   ├── Runs each metric                                            │
│   └── Prints one JSON result                                     │
│                                                                  │
│ judge.py                                                         │
│   ├── ClaudeJudge(DeepEvalBaseLLM)                              │
│   └── GeminiJudge(DeepEvalBaseLLM)                              │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTPS API request
              ┌─────────────────┴─────────────────┐
              │                                   │
        Anthropic Claude                    Google Gemini
```

## 3. Source layout

| Path | Responsibility |
|---|---|
| `src/pages/Review.tsx` | Displays the Deep Eval toolbar button and opens the dialog. |
| `src/components/DeepEvalDialog.tsx` | Renderer UI for file selection, summary, model/provider selection, metrics, execution, and results. |
| `src/ipc.d.ts` | TypeScript declarations for the renderer-facing `window.testforgeAI.deepEval` API and result contracts. |
| `electron/deepEval.ts` | Main-process DeepEval orchestration, validation, Python process management, key injection, and result parsing. |
| `electron/ipcHandlers.ts` | Registers the DeepEval handlers during normal IPC setup. |
| `electron/preload.ts` | Exposes the restricted DeepEval API through `contextBridge`. |
| `electron/keyStore.ts` | Reads Claude and Gemini keys from the OS keychain. |
| `eval/run_eval.py` | Python CLI entry point and DeepEval metric orchestration. |
| `eval/judge.py` | Custom DeepEval model adapters for Claude and Gemini. |
| `eval/requirements.txt` | Python dependencies for the sidecar. |
| `electron-builder.config.js` | Copies Python evaluator source files into packaged application resources. |

## 4. User interaction flow

### 4.1 Opening the feature

1. The user generates or loads test cases in the Review screen.
2. The **Deep Eval** button is shown in the Automated Test Cases toolbar when `testCases` exists.
3. Clicking the button mounts `DeepEvalDialog`.
4. The dialog immediately calls `window.testforgeAI.deepEval.check()`.
5. The main process starts Python with `--check`.
6. If DeepEval is available, the dialog permits evaluation.
7. If Python or DeepEval is unavailable, the dialog shows setup guidance instead of silently failing.

### 4.2 Selecting the test-case file

The user clicks **Choose .txt** or **Change** for the test-case file.

The renderer sends only the logical file kind (`testcase`) to the main process. The main process:

1. Opens the native Electron file picker.
2. Restricts the picker to `.txt` files.
3. Verifies that the selected path is a regular file.
4. Enforces the current 200 KB maximum.
5. Stores the selected path in a main-process-only map.
6. Reads the file for a renderer preview.
7. Returns only the file name and preview text to the renderer.

The actual absolute path is never supplied by the renderer and is not included in the returned preview object.

The preview displays the complete selected file content and is placed in a scrollable panel. The main-process size limit protects memory and evaluation payload size while still allowing long multi-step test cases.

### 4.3 Optional RAG context

The optional RAG context picker follows the same native-dialog flow as the test-case picker. It is intended for text that the generated test case should be grounded in, such as:

- Product requirements.
- A feature specification.
- Business rules.
- Retrieved knowledge-base chunks.
- Previously approved test cases.
- UI or workflow behavior notes.

The selected context file is passed to Python as one retrieval-context item. It is not automatically read from LanceDB by DeepEval. The user must export or prepare the relevant reference text as a `.txt` file.

Selecting a context file enables:

- `faithfulness`
- `contextual_relevancy`

### 4.4 Optional test-case summary

The summary is entered directly into a two-line text area; it is not uploaded as a file. It describes the intended behavior in one or two sentences, for example:

```text
Verify that a registered user can log in with valid credentials and reach the Dashboard.
```

The main process limits the summary to 1,000 characters before passing it to Python.

Entering a summary enables `answer_relevancy`, which evaluates whether the generated test case is relevant to the requested behavior.

### 4.5 Selecting a judge

The dialog provides a provider toggle:

- **Gemini**
- **Claude**

Changing the provider selects the first model in that provider's model list. The model list includes the model IDs currently configured in the dialog, including Gemini 4 Argon and recent Claude entries. A custom model-ID option is also available for provider model IDs not listed in the UI.

The initial provider and model are derived from the persisted Settings judge model:

- A model beginning with `claude` opens on Claude.
- Other model IDs open on Gemini.

The main process validates the model ID before constructing the Python command:

```text
^[\w.\-:/]{1,100}$
```

### 4.6 Choosing metrics

The default metrics are:

- Completeness
- Clarity
- Correctness
- Format

Additional metrics become available when their required input exists:

| Metric | Required input |
|---|---|
| Completeness | Test-case file |
| Clarity | Test-case file |
| Correctness | Test-case file |
| Format | Test-case file |
| Answer relevancy | Typed summary |
| Faithfulness | RAG context file |
| Contextual relevancy | RAG context file |

The threshold slider defaults to `0.50` and is clamped by the main process to the range `0.00` through `1.00`.

### 4.7 Starting, cancelling, and completing a run

When the user clicks **Run evaluation**:

1. The dialog disables the run action and shows a loading state.
2. The renderer sends provider, model, selected metrics, threshold, context presence, and summary.
3. The main process verifies that no other DeepEval process is active.
4. The main process retrieves the selected provider key from the OS keychain.
5. The main process constructs the Python command.
6. The main process starts `run_eval.py`.
7. Python evaluates the selected metrics sequentially.
8. Python writes diagnostic output to stderr and emits the result JSON on stdout.
9. Electron parses the last JSON object line.
10. The renderer displays the overall result and metric details.

The user can click **Cancel run**. Electron kills the active Python child process and returns a cancellation response. Each run also has a five-minute timeout.

## 5. IPC and process boundary

### 5.1 Renderer API

`electron/preload.ts` exposes the following methods:

```ts
window.testforgeAI.deepEval.check()
window.testforgeAI.deepEval.pickFile(kind)
window.testforgeAI.deepEval.clearFile(kind)
window.testforgeAI.deepEval.run(request)
window.testforgeAI.deepEval.cancel()
```

The type declarations are in `src/ipc.d.ts`.

### 5.2 Handler responsibilities

`electron/deepEval.ts` owns all security-sensitive operations:

- Native file selection.
- File metadata inspection.
- File reading.
- API-key retrieval.
- Python executable selection.
- Child-process spawning.
- Environment-variable construction.
- Timeout management.
- Cancellation.
- JSON parsing.

The renderer sends structured values, but the main process does not trust them blindly. It validates provider, model, metric membership, threshold range, and file selection state.

### 5.3 API-key handling

The key is retrieved through:

```text
getClaudeApiKey()
getGeminiApiKey()
```

The key is passed to Python through the child process environment:

```text
ANTHROPIC_API_KEY
GOOGLE_API_KEY
```

The key is not passed as a command-line argument and is not returned to the renderer. If a Python error includes the key, the main process attempts to redact it before displaying the error.

DeepEval telemetry opt-out is also set for the child process:

```text
DEEPEVAL_TELEMETRY_OPT_OUT=YES
```

## 6. Python evaluator architecture

### 6.1 `run_eval.py`

`run_eval.py` is a standalone CLI. It accepts:

```text
--file <test-case.txt>
--provider claude|gemini
--model <model-id>
--metrics <comma-separated-metric-names>
--threshold <0..1>
--context <context.txt>
--input-text <summary>
--check
```

The `--check` mode imports DeepEval and emits a small JSON health response without making an LLM request.

For a normal run, the script:

1. Reads the test-case file as UTF-8.
2. Rejects an empty test-case file.
3. Reads the optional context file as UTF-8.
4. Normalizes the optional summary.
5. Validates requested metric names.
6. Creates a custom judge using `make_judge`.
7. Creates a DeepEval `LLMTestCase`.
8. Constructs each requested metric.
9. Measures each metric sequentially.
10. Captures each score, threshold, pass/fail status, and reason.
11. Continues to the next metric if one metric fails.
12. Calculates the average score across scored metrics.
13. Sets the overall result to passed only when there is at least one scored metric and every scored metric passes.

The `LLMTestCase` has this shape:

```python
LLMTestCase(
    input=summary or "Generate a QA test case for the recorded user workflow.",
    actual_output=test_case_text,
    retrieval_context=[context_text] if context_file_exists else None,
)
```

The generated `.txt` file is the `actual_output`. The typed summary is the `input`. The optional RAG file becomes `retrieval_context`.

### 6.2 `judge.py`

DeepEval expects a model implementing `DeepEvalBaseLLM`. TestForge supplies two adapters:

```text
ClaudeJudge
GeminiJudge
```

Both adapters implement:

- `load_model()`
- `generate()`
- `a_generate()`
- `get_model_name()`

The adapters request deterministic output with temperature `0`. Structured DeepEval prompts are extended with a JSON-schema instruction. The response parser supports both raw JSON and JSON fenced in a Markdown code block.

The Gemini adapter keeps a client reference for the lifetime of the judge. This is important because the Google GenAI client can otherwise be garbage-collected and closed before a request completes.

## 7. Metric behavior

### 7.1 Completeness

Implemented with `GEval`.

The judge checks whether the test case contains a usable title, preconditions, ordered action steps, and expected results, with enough information for execution.

### 7.2 Clarity

Implemented with `GEval`.

The judge checks whether steps are atomic, unambiguous, and executable without guessing.

### 7.3 Correctness

Implemented with `GEval`.

The judge checks logical ordering, action-to-outcome relationships, contradictions, and unsupported behavior.

### 7.4 Format

Implemented with `GEval`.

The judge checks whether the content uses a consistent and professional QA test-case structure.

### 7.5 Answer relevancy

Implemented with `AnswerRelevancyMetric`.

This metric requires a typed summary. It evaluates whether the generated test case addresses the intended request rather than drifting into unrelated behavior.

### 7.6 Faithfulness

Implemented with `FaithfulnessMetric`.

This metric requires a RAG context file. It evaluates whether claims in the generated test case are supported by the supplied context.

For example, if the context says:

```text
After three failed login attempts, the account is locked for 15 minutes.
```

and the test case says:

```text
After five failed attempts, the account is locked for 30 minutes.
```

the claim is not faithful to the supplied context.

### 7.7 Contextual relevancy

Implemented with `ContextualRelevancyMetric`.

This metric requires a RAG context file. It evaluates whether the supplied context is relevant to the test case rather than unrelated retrieval content.

## 8. Result contract

The Python process emits a JSON object with this shape:

```json
{
  "file": "login-test-case.txt",
  "provider": "gemini",
  "model": "gemini-4-argon",
  "results": [
    {
      "metric": "completeness",
      "score": 0.7,
      "threshold": 0.7,
      "passed": true,
      "reason": "The test case includes..."
    }
  ],
  "overallScore": 0.7,
  "passed": true
}
```

An individual result can instead contain:

```json
{
  "metric": "faithfulness",
  "skipped": "Requires a RAG context file."
}
```

or:

```json
{
  "metric": "clarity",
  "error": "Provider request failed."
}
```

The renderer maps this contract to `DeepEvalResult` and `DeepEvalMetricResult` in `src/ipc.d.ts`.

## 9. Results UI

The results panel is implemented in `DeepEvalDialog.tsx`.

### Overall card

The overall card shows:

- Passed or Failed.
- Average actual score.
- Expected threshold reference.
- Number of passed metrics.
- Number of scored metrics.
- Skipped or errored count.
- Provider and model.
- Expand-all / collapse-all control.
- Export JSON action.

The overall score is the arithmetic mean of metrics that returned a numeric score. Skipped and errored metrics are not included in the average.

### Metric rows

Each metric is initially collapsed. Clicking its name expands the metric details:

- Actual score.
- Expected score threshold.
- Outcome.
- Judge reasoning.
- Skipped explanation or error message, when applicable.

Judge reasoning is displayed as bullets rather than one paragraph. The UI splits the reasoning into sentence-like points while protecting common abbreviations such as `e.g.` and `i.e.`.

## 10. Python environment and dependency setup

The repository defines Python dependencies in `eval/requirements.txt`:

```text
deepeval>=3.0
anthropic>=0.40
google-genai>=1.0
```

Recommended development setup:

```powershell
python -m venv eval/.venv
eval/.venv/Scripts/pip install -r eval/requirements.txt
```

On macOS or Linux:

```bash
python3 -m venv eval/.venv
eval/.venv/bin/pip install -r eval/requirements.txt
```

Python resolution order in the Electron main process is:

1. `TESTFORGE_PYTHON`, if defined.
2. `eval/.venv/Scripts/python.exe` on Windows.
3. `eval/.venv/bin/python` on macOS/Linux.
4. `python` on Windows.
5. `python3` on macOS/Linux.

The evaluator can be checked without an API request:

```powershell
eval/.venv/Scripts/python.exe eval/run_eval.py --check
```

Expected output resembles:

```json
{"ok": true, "deepeval": "4.3.1"}
```

## 11. Packaging

`electron-builder.config.js` copies the Python source and requirements file into packaged resources:

```js
{
  from: 'eval',
  to: 'eval',
  filter: ['*.py', 'requirements.txt']
}
```

At runtime, packaged Electron resolves the evaluator directory under:

```text
process.resourcesPath/eval
```

The current packaging configuration does not bundle a Python interpreter or the Python virtual environment. Therefore, an installed Python runtime and installed DeepEval dependencies are still required on the target machine unless `TESTFORGE_PYTHON` points to a prepared interpreter.

Bundling Python with PyInstaller is a possible future distribution improvement, but it is not part of the current implementation.

## 12. Security and reliability controls

### Input controls

- Only `.txt` files are offered by the native picker.
- Selected files must be regular files.
- File size is limited to 200 KB.
- Model IDs are restricted to a safe character set and length.
- Metrics are filtered against a fixed allowlist.
- Threshold values are clamped to `0..1`.
- A run requires a selected test-case file.
- Concurrent evaluations are rejected.

### Secret handling

- API keys remain in the OS keychain.
- The renderer never receives the raw key.
- Keys are passed through environment variables rather than command-line arguments.
- Error output attempts to redact the active key.

### Process controls

- Python runs as a child process.
- Standard output and standard error are collected separately.
- Evaluation has a five-minute timeout.
- The active process can be killed by the user.
- Python failures are surfaced as errors rather than converted into a successful result.

### Isolation

The DeepEval sidecar is not imported by the normal generation graph. The feature is activated through dedicated handlers and is only invoked by the Deep Eval dialog.

## 13. Error handling

Typical errors and user-visible behavior:

| Condition | Behavior |
|---|---|
| Python executable missing | Dialog shows Python setup guidance. |
| DeepEval package missing | Environment check returns failure and setup guidance. |
| No provider key | Run fails with a Settings instruction. |
| Empty test-case file | Python rejects the run. |
| File over 200 KB | File selection is rejected. |
| Invalid model ID | Main process rejects the request. |
| No metric selected | Main process rejects the request. |
| Another evaluation is active | Main process rejects the request. |
| Provider request fails for one metric | That metric returns an error and remaining metrics continue. |
| Python exits without JSON | Main process reports that no result was returned. |
| User cancels | Active child process is killed. |
| Five-minute timeout | Active child process is killed and the run fails. |

## 14. Direct CLI examples

### Basic quality evaluation

```powershell
python eval/run_eval.py `
  --file .\samples\login-test-case.txt `
  --provider gemini `
  --model gemini-4-argon `
  --metrics completeness,clarity,correctness,format `
  --threshold 0.70
```

### Evaluation with a summary

```powershell
python eval/run_eval.py `
  --file .\samples\login-test-case.txt `
  --provider claude `
  --model claude-sonnet-4-5 `
  --metrics completeness,answer_relevancy `
  --input-text "Verify that a registered user can log in and reach the Dashboard."
```

### Evaluation with RAG context

```powershell
python eval/run_eval.py `
  --file .\samples\login-test-case.txt `
  --provider gemini `
  --model gemini-4-argon `
  --metrics completeness,faithfulness,contextual_relevancy `
  --context .\samples\login-reference.txt
```

## 15. Example input files

### Test-case file

```text
Title: Verify account lock after repeated failed logins

Preconditions:
- A registered user exists.
- The login page is available.

Steps:
1. Open the login page.
2. Enter the registered email address.
3. Enter an incorrect password.
4. Submit the login form.
5. Repeat the failed login until three failed attempts are recorded.

Expected Result:
The account is locked for 15 minutes and a lockout message is displayed.
```

### RAG context file

```text
Login feature requirements:
- Username must be a valid email address.
- Password must contain at least eight characters.
- After three failed login attempts, the account is locked for 15 minutes.
- A successful login redirects the user to the Dashboard.
- The lockout message must not reveal whether the email address exists.
```

### Summary entered in the dialog

```text
Verify that a registered user is locked for 15 minutes after three failed login attempts.
```

## 16. Verification performed during development

The implementation has been validated with:

- TypeScript compilation for the renderer.
- TypeScript compilation for the Electron/main-process configuration.
- ESLint on the DeepEval dialog and related integration files.
- Python `--check` execution against the installed DeepEval environment.
- A CLI execution using an invalid Gemini key to verify that the process reaches the provider boundary and returns a metric error rather than emitting a false successful score.

A real provider score requires a valid Claude or Gemini API key configured in TestForge Settings.

## 17. Current limitations and future improvements

### Current limitations

1. Evaluation is one test-case file per run.
2. Only text files are accepted.
3. RAG context is supplied manually as a text file; the evaluator does not query LanceDB directly.
4. The packaged application does not include Python or the Python dependencies.
5. The model list is maintained in the React component and may need updates as provider model IDs change.
6. Metric execution is sequential, so evaluating many metrics can take several provider requests and several minutes.
7. The result parser expects a JSON object on a stdout line from the Python process.
8. The overall score is an unweighted arithmetic mean of scored metrics.

### Potential future improvements

- Add a packaged PyInstaller evaluator for installer users without Python.
- Add a Settings field for the Python executable path instead of relying primarily on `TESTFORGE_PYTHON`.
- Add a native “export retrieved RAG context” action from the knowledge-base viewer.
- Add batch evaluation for a directory of test cases.
- Add evaluation history and local result persistence.
- Add metric-specific thresholds instead of one shared threshold.
- Add richer structured result fields for actual evidence, expected evidence, and recommendations.
- Add provider model discovery where supported, while retaining the custom model-ID fallback.
- Add automated integration tests with mocked provider clients.

