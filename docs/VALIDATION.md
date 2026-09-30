# 验证与性能说明

## 自动验证

`npm run test` 执行：

1. 音阶结构、音高与键位映射测试。
2. 中央 Ding、外围音、音区边缘、碟身 Slap、外圈 Rim 和越界命中测试。
3. 响应式坐标归一化测试。
4. 压力、面积、速度、位置和灵敏度组成的力度曲线测试。
5. 12 个同时 pointer 状态测试。
6. Round Robin 循环测试。
7. 事件录音相对时间和快照隔离测试。
8. 生产构建及服务端渲染元数据测试。

## 浏览器检查

已在桌面 Chrome 的实际页面中完成：

- 首次声音启用和 AudioContext 恢复。
- 中央与外围音区击打。
- 录制 3 个演奏事件并按时间轴回放。
- 节拍器启动、拍点推进和停止。
- 演奏帮助、音阶与设置面板可见性。
- 页面无应用自身的 console error / warning。

云端浏览器无法模拟真实十指接触、iOS 静音开关或设备振动；这些能力由 Pointer Events、`touch-action: none`、独立 pointer registry 和 feature detection 实现，并由纯逻辑测试覆盖。正式公开推广前仍建议在一台 iPad/iPhone 和一台 Android 平板上完成听感与触控真机验收。

## 性能策略

- 高频输入不写入 React 状态。
- 音频先触发，视觉反馈随后执行。
- 噪声缓冲和卷积脉冲只创建一次。
- 声部自然重叠，上限为 44，超限时短渐隐最早声部。
- `eco` 模式最多使用 4 个泛音声部；低核心数设备的 `auto` 模式最多 5 个。
- 所有波纹和音区反馈使用合成友好的 transform / opacity / filter。
- `prefers-reduced-motion` 会关闭非必要动画。
- 页面失焦、隐藏、pointer cancel 和 capture 丢失时清理输入状态。
