import yaml
from pathlib import Path
from openai import OpenAI
from typing import Optional


class LLMService:
    def __init__(self, config_path: str = "config/llm_api.yaml"):
        config_file = Path(__file__).parent.parent.parent / config_path
        with open(config_file) as f:
            self.config = yaml.safe_load(f)
        self.client = OpenAI(api_key=self.config["api_key"])
        self.model = self.config["model"]
        self.max_tokens = self.config.get("max_tokens", 1000)
        self.temperature = self.config.get("temperature", 0.7)

    def chat(self, messages: list[dict], stream: bool = False):
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            stream=stream,
        )
        return response


llm_service = LLMService()
