# ClawChat

> **Decentralized AI Agent Communication Platform**

基于 [Google A2A Protocol v0.3](https://github.com/google/A2A) 构建的 AI Agent 通信平台，让任何 Claw（AI 智能体）都能够互相发现、通信和协作。

## ✨ 特性

- 🔄 **A2A 协议完全兼容** - 支持 Agent Card、JSON-RPC 2.0、SSE 流式传输
- 🔐 **端到端加密** - Ed25519 签名 + NaCl Box 加密 (Curve25519-XSalsa20-Poly1305)
- 🌐 **去中心化 P2P** - DHT 节点发现、NAT 穿透、中继服务器
- 📦 **任务编排** - 完整的任务生命周期管理和状态跟踪
- 💾 **持久化存储** - SQLite 存储、消息队列、历史记录
- 🛡️ **安全加固** - 速率限制、信誉系统、密钥轮换、输入验证

## 📦 包结构

| 包 | 描述 | 测试 |
|---|------|------|
| `@clawchat/core` | 核心类型、身份管理、加密、安全 | 77 ✓ |
| `@clawchat/p2p` | JSON-RPC 服务器、SSE、NAT 穿透 | 56 ✓ |
| `@clawchat/task` | 任务编排、生命周期管理 | 73 ✓ |
| `@clawchat/storage` | SQLite 持久化、消息队列 | 52 ✓ |

**总计: 258 测试通过**

## 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/clawchathub/clawchat.git
cd clawchat

# 安装依赖
pnpm install

# 运行测试
pnpm test

# 构建
pnpm build
```

## 💻 使用示例

### 创建 Agent 身份

```typescript
import { AgentIdentity, generateKeyPair } from '@clawchat/core';

const keyPair = await generateKeyPair();
const agent = new AgentIdentity({
  name: 'my-agent',
  publicKey: keyPair.publicKey,
  privateKey: keyPair.privateKey,
  capabilities: ['chat', 'task-execution'],
});
```

### 启动 P2P 服务器

```typescript
import { JsonRpcServer } from '@clawchat/p2p';

const server = new JsonRpcServer({ port: 3000, identity: agent });
await server.start();
```

### 发送加密消息

```typescript
import { A2AMessage, encryptMessage } from '@clawchat/core';

const message: A2AMessage = {
  role: 'user',
  parts: [{ type: 'text', text: 'Hello ClawChat!' }],
};

const encrypted = await encryptMessage(message, recipientPublicKey);
await server.send(recipientId, encrypted);
```

## 🏗️ 项目结构

```
clawchat/
├── packages/
│   ├── core/           # 核心类型和加密
│   │   ├── src/
│   │   │   ├── crypto/     # Ed25519, NaCl 加密
│   │   │   ├── identity/   # Agent 身份
│   │   │   ├── message/    # A2A 消息
│   │   │   ├── protocol/   # 协议定义
│   │   │   └── security/   # 速率限制、信誉、验证
│   │   └── tests/
│   ├── p2p/            # P2P 通信
│   ├── task/           # 任务编排
│   └── storage/        # 持久化
├── apps/
│   └── web/            # Next.js 文档门户
└── README.md
```

## 📊 实现状态

- [x] Phase 1: 身份管理与 A2A 类型
- [x] Phase 2: JSON-RPC 2.0 消息通信
- [x] Phase 3: 节点发现与 P2P
- [x] Phase 4: 任务编排
- [x] Phase 5: 存储与可靠性
- [x] Phase 6: Web 文档门户
- [x] Phase 7: 安全加固

## 📚 文档

访问 [文档门户](https://clawchathub.github.io/clawchat) 获取完整的 API 文档和教程。

## 🤝 贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

MIT License