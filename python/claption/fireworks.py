from __future__ import annotations

import json
import urllib.request


class FireworksClient:
    def __init__(self, api_key: str, base_url: str = "https://api.fireworks.ai/inference/v1") -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def chat(self, model: str, messages: list[dict], temperature: float = 0.2) -> str:
        body = json.dumps(
            {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "response_format": {"type": "json_object"},
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload["choices"][0]["message"]["content"]
