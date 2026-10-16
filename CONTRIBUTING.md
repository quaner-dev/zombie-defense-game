# 贡献指南

[使用说明](docs/getting-started.md) · [架构](docs/architecture.md) · [开发指南](docs/development.md) · [已知问题](docs/release-checklist.md)

## 先确认授权状态

项目许可证尚未选择，贡献授权规则尚待维护者决定。公开发布前需明确项目许可证、第三方材料权利及贡献许可，不默认声称提交 PR 就授予某种许可证，也不要求未设立的 CLA/DCO。计划再分发或贡献较大改动时，先确认相应授权安排。

## 反馈问题

先查已知限制，区分设计目标、实际实现与设备未验证事项。仓库将来开放 Issues 时，可报告普通功能问题；尚未配置托管渠道时先本地记录复现，随代码评审材料提交，不虚构联系方式。

请提供：使用的源码版本或差异、Node/npm 或 Creator/设备版本、最小复现、预期与实际、必要的脱敏日志。战斗问题注明布阵还是战斗时间、关卡/配置、命令时间和单位 ID；渲染问题注明安全区/分辨率与暂停/后台状态。不要公开凭据或私人账号信息。漏洞遵循 [SECURITY](SECURITY.md)。

## 修改约定

- 一次改动聚焦一个问题，说明行为变化及证据；保留已有工作，不把无关配置或生成物混入。
- 战斗逻辑改 src/core/config，不在视图扣血、决定命中或复制第二套核心。拖拽保留按下时捕获的 ID 与核心存活校验。
- 修改源或配置后 sync:core；不提交生成的 core.js/core.d.ts、dist、node_modules、Creator 缓存或本地凭据。场景、脚本及已维护的 .meta 应一起保留资产身份。
- 配置/数值变更注明原值、新值、原因、放置与固定后撤的测量，不为追求绿色测试放宽验收目标。
- 文档描述实际完成范围；保留历史设计，通过说明或链接指出被替代内容，不伪造设备、构建或授权证据。

## 验证与评审材料

先按开发指南 `npm ci`、同步，运行与变更匹配的定向测试。功能/核心/适配层修改提交评审前通常还需：

```sh
npm test
npm run test:acceptance
npm run typecheck
npm run typecheck:cocos
npm run check:cocos-bundle
git diff --check
```

需要新测量时用 `npm run acceptance:report -- --output dist/reports/mvp-test-report.json`，有意更新已保存报告则说明差异。纯文档修改可以仅做相关链接、围栏 JSON、命令名称和差异检查，明确未重跑完整测试；不要将历史 99/99 写成当次结果。

评审说明应包含问题、具体改变、实际执行的检查和输出、未验证项目。涉及场景/视觉/输入需说明是否真正通过 Creator 3.8.8 和设备验证，cc 替身或浏览器 bundle 不能替代。无设备时明确留下待验证项。
