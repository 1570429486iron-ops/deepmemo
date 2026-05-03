# ai问答case

claude code和cursor如何在本地知识库里面检索的
DeepMemo · 05/03 12:25
在本地知识库中，Claude Code 和 Cursor 的检索主要依赖于以下几个方面：
1. **Claude Code 的角色**：Claude Code 负责读取知识库、调用脚本、生成和修改 Markdown 文档。它与本地 Skills 结合，形成一个稳定的知识维护流程，支持知识的检索和推理 [证据 1:51]。
2. **数据存储结构**：知识库采用 SQLite 和 Markdown 的双层结构。SQLite 用于保存可查询和可审计的结构化事实，而 Markdown 则用于保存人类可读的 Wiki 页面。这种结构既支持 Agent 的检索推理，也保持了个人 Wiki 的可读性 [证据 1:53]。
3. **技能管理**：知识库中包含一个技能管理器（skills-manager），用于分析数据并决定是否触发审计或优化。这确保了知识的更新和维护是自动化的 [证据 8:123]。
4. **多平台支持**：Claude Code 通过自动注入机制与其他平台（如 Codex）进行集成，确保知识的共享和同步 [证据 6:106]。
综上所述，Claude Code 和 Cursor 在本地知识库中的检索依赖于结构化的数据存储、技能管理和自动化的知识维护流程。