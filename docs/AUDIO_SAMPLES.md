# 真实手碟采样接入

默认乐器使用内置物理建模音色。`SampleManager` 已支持真实采样优先、程序合成回退，因此可在不改演奏层的情况下逐步替换为录音。

## 推荐录音规格

- 48 kHz / 24-bit WAV，单声道或立体声。
- 每个音区至少 `soft`、`medium`、`hard` 三个力度层。
- 每层推荐 3–5 个 Round Robin。
- 每个文件保留完整自然衰减，不做响度最大化。
- 峰值建议约 -6 dBFS，去除环境底噪但不要破坏金属尾音。
- 额外技巧可使用 `edge`、`slap`、`muted`、`rim`、`glide`。

## 命名规范

```text
public/audio/
  d-kurd/
    D3/
      tone_soft_rr1.wav
      tone_soft_rr2.wav
      tone_medium_rr1.wav
      tone_hard_rr1.wav
      edge_medium_rr1.wav
      slap_hard_rr1.wav
```

统一格式：

```text
{scaleId}/{noteId}/{technique}_{layer}_rr{roundRobin}.wav
```

其中：

- `scaleId` 与 `config/scales.ts` 中的音阶 ID 一致。
- `noteId` 使用配置生成的 ID，例如 `D3`、`Bf3`、`Fs4`。
- `technique` 为 `tone | edge | slap | muted | rim | glide`。
- `layer` 为 `soft | medium | hard`。
- `roundRobin` 从 1 开始。

## Manifest

编辑 `public/audio/sample-manifest.json` 的 `variants`：

```json
{
  "scaleId": "d-kurd",
  "noteId": "D3",
  "technique": "tone",
  "layer": "medium",
  "roundRobin": 1,
  "url": "/audio/d-kurd/D3/tone_medium_rr1.wav"
}
```

启动时只读取很小的 manifest；切换音阶时才并行预加载和解码该音阶的采样。若某个力度、技巧或文件缺失，声音引擎会自动回退到物理模型，不会出现无声音区。

## 调音与动态

最好为每个实际音高录制原音，避免大幅变调。如果必须共享采样，建议把变调限制在 ±2 个半音，并在清单生成阶段记录基准频率。采样播放仍经过力度增益、位置声像、共鸣和空间总线；力度不只改变音量。

## 授权清单

每批真实采样应附带以下信息：

- 录音者和乐器所有者。
- 录制日期与原始工程存档位置。
- 商业使用、网页分发、浏览器缓存、剪辑和变调授权。
- 是否要求署名及准确署名文案。
- 授权凭证或合同版本。

不要使用来源不清、仅允许个人使用或禁止再分发的采样。
