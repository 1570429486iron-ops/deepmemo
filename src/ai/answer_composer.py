from src.ai.types import Evidence, LocalSearchResult, RouteDecision, WebSearchResult


class AnswerComposer:
    def __init__(self, llm_service):
        self.llm_service = llm_service

    def compose(
        self,
        question: str,
        local_result: LocalSearchResult,
        route: RouteDecision,
        *,
        history: list[dict] | None = None,
        web_result: WebSearchResult | None = None,
    ) -> str:
        if not local_result.has_evidence:
            if web_result and web_result.snippets:
                return self._compose_web_only(question, route, web_result, history=history)
            return self._compose_no_evidence(question, route, web_result)

        external_block = ""
        if web_result and web_result.snippets:
            external_block = f"\n\n外部搜索补充：\n{self._format_web(web_result)}"

        messages = [
            {
                "role": "system",
                "content": (
                    "你是 DeepMemo 的个人知识库问答助手。"
                    "只能基于给定的本地知识库证据回答；如果证据不足，明确说不足。"
                    "回答使用中文，结论要简洁。"
                    "相关句子后必须使用 [1]、[2] 这样的数字引用，数字来自证据编号。"
                    "不要输出引用列表，系统会自动追加可点击引用块。"
                    "不要把外部常识包装成用户知识库里的内容。"
                ),
            }
        ]
        messages.extend(self._normalize_history(history or [])[-8:])
        messages.append(
            {
                "role": "user",
                "content": (
                    f"用户问题：{question}\n\n"
                    f"路由判断：{route.reason}\n\n"
                    f"本地知识库证据：\n{self._format_evidence(local_result)}"
                    f"{external_block}\n\n"
                    "请基于以上证据回答。必须区分本地知识库证据和外部搜索补充。"
                ),
            }
        )

        try:
            response = self.llm_service.chat(messages)
            return self._append_references(response.choices[0].message.content, local_result)
        except Exception as exc:
            return self._compose_fallback(local_result, exc)

    def _format_evidence(self, local_result: LocalSearchResult) -> str:
        blocks: list[str] = []
        for index, item in enumerate(local_result.evidence, start=1):
            blocks.append(
                "\n".join(
                    [
                        f"[证据 {index}] {item.path}:{item.start_line}-{item.end_line}",
                        f"引用编号：[{index}]",
                        f"匹配词：{item.query}",
                        item.excerpt,
                    ]
                )
            )
        return "\n\n".join(blocks)

    def _format_web(self, web_result: WebSearchResult) -> str:
        return "\n".join(f"[外部 {index}] {snippet}" for index, snippet in enumerate(web_result.snippets, start=1))

    def _compose_web_only(
        self,
        question: str,
        route: RouteDecision,
        web_result: WebSearchResult,
        *,
        history: list[dict] | None = None,
    ) -> str:
        messages = [
            {
                "role": "system",
                "content": (
                    "你是 DeepMemo 的个人知识库问答助手。"
                    "当前没有本地知识库证据，只能把外部搜索内容作为补充说明。"
                    "回答时必须明确标注这些内容不是本地知识库记录。"
                ),
            }
        ]
        messages.extend(self._normalize_history(history or [])[-8:])
        messages.append(
            {
                "role": "user",
                "content": (
                    f"用户问题：{question}\n\n"
                    f"路由判断：{route.reason}\n\n"
                    f"外部搜索补充：\n{self._format_web(web_result)}\n\n"
                    "请回答，并说明本地知识库没有找到相关证据。"
                ),
            }
        )
        try:
            response = self.llm_service.chat(messages)
            return response.choices[0].message.content
        except Exception as exc:
            return "\n".join(
                [
                    "本地知识库没有找到相关证据；外部搜索返回了补充内容，但 LLM 生成失败。",
                    f"错误：{exc}",
                    self._format_web(web_result),
                ]
            )

    def _compose_no_evidence(
        self,
        question: str,
        route: RouteDecision,
        web_result: WebSearchResult | None,
    ) -> str:
        parts = ["我没有在本地知识库里找到足够相关的记录。"]
        if route.needs_web:
            parts.append("这个问题可能依赖实时或外部信息。")
        if web_result and web_result.message:
            parts.append(web_result.message)
        parts.append("可以换一个更具体的关键词，或明确要求启用外部搜索。")
        return "\n".join(parts)

    def _compose_fallback(self, local_result: LocalSearchResult, exc: Exception) -> str:
        lines = [
            "LLM 生成暂时失败，先返回本地检索到的证据摘要。",
            f"错误：{exc}",
            "",
        ]
        for source_index, item in enumerate(local_result.evidence, start=1):
            first_lines = item.excerpt.splitlines()[:6]
            lines.append(f"- [{source_index}] {item.path}:{item.start_line}-{item.end_line}")
            lines.extend(f"  {line}" for line in first_lines)
        return self._append_references("\n".join(lines), local_result)

    def _append_references(self, content: str, local_result: LocalSearchResult) -> str:
        if not local_result.evidence:
            return content

        answer = self._strip_generated_references(content).rstrip()
        references = self._format_reference_section(local_result)
        return "\n\n".join([answer, references]) if answer else references

    def _strip_generated_references(self, content: str) -> str:
        for marker in ("\n## 引用", "\n### 引用", "\n## 参考", "\n### 参考"):
            if content.startswith(marker.lstrip()):
                return ""
            index = content.find(marker)
            if index != -1:
                return content[:index]
        return content

    def _format_reference_section(self, local_result: LocalSearchResult) -> str:
        blocks = ["## 引用"]
        for index, item in enumerate(local_result.evidence, start=1):
            blocks.append(self._format_reference_item(index, item))
        return "\n\n".join(blocks)

    def _format_reference_item(self, index: int, item: Evidence) -> str:
        query = item.query.replace("\n", " ").strip()
        header = f"[{index}] {item.path}:{item.start_line}-{item.end_line} · score={item.score:.2f}"
        if query:
            header = f"{header} · query={query}"

        excerpt_lines = [f"> {line}" for line in item.excerpt.splitlines()]
        return "\n".join([header, *excerpt_lines])

    def _normalize_history(self, history: list[dict]) -> list[dict]:
        normalized: list[dict] = []
        for message in history:
            role = message.get("role")
            content = message.get("content")
            if not content:
                continue
            if role == "ai":
                role = "assistant"
            if role not in {"user", "assistant", "system"}:
                continue
            if role == "assistant":
                content = self._strip_generated_references(content).strip()
                if not content:
                    continue
            normalized.append({"role": role, "content": content})
        return normalized
