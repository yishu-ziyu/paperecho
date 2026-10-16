# Messenger 渲染学习笔记（2026-10-16）
证据来源：静态读 recon/assets/App3D-DwM1eiaC.js（下面写的是字节偏移，用 `dd if=... bs=1 skip=偏移` 查看），加上运行时 WebGL hook（hook.py，日志在 gllog.json，截图 orig.png）。
标记说明：【已验证】= 代码里看得到，并且运行时也确认了；【代码】= 只在代码里看到；【推断】= 猜测。

## 0. 结论先说
Messenger 不开源（见 recon/SOURCES.md）。它的描边不是反向外壳（inverted hull），而是**后处理屏幕空间描边**：场景先用 MRT 渲染到 2 张纹理，再用一个全屏三角形一次完成“描边 + 3D LUT 调色”，然后输出。

## 1. G-buffer（MRT 两张图）【已验证】
- `addPostProcessing$1`（约 1203800）：`new MultipleRenderPass({rtCount:2, ...finalMaterials:[new outlines$1(r)]})`，textures[0] 叫 "color"，textures[1] 叫 "info"。
- 每个物体的材质最后写两个输出（约 1233900）：
```glsl
gl_FragColor = vec4(outgoingLight, surfaceId);        // rgb=颜色, a=表面ID
gInfo = vec4(1.0-(0.5*zw.x/zw.y+0.5), encodeNormalSpheremap(geometryNormal), outlineContribution);
```
- 运行时：抓到的 148 个 shader 里有 31 个带 `gInfo`，没有任何 BackSide 外壳 shader。
- 为什么这样写：一次场景渲染就同时拿到“颜色、ID、深度、法线、哪里允许画线”，描边全在屏幕空间做，所以线宽可以精确到像素，跟模型面数无关（对应案例里说的 pixel-precise）。

## 2. 描边算法 `outline()`（约 1196570）【已验证】
- 只采 5 个点：中心加上下左右，偏移 = `1/texSize * outlineWidth * scale`。
- 分别算三种差异：ID 差（不同物体/不同表面之间）、线性深度差（轮廓）、法线差（折痕）。每种都用两次 `fit()` 做阈值加软边（`uInfoRange`、`uDepthRange`、`uNormalRange`、`uSmoothMargin`）。
- 深度阈值会随法线变化：`depthLimit = depthRange.z + 1.0 - centerNormal.z`，斜着看的面不容易误出线。
- 取邻居里最近的那个点的 contribution（是否允许画线），这样物体前景的轮廓不会被背景的“禁画”区吞掉。
- 远处淡出：`uOutlineFade=(50,300)`，单位是视空间距离。
- 线宽随分辨率变：`resScale = min(1, resolution.y/1300) * uOutlineScale`。
- 线的颜色：`#373f42`（深灰蓝，不是纯黑）。
- 案例里提到的开源库 OmarShehata/webgl-outlines 用的是同一套思路（depth + normal + surfaceId）。Abeto 是自己写的版本，在它之上多了 contribution 遮罩、软阈值和距离淡出。【推断：受这个库启发】

## 3. “手绘感”到底从哪来（案例没说的部分）【代码】
**结论：没有屏幕空间的 UV 抖动或扰动。** outline pass 里直接用 vUv，抖动不在这一步。手绘感来自 3 处：
1. **噪声打断线条**：地形材质用世界空间的 triplanar 噪声，把 `outlineContribution` 设成 0，在线上挖出缺口（约 1232300）：
   `outlineContribution *= step(0.13, triplanarNoise.g * triplanarNoise.b);`
   角色/NPC 用 `sinenoise1(lPos*12.0 + seed*surfaceId)` 再 `step(0.3)`。噪声固定在物体/世界空间，所以缺口跟着物体走、不会闪。
