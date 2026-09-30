# RESONA Virtual Handpan

RESONA 是一个面向桌面、手机和平板的低延迟网页版手碟。它不是点击播放单个音频的页面，而是一件以 Web Audio API 构建的可演奏乐器：支持独立 `pointerId`、十指以上并发、快速滚奏、键盘、力度映射、空间共鸣、事件录音和精确时间轴回放。

## 快速开始

环境要求：Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

开发服务器启动后打开输出的本地地址。首次进入需点击“开启声音”，这是浏览器允许 Web Audio 发声所必需的用户手势。

```bash
npm run test
npm run build
```

构建产物位于 `dist/`，可直接挂到静态托管（GitHub Pages 基路径 `/handpan/`）。

## Demo

https://sepzok.github.io/handpan/

## 已实现能力

- Pointer Events 输入，按 `pointerId` 独立跟踪，支持 10 点以上同时触控。
- 鼠标、触控、触控笔及 Space / A–K 键盘映射。
- 快速重复击打、跨音区滑奏、Slap、Muted Tap、边缘音和长按制音。
- D Kurd、D Celtic、E Hijaz、A Integral 四套 9 音音阶。
- 轻、中、重力度层和 Round Robin 选择架构。
- 默认运行时物理建模音色：基音、细微弯音、非整数泛音、击打噪声、低频腔体、双卷积空间、压缩和 limiter。
- 随击打位置变化的左右声像、泛音亮度、共鸣量和尾音。
- 44 个自然重叠声部及渐隐 voice stealing。
- 事件级录音、Web Audio 时间轴预调度回放、JSON 导出。
- 40–200 BPM 精确节拍器。
- 全屏、触觉反馈、音名/键位显示、性能模式和本机设置保存。
- 横竖屏、安全区、低高度横屏和 reduced-motion 适配。

## 目录

```text
app/                         页面入口、全局视觉系统
components/                  演奏界面
config/scales.ts             独立音阶配置
lib/audio/                   音频、采样与声部管理
lib/input/                   命中、力度和多指输入
lib/performance/             录音、回放和节拍器
public/audio/                采样清单（默认为空）
docs/                        音频替换、验证与性能说明
tests/                       核心逻辑与部署渲染测试
```

## 架构原则

输入回调直接调用 `AudioEngine`，不经过 React 状态调度；击打动画使用 Web Animations API 和短生命周期 DOM 波纹，也不会触发整页重渲染。React 仅管理音阶、设置、录音状态和面板等低频 UI。

```text
Pointer / Keyboard
  → InputManager
  → HitDetector + velocity mapping
  → AudioEngine
      → sampled voice (when licensed samples exist)
      → physical model fallback
      → dry / body resonance / room buses
      → compressor → limiter → master
  → visual feedback
  → PerformanceRecorder
```

## 音频素材与授权

当前版本不包含第三方录音，也不会从外部站点下载音频。默认音色完全在用户设备上实时生成，因此没有额外的采样再分发授权问题。

真实录音的目录、命名、manifest 和替换步骤见 [docs/AUDIO_SAMPLES.md](docs/AUDIO_SAMPLES.md)。加入素材前必须确认拥有商业网页分发、缓存和衍生调音所需授权。

## 验证

自动测试覆盖音区命中、多触点状态、力度曲线、Round Robin、录音时间轴和音阶配置。浏览器验证范围与当前限制记录在 [docs/VALIDATION.md](docs/VALIDATION.md)。
