# Paper Echo palettes (original)
palette-day.png / palette-dusk.png / palette-night.png — 16x16 sRGB PNG, **1 texel = 1 slot**, identical layout in all three. Swap the file → swap the mood.
Magenta (#ff00ff) = unused/reserved (rows 6-15 and the ends of rows 0-5 are free for future slots).
Sampling: UV = ((col+0.5)/16, 1-(row+0.5)/16) with three.js default flipY, NearestFilter, no mipmaps, colorSpace = SRGBColorSpace.
Shadows are NOT stored: the shader derives them (HSV hue-0.02, value*0.5) per RENDER.md. Outline = slot `outline` (#373f42 in all moods).
Generator: make_palettes.py (edit hexes there, rerun). Enlarged swatches: palette-*-x32.png, palette-swatches.png. Slot map: slots.json.

| col,row | slot | group |
|---|---|---|
| 0,0 | grass | terrain/water |
| 1,0 | grass_light | terrain/water |
| 2,0 | grass_warm | terrain/water |
| 3,0 | path | terrain/water |
| 4,0 | dirt | terrain/water |
| 5,0 | rock | terrain/water |
| 6,0 | rock_dark | terrain/water |
| 7,0 | cliff | terrain/water |
| 8,0 | water | terrain/water |
| 9,0 | water_deep | terrain/water |
| 10,0 | foam | terrain/water |
| 0,1 | wall_cream | buildings |
| 1,1 | wall_peach | buildings |
| 2,1 | wall_white | buildings |
| 3,1 | roof_teal | buildings |
| 4,1 | roof_teal_dark | buildings |
| 5,1 | roof_red | buildings |
| 6,1 | roof_brown | buildings |
| 7,1 | door_wood | buildings |
| 8,1 | window_glass | buildings |
| 9,1 | window_frame | buildings |
| 10,1 | chimney | buildings |
| 11,1 | fence_wood | buildings |
| 0,2 | trunk | vegetation |
| 1,2 | leaf | vegetation |
| 2,2 | leaf_light | vegetation |
| 3,2 | leaf_dark | vegetation |
| 4,2 | flower_red | vegetation |
| 5,2 | flower_yellow | vegetation |
| 6,2 | flower_white | vegetation |
| 7,2 | bush | vegetation |
| 0,3 | raincoat | messenger character |
| 1,3 | scarf | messenger character |
| 2,3 | skin | messenger character |
| 3,3 | boots | messenger character |
| 4,3 | bag | messenger character |
| 5,3 | envelope | messenger character |
| 6,3 | hat | messenger character |
| 0,4 | window_light | emissive / light sources (unlit in shader) |
| 1,4 | lamp_glow | emissive / light sources (unlit in shader) |
| 2,4 | lamp_metal | emissive / light sources (unlit in shader) |
| 3,4 | warm_glow_soft | emissive / light sources (unlit in shader) |
| 4,4 | star | emissive / light sources (unlit in shader) |
| 0,5 | sky_top | environment (read on CPU: sky, fog, outline, lights) |
| 1,5 | sky_horizon | environment (read on CPU: sky, fog, outline, lights) |
| 2,5 | fog_near | environment (read on CPU: sky, fog, outline, lights) |
| 3,5 | fog_far | environment (read on CPU: sky, fog, outline, lights) |
| 4,5 | cloud | environment (read on CPU: sky, fog, outline, lights) |
| 5,5 | outline | environment (read on CPU: sky, fog, outline, lights) |
| 6,5 | hemi_sky | environment (read on CPU: sky, fog, outline, lights) |
| 7,5 | hemi_ground | environment (read on CPU: sky, fog, outline, lights) |
| 8,5 | sun_light | environment (read on CPU: sky, fog, outline, lights) |

Notes: `window_glass` is a lit (emissive) slot except in day, where it's shaded glass (test harness rule). At night `window_glass`, `window_light`, `lamp_glow`, `warm_glow_soft` are warm yellows/amber — these are the window-light slots. `sun_light`/`hemi_*` are light colours, not surface colours; intensity is still a code constant.
