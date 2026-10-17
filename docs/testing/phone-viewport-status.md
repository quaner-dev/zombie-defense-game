# 手机视口与屏幕外出生验证

## 本次修正

- 删除 MapView 出生点紫色圆标记。
- config/map.json 三个出生区域 y=-40，独立 spawn_bounds.top=-180；士兵活动边界不扩大。
- 屏幕外出生队列向上排列；绘制过滤地图外单位中心，避免其在顶部 HUD 预留区出现。
- BattleSceneController 应用 fitMap 的位置/缩放，统一绘制、触摸反算与 HUD 坐标；正交相机使用半高 1200、Canvas 局部中心。
- 393×852 为验收视口，不替换 1080×2400 内部逻辑坐标。当前等比适配并预留 HUD，不拉伸铺满。

## 已执行

- 核心测试：87/87 通过；npm run typecheck 通过。
- 手机映射/屏幕外隐藏集成测试：4/4 通过。
- npm run sync:core、npm run typecheck:cocos、git diff --check 通过。
- 集成测试使用受控 cc 边界，不等于 Creator/手机渲染验证。

复现：

```sh
npm ci
npm run sync:core
npm run typecheck
npm run typecheck:cocos
node --import tsx --test test/core/*.test.ts
node --import tsx --test test/adapter/phone-viewport.test.ts test/adapter/offscreen-units.test.ts
```

## 当前阻塞，不得标记整体完成

出生位置由 y=260 移到屏幕外后，旧战斗平衡及固定指挥脚本不再成立。未擅自调整伤害、速度或验收目标。

- 已执行验收测试 14/18 通过：挂机时长、剩余僵尸、固定指挥胜利及相关 CLI 断言失败。
- 本次配置实测挂机首次减员 33.55s、68.65s 失败、剩余17僵尸；旧固定指挥脚本77.5s失败、剩余14僵尸。
- 适配全量先前执行47/49通过：两个固定指挥胜利相关断言失败；后来新增的安全区专项用例已单独通过，不将两次执行相加当成全量结果。
- bundle检查的旧终局时间窗口不够，运行到该窗口仍为 running，检查未通过。
- 本轮未测覆盖率；测试通过数不代表全覆盖。
- Creator预览、393×852实机触控、微信构建和视觉尺寸仍需人工验收。

## Windows手测

拉取包含本次修复的提交后，在项目根目录执行 npm ci 和 npm run sync:core，再用 Creator 3.8.8 打开 assets/scenes/Battle.scene。
选择393×852预览：检查无出生标记、僵尸从战场顶部边界进入、兵群拖动与画面一致、暂停按钮可点击。若仍异常，保存 layout 日志与完整预览截图。当前尚未提交/推送，不能直接通过远程拉取得到这些变更。
