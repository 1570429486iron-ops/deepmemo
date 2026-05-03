from collections.abc import Callable

from src.ai.types import WebSearchResult


class WebSearchAgent:
    def __init__(self, *, enabled: bool = False, provider: Callable[[str], list[str]] | None = None):
        self.enabled = enabled
        self.provider = provider

    def search(self, query: str) -> WebSearchResult:
        if not self.enabled:
            return WebSearchResult(
                enabled=False,
                used=False,
                message="WebSearchAgent 已预留接口，但当前 MVP 默认禁用联网搜索。",
            )

        if not self.provider:
            return WebSearchResult(
                enabled=True,
                used=False,
                message="WebSearchAgent 已启用，但尚未配置具体 web search provider。",
            )

        snippets = self.provider(query)
        return WebSearchResult(
            enabled=True,
            used=bool(snippets),
            snippets=snippets,
            message=None if snippets else "外部搜索没有返回可用结果。",
        )
