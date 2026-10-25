"""Claude and Gemini judge models for Python DeepEval."""
import json
import os
import re
from typing import Optional

from deepeval.models import DeepEvalBaseLLM


def _json_suffix(schema) -> str:
    return (
        "\n\nRespond with ONLY a valid JSON object matching this JSON schema, "
        "with no markdown fences or commentary:\n"
        + json.dumps(schema.model_json_schema())
    )


def _parse_schema(text: str, schema):
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return schema.model_validate_json(text)
    except Exception:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise
        return schema.model_validate_json(text[start : end + 1])


class _BaseJudge(DeepEvalBaseLLM):
    def __init__(self, model_name: str):
        self.model_name = model_name
        super().__init__(model_name)

    def get_model_name(self) -> str:
        return self.model_name

    def _complete(self, prompt: str) -> str:
        raise NotImplementedError

    async def _acomplete(self, prompt: str) -> str:
        raise NotImplementedError

    def generate(self, prompt: str, schema: Optional[type] = None):
        if schema is None:
            return self._complete(prompt)
        return _parse_schema(self._complete(prompt + _json_suffix(schema)), schema)

    async def a_generate(self, prompt: str, schema: Optional[type] = None):
        if schema is None:
            return await self._acomplete(prompt)
        return _parse_schema(await self._acomplete(prompt + _json_suffix(schema)), schema)


class ClaudeJudge(_BaseJudge):
    _clients = None

    def load_model(self):
        if self._clients is None:
            import anthropic

            key = os.environ.get("ANTHROPIC_API_KEY")
            if not key:
                raise RuntimeError("ANTHROPIC_API_KEY is not set.")
            self._clients = (anthropic.Anthropic(api_key=key), anthropic.AsyncAnthropic(api_key=key))
        return self._clients

    @staticmethod
    def _text(message) -> str:
        return "".join(b.text for b in message.content if getattr(b, "type", "") == "text")

    def _complete(self, prompt: str) -> str:
        client, _ = self.load_model()
        msg = client.messages.create(
            model=self.model_name,
            max_tokens=4096,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        return self._text(msg)

    async def _acomplete(self, prompt: str) -> str:
        _, client = self.load_model()
        msg = await client.messages.create(
            model=self.model_name,
            max_tokens=4096,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        return self._text(msg)


class GeminiJudge(_BaseJudge):
    _client = None

    def load_model(self):
        # Keep a reference: google-genai closes the client when it is garbage collected.
        if self._client is None:
            from google import genai

            key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
            if not key:
                raise RuntimeError("GOOGLE_API_KEY is not set.")
            self._client = genai.Client(api_key=key)
        return self._client

    def _config(self):
        from google.genai import types

        return types.GenerateContentConfig(temperature=0)

    def _complete(self, prompt: str) -> str:
        res = self.load_model().models.generate_content(
            model=self.model_name, contents=prompt, config=self._config()
        )
        return res.text or ""

    async def _acomplete(self, prompt: str) -> str:
        res = await self.load_model().aio.models.generate_content(
            model=self.model_name, contents=prompt, config=self._config()
        )
        return res.text or ""


def make_judge(provider: str, model: str) -> DeepEvalBaseLLM:
    if provider == "claude":
        return ClaudeJudge(model)
    if provider == "gemini":
        return GeminiJudge(model)
    raise ValueError(f"Unknown provider: {provider}")
