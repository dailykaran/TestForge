import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Retriever } from "../rag/retriever";
import { TestCaseSchema, type GraphStateType } from "./state";

export const normalizeActions = async (s: GraphStateType) => {
  const steps = s.actions.map((a, index) => {
    const detail = [a.label, a.target, a.value, a.keyCombo && `key ${a.keyCombo}`, a.url, a.elementHint]
      .filter(Boolean).join(" | ");
    const extras = [
      a.coordinates ? `at (${a.coordinates.x},${a.coordinates.y})` : "",
      a.windowTitle ? `window "${a.windowTitle}"` : "",
    ].filter(Boolean).join(", ");
    return `${index + 1}. ${a.type}${detail ? `: ${detail}` : ""}${extras ? ` (${extras})` : ""}`;
  });
  return { query: steps.join("\n") };
};

const GENERIC_LABEL = /^(mouse click|key press|click|key|scroll)$/i;

function meaningfulQuery(s: GraphStateType, summary?: string): string[] {
  const terms = new Set<string>();
  for (const a of s.actions ?? []) {
    for (const part of [a.label, a.target, a.value, a.url, a.elementHint, a.windowTitle]) {
      const t = part?.trim();
      if (t && !GENERIC_LABEL.test(t)) terms.add(t.slice(0, 120));
    }
  }
  const queries: string[] = [];
  if (summary?.trim()) queries.push(summary.trim(), `${summary.trim()}\nprerequisites, preconditions, setup and cleanup`);
  if (terms.size) queries.push([...terms].slice(0, 40).join("; "));
  if (s.critique?.trim()) queries.push(`${summary ?? ""}\n${s.critique.trim()}`.slice(0, 1500));
  if (!queries.length) queries.push(s.query);
  return queries;
}

export const makeRetrieve = (retriever: Retriever, summary?: string) => async (s: GraphStateType) => {
  try {
    const seen = new Set<string>(s.context ?? []);
    const merged: string[] = [...seen];
    for (const q of meaningfulQuery(s, summary)) {
      for (const hit of await retriever.search(q, 6)) {
        if (!seen.has(hit)) { seen.add(hit); merged.push(hit); }
      }
    }
    const context = merged.slice(0, 10);
    console.log(`[RAG] retrieved ${context.length} chunk(s) from knowledge base.`);
    return { context };
  } catch (error) {
    console.error('Knowledge-base retrieval failed; continuing without context.', error);
    return { context: s.context ?? [] };
  }
};


