from collections import Counter
from pathlib import Path

from src.ai.local_tools import KnowledgeBaseTools
from src.ai.query_router import QueryRouter
from src.ai.types import Evidence, GrepHit, LocalSearchResult, RouteDecision


class LocalSearchAgent:
    def __init__(
        self,
        tools: KnowledgeBaseTools | None = None,
        *,
        max_queries: int = 6,
        max_evidence: int = 8,
        read_context_lines: int = 8,
    ):
        self.tools = tools or KnowledgeBaseTools()
        self.router = QueryRouter()
        self.max_queries = max_queries
        self.max_evidence = max_evidence
        self.read_context_lines = read_context_lines

    def search(self, question: str, route: RouteDecision | None = None) -> LocalSearchResult:
        route = route or self.router.route(question)
        queries = self._build_queries(question, route)
        paths = route.path_hints or [None]
        searched_paths = [path for path in paths if path]

        evidence: list[Evidence] = []
        truncated = False
        seen_sources: set[str] = set()

        for query in queries:
            if len(evidence) >= self.max_evidence:
                break
            for path in paths:
                if len(evidence) >= self.max_evidence:
                    break
                result = self.tools.grep_content(query, path=path, context=3, mode="content")
                truncated = truncated or result.truncated
                for hit in result.hits:
                    if len(evidence) >= self.max_evidence:
                        break
                    item = self._hit_to_evidence(hit, query)
                    if item.source_id in seen_sources:
                        continue
                    evidence.append(item)
                    seen_sources.add(item.source_id)

        if not evidence and route.path_hints:
            evidence.extend(self._fallback_read_scoped_files(route.path_hints))

        evidence.sort(key=lambda item: item.score, reverse=True)
        evidence = evidence[: self.max_evidence]
        message = None
        if not evidence:
            message = "本地知识库未检索到足够相关的 Markdown 证据。"
        elif truncated:
            message = "部分搜索结果被截断，回答时应提示可能遗漏。"

        return LocalSearchResult(
            question=question,
            evidence=evidence,
            searched_queries=queries,
            searched_paths=searched_paths,
            truncated=truncated,
            message=message,
        )

    def _build_queries(self, question: str, route: RouteDecision) -> list[str]:
        candidates = [*route.query_hints]
        compact = self.router._strip_question_words(question)
        if compact:
            candidates.append(compact)

        for token in ("DeepMemo", "DeepCare", "LLM", "Agent", "RAG", "MCP", "AI"):
            if token.lower() in question.lower():
                candidates.append(token)

        if not candidates:
            candidates.append(question.strip())

        scored = Counter(candidates)
        ordered = sorted(scored, key=lambda item: (-scored[item], -len(item), item))
        return self._dedupe(ordered)[: self.max_queries]

    def _hit_to_evidence(self, hit: GrepHit, query: str) -> Evidence:
        start = max(1, hit.line_number - self.read_context_lines)
        end = hit.line_number + self.read_context_lines
        read_result = self.tools.read_lines(hit.path, start, end)
        excerpt = "\n".join(f"{line.line_number}: {line.text}" for line in read_result.lines)
        score = self._score_hit(hit, query)
        actual_start = read_result.lines[0].line_number if read_result.lines else read_result.start
        actual_end = read_result.lines[-1].line_number if read_result.lines else read_result.end
        return Evidence(
            path=hit.path,
            start_line=actual_start,
            end_line=actual_end,
            excerpt=excerpt,
            score=score,
            query=query,
        )

    def _fallback_read_scoped_files(self, path_hints: list[str]) -> list[Evidence]:
        evidence: list[Evidence] = []
        for path in path_hints:
            files = sorted(self.tools.glob_files(path).files, key=self._fallback_sort_key)
            for file_path in files[-3:]:
                if len(evidence) >= min(3, self.max_evidence):
                    return evidence
                read_result = self.tools.read_lines(file_path, 1, 40)
                excerpt = "\n".join(f"{line.line_number}: {line.text}" for line in read_result.lines)
                actual_start = read_result.lines[0].line_number if read_result.lines else read_result.start
                actual_end = read_result.lines[-1].line_number if read_result.lines else read_result.end
                evidence.append(
                    Evidence(
                        path=file_path,
                        start_line=actual_start,
                        end_line=actual_end,
                        excerpt=excerpt,
                        score=0.25,
                        query="scope_fallback",
                    )
                )
        return evidence

    def _fallback_sort_key(self, file_path: str) -> tuple[int, int | str]:
        stem = Path(file_path).stem
        if stem.isdigit():
            return (1, int(stem))
        return (0, file_path)

    def _score_hit(self, hit: GrepHit, query: str) -> float:
        haystack = "\n".join(
            [line.text for line in hit.context_before]
            + [hit.text]
            + [line.text for line in hit.context_after]
        ).lower()
        query_lower = query.lower()
        if query_lower in hit.text.lower():
            return 0.9
        if query_lower in haystack:
            return 0.7
        if any(part and part in haystack for part in query_lower.split()):
            return 0.55
        return 0.35

    def _dedupe(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            normalized = value.strip()
            if normalized and normalized not in seen:
                result.append(normalized)
                seen.add(normalized)
        return result
