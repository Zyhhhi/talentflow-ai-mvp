# TalentFlow AI｜AI 面试人才库系统 MVP / 内部试用版

本项目是为 AI 产品经理（Vibe Coding 方向）岗位定制的招聘业务系统 MVP，用于展示基于真实业务场景的需求拆解、产品流程设计、AI 工作流设计和快速原型落地能力。

TalentFlow AI 面向 HR / 招聘负责人，围绕候选人录入、面试安排、AI 辅助分析、面试评价、结果跟进、报到/试用期记录和招聘数据分析形成闭环。

最新版本新增「招聘知识库 RAG MVP」模块，用于上传 JD、面试标准、招聘 FAQ 等招聘资料，并基于知识片段回答 HR 问题，展示引用来源、置信提示和无依据兜底，降低 AI 幻觉风险。

## 项目定位

当前版本已从纯前端 MVP 迭代为“公司内部试用版”方案：

- 不定位为商业化 SaaS。
- 默认支持本地试用模式，数据保存在当前浏览器。
- 配置 Supabase 后，可进入内部试用模式，支持登录和多人共享候选人数据。
- 真实 AI 调用通过 Cloudflare Worker 代理，避免 DeepSeek API Key 暴露在前端。
- 招聘知识库当前定位为 RAG MVP，不是企业级 RAG；检索方式为关键词 / 简单相似度检索，不是 Embedding 语义检索。

产品闭环：

```text
候选人录入 → 面试安排 → AI 优劣势分析 → 面试评价 → 结果跟进 → 报到/试用期记录 → 岗位与周/月度分析
```

## 已实现功能

- 候选人库：新增、编辑、删除、搜索、筛选、表格管理、详情查看、归档 / 取消归档
- 面试流程：记录面试时间、面试官、面试结果、报到时间、试用期状态和状态更新时间
- 简历导入：支持 txt / docx / pdf 在浏览器本地解析，doc 老格式提示转为 docx 或 pdf
- 简历信息抽取：从简历文本中提取姓名、手机号、邮箱、求职意向、技能关键词、教育背景和项目摘要
- JD 输入：支持岗位要求 / JD 文本录入，并参与 AI 匹配分析
- AI 分析：支持 Mock AI、默认 AI 服务代理和自定义 API Key 三种模式
- AI 更新控制：新增候选人可自动生成首次分析，编辑关键字段后只标记 AI 可能过期，由用户手动重新生成
- 数据看板：展示招聘流程漏斗、来源质量分析、岗位维度分析、周度 / 月度分析和归档人数
- 招聘知识库 RAG MVP：支持新增 / 上传 JD、面试标准、招聘 FAQ、岗位画像、试用期标准等文本资料，自动切分为知识片段，并基于片段回答 HR 问题
- RAG 回答边界：回答结果展示引用来源、命中片段、置信提示和无依据兜底；当知识库没有足够依据时明确提示，不编造制度、岗位要求或候选人结论
- 数据模式：localStorage 本地试用模式 + Supabase Auth / Database 内部试用模式
- 安全边界：默认 AI 服务不向前端暴露 DeepSeek API Key，自定义 API Key 仅保存在当前浏览器

## 当前边界

本项目仍是内部试用版，不是完整生产系统，当前不做：

- 商业化 SaaS、多租户、计费和复杂组织架构
- 生产级简历文件存储、病毒扫描、权限审计和隐私合规流程
- 完整面试官 / 管理者多角色协作工作流
- 生产级操作日志后台、通知中心和审批流程
- 在前端代码或 GitHub 仓库中写死任何真实 API Key
- 使用真实候选人隐私数据做公开演示
- 将招聘知识库包装成企业级 RAG、真实向量库或生产级知识管理系统

当前简历解析主要在浏览器本地完成，适合流程演示和内部小范围试用。正式生产版本建议由后端处理文件解析、文件存储、权限控制、审计日志和候选人隐私保护。

当前招聘知识库检索采用 localStorage 下的关键词 / 简单相似度检索，用于演示 RAG 产品流程和引用机制；正式版本建议接入后端存储、Embedding 模型、向量检索、权限控制和操作日志。

## 技术栈

- Vite
- React
- TypeScript
- localStorage
- Supabase Auth / Database
- Cloudflare Worker
- 关键词 / 简单相似度 RAG MVP
- mammoth
- pdfjs-dist

## 运行方式

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

构建生产版本：

```bash
npm run build
```

本地预览构建结果：

```bash
npm run preview
```

## Supabase 配置

未配置 Supabase 时，系统会自动进入本地试用模式。

如需进入内部试用模式，在项目根目录创建 `.env.local`：

```bash
VITE_SUPABASE_URL=你的 Supabase Project URL
VITE_SUPABASE_ANON_KEY=你的 Supabase publishable / anon key
```

数据库结构参考：

```text
supabase/schema.sql
```

注意：不要提交真实密钥，不要使用 service role key 放在前端。

## AI 服务配置

当前支持三种 AI 分析模式：

- Mock AI：本地规则模拟分析，适合无网络或无密钥演示
- 默认 AI 服务：前端请求 Cloudflare Worker 代理地址，由 Worker 读取环境变量调用 DeepSeek
- 自定义 API Key：仅用于本地演示，Key 保存在当前浏览器 localStorage

Cloudflare Worker 代理示例：

```text
cloudflare-worker/deepseek-proxy.js
```

Worker 环境变量：

```text
DEEPSEEK_API_KEY
```

生产环境建议统一通过后端或 Worker 代理调用 AI API，并补充权限控制、日志记录和数据脱敏。

## GitHub Pages 部署

项目构建脚本已使用相对路径 `vite build --base=./`，构建后的 `dist` 目录可部署到 GitHub Pages。

前端部署流程：

```bash
npm run build
```

然后将 `dist` 目录发布到 GitHub Pages。Cloudflare Worker 和 Supabase 需要单独配置。

## 后续扩展方向

- 接入 Supabase Storage，安全保存 PDF / DOCX 简历文件
- 完善 operation_logs 操作记录和后台审计查看
- 细化 admin / hr / interviewer 权限和 RLS 策略
- 支持面试官在线填写评价和管理者查看招聘进度
- 增加企业微信 / 飞书通知，推送面试提醒和评价催办
- 增加候选人隐私保护、数据脱敏和访问日志
- 增强 AI 结构化抽取、岗位匹配和批量招聘复盘能力
- 将招聘知识库升级为 Supabase pgvector / Embedding 语义检索，并补充权限控制、操作日志、版本管理和知识库与候选人评审的联动