2. **假表面 ID 生成额外的线**：岩石的“条纹” `striations` 用 sin 加噪声算出来，再加到 surfaceId 里；草地加 0.1，湿地加 0.12。ID 一变就出线，所以山上那些像手画的岩层线其实**没有几何**，全是 shader 编的 ID。
3. **软阈值**：fit 加 smoothMargin 让线的粗细和浓淡跟“差异大小”相关，看起来就像笔压有轻有重。
- 运行时截图（orig.png）里，房子、船上的线粗细不均、有断口，跟上面的分析一致。
- **颗粒/纸纹**：bundle 里搜 `grain` 是 0 次；final pass 只有“描边 + LUT”。这次没找到全屏颗粒。纸一样的质感来自 triplanar 噪声给颜色加的细节（`applyTerrainColor`）和天空云的纹理。【代码，置信度中等】

## 4. 着色（不是 toon ramp，是 HSV 二分色）【代码】
约 1229800：
```glsl
colorShadow = rgb2hsv(baseColor); colorShadow.r -= 0.02; colorShadow.b *= 0.5; // 色相略偏，明度减半
shadowCut = smoothstep(0.2, 0.4, directDiffuse.r * _dirShadow);  // 角色用 HARD_CUT_SHADOW 0.1~0.15
outgoingLight = mix(colorShadow, baseColor, shadowCut);
outgoingLight += smoothstep(0.01,0.011,directSpecular)*0.075*...; // 很硬的高光，朝上的面不加
outgoingLight += indirectDiffuse;                                   // 半球光补暗部
```
- 改写了 three 的 `lights_fragment_begin`（`getTweakedLightsFragment`），把阴影值另外存进 `_dirShadow`，阴影和背光共用同一道切线。
- 颜色来源：`texture2D(tColors, vUv)`，也就是 16×16 的调色板 atlas，UV 指到色块上（案例说法【已证实】，草地颜色固定是 `vec2(0.15,0.95)`）。
- 雾（约 1214000）：近/远两种颜色 `#93a2bf`、`#9ea7b8`，按指数平方计算。
- 眨眼和嘴型也在 shader 里做：UV.y>1 的区域是眼睛 sprite（3 个周期叠在一起，形成随机眨眼），UV.y<0 的区域是嘴，说话时用 hash 随机切换。

## 5. 后处理链【已验证】
- 运行时一帧大约 13 次 FBO 切换、20 多次 draw（日志 gllog.json）：阴影图 / 若干离屏小 pass（云、粒子之类）→ MRT 场景 → 最后 1 次 draw 到 FB 0（全屏三角形 "Big Triangle"），这一步完成 描边 + `apply3DLUTTetrahedral(lut.ktx2)`。
- LUT 用的是**四面体插值**（tetrahedral）的 3D LUT，比三线性插值更准；用 `uLUTIntensity` 控制混合程度。
- bundle 里打包了 pmndrs/postprocessing（KawaseBlur、Bloom 等类都在），但主链只用了自己的 MultipleRenderPass。Bloom 有没有开没有确认。【推断】

## 6. 工程优化【代码】
- BatchedMesh（41 处）、InstancedMesh（25 处）：运行时一帧只有约 20 多次 draw，证明大量合批。
- Draco（.drc）几何、KTX2 纹理（包括 lut.ktx2）、three-mesh-bvh 做碰撞。
- 全局 UBO（`global$1.UBO`）共享 time/resolution 等，减少 uniform 上传。
- 深度用 `vHighPrecisionZW` 自己写进 info，精度比较可控。
- 植被：案例说用 blob 转 foliage，代码里能看到 grass/foliage 的 shader，这次没有深挖。

## 7. 复刻（../repro）
- 我自己写的 three r180 代码：onBeforeCompile 改 Lambert → MRT 输出 → 5 点 ID/深度/法线描边 → 噪声挖断线条 → HSV 阴影二分色 → 雾 → 简单调色（代替 LUT，没有用 Abeto 的 lut）。
- 没有用任何 Abeto 资源。webgl-outlines 和 postprocessing 只是思路参考，没有引入依赖（最小 demo 不需要）。
