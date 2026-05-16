import { KnowledgeBase, Message, SourceDocument, ChatSession } from '../types';

export const mockKnowledgeBases: KnowledgeBase[] = [
  {
    id: 'kb-1',
    name: '产品文档库',
    docCount: 156,
    updateTime: '2026-05-15',
    description: '公司产品相关技术文档'
  },
  {
    id: 'kb-2',
    name: '运维知识库',
    docCount: 89,
    updateTime: '2026-05-14',
    description: '运维部署、监控、故障处理文档'
  },
  {
    id: 'kb-3',
    name: '权限管理规范',
    docCount: 42,
    updateTime: '2026-05-10',
    description: '用户权限、角色、资源访问控制'
  }
];

export const mockSources: SourceDocument[] = [
  {
    id: 1,
    title: 'Kubernetes部署指南.pdf',
    type: 'pdf',
    snippet: '本文档详细介绍了如何在生产环境中部署 Kubernetes 集群，包括节点规划、网络配置、存储设置等关键步骤...',
    similarity: 'high',
    updateTime: '2026-05-12'
  },
  {
    id: 2,
    title: 'Docker容器化最佳实践.md',
    type: 'md',
    snippet: '容器化部署需要注意镜像大小优化、多阶段构建、安全扫描等重要实践，建议遵循以下原则...',
    similarity: 'medium',
    updateTime: '2026-05-08'
  },
  {
    id: 3,
    title: 'CI_CD流水线配置.doc',
    type: 'doc',
    snippet: '自动化部署流程包含代码拉取、单元测试、安全扫描、镜像构建、部署确认等环节...',
    similarity: 'low',
    updateTime: '2026-04-28'
  }
];

export const mockResponses: Record<string, { answer: string; sources: SourceDocument[] }> = {
  deployment: {
    answer: `根据知识库文档，推荐的部署流程如下：

**1. 环境准备**
- 确保服务器满足最低配置要求（CPU 4核+ / 内存 8GB+）
- 安装 Docker 20.10+ 和 Kubernetes 1.24+

**2. 镜像构建**
\`\`\`bash
docker build -t your-image:tag .
docker push registry.example.com/your-image:tag
\`\`\`

**3. 部署配置**
部署清单应包含 [1] 资源限制、[2] 健康检查、[3] 滚动更新策略

**4. 验证流程**
部署完成后请检查 Pod 状态和日志输出，确保服务正常启动。`,
    sources: [mockSources[0], mockSources[1]]
  },
  permission: {
    answer: `关于权限管理，知识库中有以下规范：

**RBAC 模型**
系统采用基于角色的访问控制 (RBAC)，包含以下核心概念：
- 用户 (User)：系统操作者
- 角色 (Role)：权限集合
- 资源 (Resource)：受保护对象

**权限矩阵** [1]
| 操作 | 管理员 | 开发者 | 只读用户 |
|------|--------|--------|----------|
| 读取 | ✓ | ✓ | ✓ |
| 创建 | ✓ | ✓ | ✗ |
| 删除 | ✓ | ✗ | ✗ |

**最佳实践**
建议遵循最小权限原则，只授予完成任务所需的最小权限集。`,
    sources: [mockSources[2]]
  },
  default: {
    answer: `根据您的知识库检索结果，我找到了以下相关信息：

**核心要点**
- 知识库目前包含 ${mockKnowledgeBases.length} 个知识库，共 ${mockKnowledgeBases.reduce((sum, kb) => sum + kb.docCount, 0)}+ 篇文档
- 系统支持语义检索、关键词检索和混合检索三种模式

**常见操作**
1. 在左侧选择目标知识库
2. 输入您的问题，点击发送
3. 查看右侧引用的来源文档

**下一步建议**
如果您有具体的技术问题，建议描述得更详细一些，比如：
- 涉及的具体产品或服务
- 遇到的问题场景
- 期望的解决方案

这样我可以更准确地为您检索相关资料。`,
    sources: [mockSources[0]]
  }
};

export const exampleQuestions = [
  '如何进行应用部署？',
  '权限管理是如何工作的？',
  '系统支持哪些检索模式？'
];

export function generateMockSession(kbId: string): ChatSession {
  return {
    id: `session-${Date.now()}`,
    title: '新会话',
    knowledgeBaseId: kbId,
    messages: [],
    createTime: new Date()
  };
}