# Night-2 trial plan (waiting for user choice, 11:49)
Goal: the player finds the recipient by reading a clue, not by following the arrow.
- Clue on envelope (Codex, copy/): 小满「给数星星的那个孩子」, 阿汀「给折了快一百只船的人」, 米婆婆「给花都叫秋生的那家」.
- Roof marker, taller than roof, with a light point matching window colour: telescope (cold white), paper-boat string with small lamp, bamboo pole with flower lantern (warm orange). Models: sun in game.js. Light control: Ìtùtù in daynight.js.
- All markers equally bright. Delivered house marker dims. Hint level 1: recipient marker brightens. Hint level 2: arrow. (Ìtùtù; arrow trigger time in game.js, start 8 s idle, tune.)
- Keepsake carryover (àṣẹ, nightProgress.js): copy of night-1 keepsake at recipient door; one recipient reply replaced by keepsake line, line count unchanged.
- Dialogue pacing #40 two-level rule (sun, game.js).
- Test (Grok Bot, first-play): guards against the player wandering without a decision. Reproduce: new-player run of night 2 with real input, log position, subtitle times, hint level times. Pass: player reaches recipient before hint level 2 in most deliveries; #40 pass criteria hold.
- Open: two of the five houses have no clue or marker yet.