export const makeGenerate = (llm: BaseChatModel, contextPrompt?: string, summary?: string) => async (s: GraphStateType) => {
  const images = (s.screenshots ?? []).filter(b => b?.trim()).slice(0, 20).map(b => ({
    type: "image_url" as const,
    image_url: { url: `data:image/png;base64,${b}` },
  }));

  // With an uploaded prompt, the prompt file is the sole authority for format, rules and examples.
  if (contextPrompt) {
    const system =
      "You generate test cases from a recorded user session. The UPLOADED PROMPT below is the sole " +
      "authority: obey EVERY instruction, rule, constraint, section heading, structure, numbering, " +
      "pattern and worked example in it, including its number-of-test-cases rules, wording style and " +
      "level of detail. Mirror its example test case exactly in layout and depth, and output only what " +
      "that format allows (no preamble or commentary). Headings the prompt frames between double lines " +
      "are mandatory sections; do not skip, rename or reorder them.\n" +
      "Facts to use: the recorded steps, the attached screenshots, and the reference context from the " +
      "knowledge base. The knowledge-base reference context contains real, reviewed test cases and domain " +
      "steps: when it covers the same feature or flow, REUSE its concrete steps, exact UI text, " +
      "dialog names, preparation and teardown flows and verification wording, and match the depth and number of " +
      "steps of the prompt's example test case (detailed, one action per step, explicit verification steps). " +
      "The knowledge base may be empty or may not cover this flow; then rely on the uploaded prompt itself " +
      "(its rules, scenario patterns and reference example). " +
      "If the prompt defines a placeholder for unknown UI text, use it ONLY when the text " +
      "appears in neither the knowledge base nor the screenshots; always prefer the exact text from them. " +
      "Parts of the recording (such as environment preparation or teardown) may be absent: follow the " +
      "prompt's own rules about which section each kind of content belongs in, and write EVERY section the " +
      "prompt defines in full, elaborated detail at the depth and step count of its reference example " +
      "(one action per line, explicit verification lines, exact UI text). Do not add or skip sections " +
      "against the prompt's rules. Only content describing the tested behavior is limited to recorded " +
      "actions. " +
      "Use exactly the output layout the prompt defines (section order, headings, fields) and nothing else. Recorded " +
      "clicks and key presses are generic (\"Mouse Click\", \"Key Press\"): never copy those labels; use " +
      "the screenshots and coordinates to name the real UI element with its exact UI text. Never mention " +
      "screenshot numbers or write references like '(screenshot #2)'.\n\n" +
      `=== UPLOADED PROMPT START ===\n${contextPrompt}\n=== UPLOADED PROMPT END ===`;
    const user =
      (summary ? `Test case summary from the user:\n${summary}\n\n` : "") +
      `Recorded steps:\n${s.query}\n\n` +
      `Reference context (knowledge base):\n${s.context.length ? s.context.join("\n---\n") : "(none)"}\n\n` +
      (s.critique
        ? `Your previous output:\n${s.formattedText}\n\nA compliance reviewer found these violations of the uploaded prompt. Rewrite the full output and fix all of them:\n${s.critique}\n`
        : "");
    const res = await llm.invoke([
      { role: "system", content: system },
      { role: "user", content: [{ type: "text" as const, text: user }, ...images] },
    ]);
    const text = typeof res.content === "string"
      ? res.content
      : res.content.map(p => ("text" in p && typeof p.text === "string" ? p.text : "")).join("");
    if (!text.trim()) throw new Error("The model returned an empty test case.");
    return { formattedText: text.trim(), iterations: (s.iterations ?? 0) + 1 };
  }

  const structured = llm.withStructuredOutput(
    z.object({ testCases: z.array(TestCaseSchema) })
  );

  const system =
    "You are a senior QA engineer. Write complete, executable test cases from the recorded " +
    "user actions. Put environment preparation and account/project creation in setupSteps, " +
    "only the behavior being tested in actionSteps, and teardown or data deletion in cleanupSteps. " +
    "Do not put all actions into one list. Keep preconditions limited to facts that must already " +
    "be true before setup begins. In actionSteps, represent important actions and their checks as " +
    "separate ordered strings: after each major state change, submission, connection, save, or sync, " +
    "include a distinct step beginning with 'Verify that...' and name the observable expected state. " +
    "Do not combine the action and its verification into one string, and do not invent UI elements " +
    "or outcomes. Use the reference context for domain guidance, not as evidence that an unrecorded " +
    "action occurred. Write each action step using the exact wording of the matching recorded action " +
    "(button, field, menu and page names verbatim); the user's summary describes intent only and never " +
    "replaces recorded actions. Recorded mouse clicks and key presses are generic (\"Mouse Click\", " +
    "\"Key Press\"): never copy those labels as steps. Use the attached screenshots and click " +
    "coordinates to identify the actual UI element clicked or field typed into, and write steps like " +
    "'Click the \"Save\" button'. Never mention screenshot numbers or write references such as " +
    "'(screenshot #2)'. Consecutive key presses are " +
    "typing into the focused field. When the session covers several distinct scenarios or features, " +
    "return multiple separate test cases, each with its own meaningful steps.";

  const user =
    (summary ? `Test case summary from the user:\n${summary}\n\n` : "") +
    `Recorded steps:\n${s.query}\n\n` +
    `Reference context:\n${s.context.length ? s.context.join("\n---\n") : "(none)"}\n\n` +
    (s.critique ? `A reviewer found these problems. Fix them:\n${s.critique}\n` : "");

  const res = await structured.invoke([
    { role: "system", content: system },
    { role: "user", content: [{ type: "text" as const, text: user }, ...images] },
  ]);
  return { testCases: res.testCases, iterations: (s.iterations ?? 0) + 1 };
};

const FormatSpecSchema = z.object({
  requiredLabels: z.array(z.string()).describe(
    "Literal section headings and field labels (without trailing colon) that the prompt's mandatory output format requires on their own line in every output, in order."),
  forbiddenLabels: z.array(z.string()).describe(
    "Literal headings or labels the prompt's format explicitly excludes but a model might wrongly add (e.g. the prompt says 'No test ID'). Usually empty."),
  stepSections: z.array(z.string()).describe(
    "Subset of requiredLabels that are lists of numbered steps."),
});
type FormatSpec = z.infer<typeof FormatSpecSchema>;

const specCache = new Map<string, Promise<FormatSpec>>();

