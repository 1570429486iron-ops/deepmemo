import yaml
from pathlib import Path
from openai import OpenAI


class LLMService:
    def __init__(self, config_path: str = "config/llm_api.yaml"):
        config_file = Path(__file__).parent.parent.parent / config_path
        with open(config_file) as f:
            cfg = yaml.safe_load(f)
        # 取第一个 provider 配置（目前固定 siliconflow）
        provider_name = list(cfg.keys())[0]
        self.provider = cfg[provider_name]
        self.client = OpenAI(
            api_key=self.provider["api_key"],
            base_url=self.provider["api_base"],
        )
        self.model = self.provider["model"]
        self.max_tokens = self.provider.get("max_tokens", 1000)
        self.temperature = self.provider.get("temperature", 0.7)

    def chat(self, messages: list[dict], stream: bool = False):
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            stream=stream,
        )
        if stream:
            return self._iter_stream_content(response)
        return response

    def _iter_stream_content(self, response):
        for chunk in response:
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                continue

            delta = getattr(choices[0], "delta", None)
            content = getattr(delta, "content", None)
            if content:
                yield content


llm_service = LLMService()
