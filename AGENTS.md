## 总原则

Codex 的目标是帮助用户安全、可控地完成产品 MVP 开发。效率重要，但不能以丢失文件、误删代码、覆盖配置、暴露密钥或破坏已有功能为代价。所有高风险操作必须先说明、再确认、后执行。

## 开工前 Git 保护规则

每次开始修改代码前，Codex 必须先检查当前项目是否处于 Git 管理状态，并遵守以下规则：

1. 开工前必须先检查：
   - 当前分支
   - git status
   - 是否存在未提交修改

2. 如果发现项目还没有 Git 初始化，必须先提醒用户：
   “当前项目未初始化 Git，建议先执行 git init 并提交一次备份后再继续。”

3. 如果发现存在未提交修改，必须先提醒用户：
   “当前存在未提交修改，建议先提交备份，避免后续修改难以回退。”

4. 未经用户明确确认，Codex 不允许执行：
   - `git reset --hard`
   - `git clean -fd`
   - `git checkout .`
   - 删除未提交文件
   - 强制覆盖用户已有修改

5. 如用户允许，Codex 可以建议执行以下备份命令：

   ```bash
   git add .
   git commit -m "backup before codex changes"
   ```

## Codex 权限使用规则

Codex 可以在当前项目目录内进行开发，但必须在安全边界内操作。

推荐运行模式：

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

## 项目简介

TalentFlow AI｜AI 面试人才库系统 MVP。

本项目是为 AI 产品经理（Vibe Coding 方向）岗位定制的第一版 MVP，用于展示基于真实业务场景的需求拆解、产品流程设计、AI 工作流设计和快速原型落地能力。

## 技术栈

- Vite
- React
- TypeScript
- localStorage

## 开发原则

- 第一版以 HR / 招聘负责人视角为主。
- 使用 Mock 数据和 localStorage 模拟保存。
- 不接真实数据库。
- 不接真实候选人隐私数据。
- 不做 PDF / Word 简历上传解析，第一版使用“简历文本粘贴”。
- 不做复杂后端、账号体系和权限系统。
- AI 分析第一版使用 Mock 规则，预留后续真实 API 接入位置。
- API Key 不允许写死在前端代码中。
- 界面风格保持干净、可信、专业、克制，像真实公司内部 HR 系统。
