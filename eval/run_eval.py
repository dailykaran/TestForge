"""Evaluate one generated test case (.txt) with Python DeepEval.

Prints a single JSON document as the last stdout line. Errors go to stderr with exit code 1.
"""
import argparse
import json
import os
import sys

os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "YES")

GEVAL_METRICS = {
    "completeness": (
        "Completeness",
        "Does the test case include a clear title, preconditions, ordered action steps, "
        "and an expected result, with no missing information needed to execute it?",
    ),
    "clarity": (
        "Clarity",
        "Are the steps unambiguous, atomic, and written so a tester can execute them "
        "without guessing?",
    ),
    "correctness": (
        "Correctness",
        "Are the steps logically ordered and do the expected results follow from the "
        "actions? Penalise contradictions and invented behaviour.",
    ),
    "format": (
        "Format",
        "Is the test case consistently structured and professionally formatted as a QA test case?",
    ),
}
ALL_METRICS = list(GEVAL_METRICS) + ["answer_relevancy", "faithfulness", "contextual_relevancy"]


def read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--file")
    p.add_argument("--provider", choices=["claude", "gemini"])
    p.add_argument("--model")
    p.add_argument("--metrics", default=",".join(GEVAL_METRICS))
    p.add_argument("--threshold", type=float, default=0.5)
    p.add_argument("--context", help="Optional RAG context text file")
    p.add_argument("--input-text", dest="input_text", help="Optional short test case summary")
    p.add_argument("--check", action="store_true", help="Only verify the environment")
    args = p.parse_args()

    import deepeval
    from deepeval.metrics import (
        AnswerRelevancyMetric,
        ContextualRelevancyMetric,
        FaithfulnessMetric,
        GEval,
    )
    try:
        from deepeval.test_case import SingleTurnParams as Params
    except ImportError:  # older deepeval
        from deepeval.test_case import LLMTestCaseParams as Params
    from deepeval.test_case import LLMTestCase

    from judge import make_judge

    if args.check:
        print(json.dumps({"ok": True, "deepeval": getattr(deepeval, "__version__", "unknown")}))
        return
    if not (args.file and args.provider and args.model):
        p.error("--file, --provider and --model are required")

    actual = read_text(args.file)
    if not actual:
        raise ValueError("The test case file is empty.")
    summary = (args.input_text or "").strip()
    context = [read_text(args.context)] if args.context else None

    requested = [m.strip() for m in args.metrics.split(",") if m.strip()]
    unknown = [m for m in requested if m not in ALL_METRICS]
    if unknown:
        raise ValueError(f"Unknown metrics: {', '.join(unknown)}")

    judge = make_judge(args.provider, args.model)
    test_case = LLMTestCase(
        input=summary or "Generate a QA test case for the recorded user workflow.",
        actual_output=actual,
        retrieval_context=context,
    )

    results = []
    for name in requested:
        if name in GEVAL_METRICS:
            title, criteria = GEVAL_METRICS[name]
            metric = GEval(
                name=title,
                criteria=criteria,
                evaluation_params=[Params.ACTUAL_OUTPUT],
                model=judge,
                threshold=args.threshold,
                async_mode=False,
            )
        elif name == "answer_relevancy":
            if not summary:
                results.append({"metric": name, "skipped": "Requires an input/summary file."})
                continue
            metric = AnswerRelevancyMetric(model=judge, threshold=args.threshold, async_mode=False)
        else:
            if not context:
                results.append({"metric": name, "skipped": "Requires a RAG context file."})
                continue
            cls = FaithfulnessMetric if name == "faithfulness" else ContextualRelevancyMetric
            metric = cls(model=judge, threshold=args.threshold, async_mode=False)
        try:
            metric.measure(test_case)
            results.append(
                {
                    "metric": name,
                    "score": metric.score,
                    "threshold": args.threshold,
                    "passed": bool(metric.is_successful()),
                    "reason": getattr(metric, "reason", None),
                }
            )
        except Exception as exc:  # keep other metrics running
            results.append({"metric": name, "error": str(exc)[:500]})

    scored = [r for r in results if "score" in r]
    print(
        json.dumps(
            {
                "file": os.path.basename(args.file),
                "provider": args.provider,
                "model": args.model,
                "results": results,
                "overallScore": sum(r["score"] for r in scored) / len(scored) if scored else None,
                "passed": bool(scored) and all(r["passed"] for r in scored),
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