// The required format is read from whichever prompt was uploaded, so no format is hardcoded here.
function extractFormatSpec(judge: BaseChatModel, contextPrompt: string): Promise<FormatSpec> {
  let spec = specCache.get(contextPrompt);
  if (!spec) {
    spec = judge.withStructuredOutput(FormatSpecSchema).invoke(
      "Read the prompt below and extract ONLY the literal layout of its mandatory OUTPUT format (the " +
      "headings and field labels the generated output must contain). Copy labels exactly as written in the " +
      "prompt's format template or reference example. Ignore instructions that are not output headings or " +
      "field labels. If the prompt defines no fixed layout, return empty arrays.\n\n" +
      `PROMPT:\n${contextPrompt}`
    ).catch(error => {
      console.error("Could not extract the output format from the uploaded prompt; using reviewer only.", error);
      specCache.delete(contextPrompt);
      return { requiredLabels: [], forbiddenLabels: [], stepSections: [] };
    });
    specCache.set(contextPrompt, spec);
  }
  return spec;
}

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const labelLine = (label: string) => new RegExp(`^\\W*${escapeRe(label.trim())}\\W*(?::.*)?$`, "im");
const numberedCount = (block: string) => (block.match(/^\s*(?:Step\s*)?\d+[.)]?\s+\S/gim) ?? []).length;

function structuralIssues(text: string, spec: FormatSpec): string[] {
  const issues: string[] = [];
  const labels = spec.requiredLabels.map(l => l.trim()).filter(Boolean);
  const positions = labels.map(l => labelLine(l).exec(text)?.index ?? -1);
  labels.forEach((l, i) => {
    if (positions[i] === -1) issues.push(`Missing the '${l}' heading/field required by the prompt's output format.`);
  });
  for (const f of spec.forbiddenLabels.map(l => l.trim()).filter(Boolean)) {
    if (labelLine(f).test(text)) issues.push(`Remove '${f}': it is not part of the prompt's output format.`);
  }
  for (const section of spec.stepSections) {
    const i = labels.indexOf(section.trim());
    if (i === -1 || positions[i] === -1) continue;
    const later = positions.filter(p => p > positions[i]);
    const end = later.length ? Math.min(...later) : text.length;
    if (numberedCount(text.slice(positions[i], end)) === 0) issues.push(`The '${section}' section has no numbered steps.`);
  }
  return issues;
}
export const makeValidate = (judge: BaseChatModel, summary?: string, contextPrompt?: string) => async (s: GraphStateType) => {
  if (contextPrompt) {
    const structural = structuralIssues(s.formattedText ?? "", await extractFormatSpec(judge, contextPrompt));
    if (structural.length) return { critique: structural.map(i => `- ${i}`).join("\n") };

    const verdict = await judge
      .withStructuredOutput(z.object({ pass: z.boolean(), critique: z.string() }))
      .invoke(
        "You are a strict compliance reviewer. Check the generated output against EVERY instruction, " +
        "rule, section heading (including those framed between double lines), structure, numbering, " +
        "pattern and example in the uploaded prompt, and against the recorded steps (no invented " +
        "actions, no generic 'Mouse Click'/'Key Press' steps, no screenshot-number references). " +
        "Fail if anything is missing, renamed, reordered, or deviates from the prompt's format. Also fail if " +
        "the output is less detailed (fewer, coarser steps, missing verification steps) than the prompt's " +
        "example test case, if it uses a placeholder for text that IS available in the knowledge base " +
        "or screenshots, if any section ignores the prompt's own rules about what belongs in it, or if the " +
        "knowledge-base reference context has relevant concrete steps, UI text or flows that " +
        "were ignored. List each violation concisely.\n\n" +
        `UPLOADED PROMPT:\n${contextPrompt}\n\n` +
        (summary ? `Test case summary from the user:\n${summary}\n\n` : "") +
        `Knowledge-base reference context:\n${s.context?.length ? s.context.join("\n---\n") : "(none)"}\n\n` +
        `Recorded steps:\n${s.query}\n\nGenerated output:\n${s.formattedText}`
      );
    return { critique: verdict.pass ? "" : verdict.critique };
  }
  const verdict = await judge
    .withStructuredOutput(z.object({ pass: z.boolean(), critique: z.string() }))
    .invoke(
      "Review these test cases against the recorded steps. Check: (1) setup, core actions, and " +
      "cleanup are in their separate fields, (2) every recorded core action is covered and ordered, " +
      "(3) important state changes, submissions, connections, saves, and syncs have a separate " +
      "following actionSteps entry beginning 'Verify that...' with an observable result, (4) no " +
      "action or outcome is invented, and (5) expected results are specific. If a verification is " +
      "missing or a workflow is incorrectly grouped, fail and explain the correction.\n\n" +
      (summary ? `Test case summary from the user:\n${summary}\n\n` : "") +
      `Recorded steps:\n${s.query}\n\nTest cases:\n${JSON.stringify(s.testCases, null, 2)}`
    );
  return { critique: verdict.pass ? "" : verdict.critique };
};

