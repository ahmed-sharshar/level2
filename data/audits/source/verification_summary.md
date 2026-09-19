# Verification summary

56 episodes / 29 buildings / 672 image appearances / 656 unique source images.

Effective settings: step ≤3 m, match ≤0.75 m, visibility ≥100 pixels at 160×128 in ≥2 pre-crossing frames. All other reference rules retained.

## Results

| Check | Result |
|---|---|
| Effective numerical protocol | 56/56 pass; zero errors |
| Fresh source-mesh visibility renders | 656 unique images; all stored boundary counts reproduced |
| Independently recomputed adjacent overlap | 607 unique image pairs; all pass |
| Exported RGB and boundary masks | 672 RGB files and 672 masks independently checked |
| Offline browser playback | All 672 frame slots and all 56 videos tested |
| Assistant visual pass | 46 |
| Additional human review requested | 10 |

The final visual count consistently flags weak canonical outdoor-context evidence as well as questionable target-mask coverage. The original two review batches are preserved; primary adjudication of two courtyard episodes is recorded separately in verification/visual_adjudication.json. No numerical rule or canonical frame changed.

Numerical audit: see `verification/numerical_audit.json` and `verification_report.json` for freshly computed checks and any failures. Browser playback: see `browser_validation.json`.

Depth-registration diagnostic: 28 frame slots across 15 episodes have median mesh-vs-observed-depth residual >0.10 m. These warnings are exposed per manifest, not silently used as a new exclusion criterion; they can reflect sparse support, glazing or mesh/photo mismatch.

## Per-episode visual review

| Episode | Context | Verdict | Issues |
|---|---|---|---|
| [scene_001_1LXtFkjw3qL_O103](scene_001_1LXtFkjw3qL_O103/manifest.json) | outdoor | pass | The near-crossing indoor frames look back into the living room, so approach is not consistently forward-looking.; Glass is incompletely represented by the mesh; counts certify native object pixels, not glass material area. |
| [scene_002_1LXtFkjw3qL_O107](scene_002_1LXtFkjw3qL_O107/manifest.json) | outdoor | pass | Two >=100-pixel pre sightings are widely separated in the sequence.; Post views often look back at the room; do not interpret this as an extra crossing. |
| [scene_003_1LXtFkjw3qL_O265](scene_003_1LXtFkjw3qL_O265/manifest.json) | outdoor | pass | Exterior is a narrow partly sheltered entry vestibule, not an unobstructed landscape view.; Final post frame pitches upward; shelter remains an annotation attribute. |
| [scene_004_1LXtFkjw3qL_O162](scene_004_1LXtFkjw3qL_O162/manifest.json) | outdoor | pass | Pre frame 2 is upward-looking.; Mesh over glass is patchy; geometry is visually plausible but not pixel-perfect pane segmentation. |
| [scene_005_1pXnuDYAj8r_O746](scene_005_1pXnuDYAj8r_O746/manifest.json) | outdoor | pass | Several indoor frames revisit a capture with different headings.; Last exterior frame is upward-looking; outdoor here includes an open-air roofed porch. |
| [scene_006_2azQ1b91cZZ_O91](scene_006_2azQ1b91cZZ_O91/manifest.json) | outdoor | needs_human_review | Canonical exterior frames are mostly wall- or interior-facing, so the fixed 12-frame prompt alone weakly demonstrates outdoor openness.; Additional 18-view context is annotation-only evidence, not an extra model input.; Primary review: The physical outdoor courtyard is supported by supplementary original views, but all six canonical post-crossing images mainly show walls or interior lookbacks. Apply the same prompt-context-review flag used for similarly wall-facing episodes in the second review batch. |
| [scene_007_2azQ1b91cZZ_O165](scene_007_2azQ1b91cZZ_O165/manifest.json) | outdoor | needs_human_review | Canonical views strongly favor the covered wall and indoor lookback; outdoor plants appear only at an edge.; Context evidence used for audit must not be silently added to canonical L2 inputs.; Primary review: The canonical exterior sequence looks primarily toward the covered facade and enclosed dining room; a plant at an image edge does not strongly establish open-air context. The physical courtyard remains supported by supplementary views. Apply the same prompt-context-review flag consistently. |
| [scene_008_2azQ1b91cZZ_O677](scene_008_2azQ1b91cZZ_O677/manifest.json) | outdoor | pass | Frame 6 already looks outdoors although its camera is still indoor; context labels describe camera location. |
| [scene_009_5ZKStnWn8Zo_O88](scene_009_5ZKStnWn8Zo_O88/manifest.json) | outdoor | pass | Interior approach starts in the associated bathroom/bedroom suite; indoor side is not a single semantic room throughout. |
| [scene_010_5ZKStnWn8Zo_O548](scene_010_5ZKStnWn8Zo_O548/manifest.json) | outdoor | pass | Thin frame-heavy mesh sightings and strongly interior-facing post views limit clean pane-level labels.; Multiple glazed leaves belong to one wide assembly, not multiple episodes. |
| [scene_011_5ZKStnWn8Zo_O910](scene_011_5ZKStnWn8Zo_O910/manifest.json) | semi_outdoor | pass | Two pre frames pitch upward while looking at the same leaf.; Garage is enclosed semi-outdoor by protocol, not open-air. |
| [scene_012_5ZKStnWn8Zo_O180](scene_012_5ZKStnWn8Zo_O180/manifest.json) | outdoor | pass | Native target is edge/frame-heavy, not a clean isolated pane or moving-leaf mask.; First qualifying sighting equals exactly 100 pixels; the other is 168.; Material pinpoint and leaf-versus-frame assignment need annotation. |
| [scene_013_82sE5b5pLXE_O510](scene_013_82sE5b5pLXE_O510/manifest.json) | outdoor | pass | Several pre frames turn away from the exit before crossing.; Mesh glass coverage is patchy but no gross registration shift is apparent. |
| [scene_014_ARNzJeq3xxb_O310](scene_014_ARNzJeq3xxb_O310/manifest.json) | outdoor | pass | Two post frames look at the porch ceiling.; Pre sightings are thin and distant but recognizable in the sheet. |
| [scene_015_D7N2EKCX4Sj_O628](scene_015_D7N2EKCX4Sj_O628/manifest.json) | outdoor | pass | Native O628 spans a broad door/window assembly and its mask emphasizes trim; this is assembly-level sighting, not isolated pane GT.; Certificate reports threshold_point_unavailable; numerical transition certification is outside this visual review. |
| [scene_016_D7N2EKCX4Sj_O66](scene_016_D7N2EKCX4Sj_O66/manifest.json) | outdoor | pass | The designated leaf is not isolated in post views, but post visibility is not required by the selected rule. |
| [scene_017_D7N2EKCX4Sj_O9](scene_017_D7N2EKCX4Sj_O9/manifest.json) | outdoor | pass | Post views mostly turn toward adjacent wall and outdoor furnishings rather than maintain the leaf in view.; Some pane/mesh holes are expected from transparent surfaces and do not establish material labels. |
| [scene_018_EDJbREhghzL_O5](scene_018_EDJbREhghzL_O5/manifest.json) | outdoor | pass | Patio has a canopy; outdoor classification does not imply unsheltered exposure. |
| [scene_019_HxpKQynjfin_O103](scene_019_HxpKQynjfin_O103/manifest.json) | outdoor | pass | Native instance covers a broad slider/frame; mixed frame/glass material requires surface-specific annotation. |
| [scene_020_PX4nDJXEHrG_O121](scene_020_PX4nDJXEHrG_O121/manifest.json) | semi_outdoor | pass | Post frames 10-12 predominantly face a blank wall, reducing visual variety.; Garage is an enclosed context tagged semi-outdoor, not proof of outdoor temperature/ventilation. |
| [scene_021_PX4nDJXEHrG_O621](scene_021_PX4nDJXEHrG_O621/manifest.json) | outdoor | pass | Designated leaf leaves the field of view after crossing; the physical route and open court remain visible.; Opposite leaf and intervening frame belong to the same boundary assembly. |
| [scene_022_PX4nDJXEHrG_O995](scene_022_PX4nDJXEHrG_O995/manifest.json) | outdoor | pass | Specific target stack is off-camera post-crossing; views show another stack of the same continuous opening.; This is a boundary assembly, not an independent episode for each folded panel. |
| [scene_023_SN83YJsR3w2_O1134](scene_023_SN83YJsR3w2_O1134/manifest.json) | outdoor | needs_human_review | Physical context/crossing passes visual screening.; Broad native mesh surface may cover an aperture or mixed wall/door assembly; raw 100-pixel count cannot be treated as independently certified visible door surface.; Confirm designated object extent and material marker before using this episode for boundary-surface GT. |
| [scene_024_Uxmj2M2itWa_O12](scene_024_Uxmj2M2itWa_O12/manifest.json) | outdoor | pass | The neighboring kitchen opening is distinct; proximity alone must not merge the two boundaries.; Several exterior views emphasize reflective glazing; do not infer intrinsic material properties from reflections alone. |
| [scene_025_VFuaQ6m2Qom_O391](scene_025_VFuaQ6m2Qom_O391/manifest.json) | outdoor | needs_human_review | Physical context/crossing passes visual screening.; Native mesh surface may preserve a closed-plane representation across an open photographic doorway; broad mask is not literal RGB-visible leaf segmentation.; Validate target surface extent and door-state consistency before accepting the 100-pixel metric as surface-level visibility GT. |
| [scene_026_Vvot9Ly1tCj_O23](scene_026_Vvot9Ly1tCj_O23/manifest.json) | outdoor | pass | Patio is strongly roofed and appears dark at night; annotate shelter separately.; Native panel is mostly off-camera after crossing. |
| [scene_027_Vvot9Ly1tCj_O617](scene_027_Vvot9Ly1tCj_O617/manifest.json) | outdoor | pass | Two pre sightings are distant and partly edge-on.; Canonical post views emphasize indoor lookbacks; openness is more obvious in the other same-building audited route, not this fixed 12-frame sequence. |
| [scene_028_Vvot9Ly1tCj_O599](scene_028_Vvot9Ly1tCj_O599/manifest.json) | outdoor | pass | Thin mesh representation of glazing means material labeling still requires human surface annotation. |
| [scene_029_Vvot9Ly1tCj_O608](scene_029_Vvot9Ly1tCj_O608/manifest.json) | outdoor | pass | Edge-on sightings give limited surface information; frames 5–8 are dominated by a blank wall, so the walk is visually weak near the crossing. |
| [scene_030_VzqfbhrpDEA_O1301](scene_030_VzqfbhrpDEA_O1301/manifest.json) | outdoor | needs_human_review | Canonical postframes mostly look back inside or toward the facade; outdoor openness is substantially clearer in supplementary views than in the 12 model frames. Human review of prompt-context sufficiency is needed. |
| [scene_031_ac26ZMwG7aT_O449](scene_031_ac26ZMwG7aT_O449/manifest.json) | outdoor | pass | Qualifying sightings are relatively small and edge-on (146 and 200 pixels); the numerical bar does not establish a detailed material view. |
| [scene_032_b8cTxDM8gDG_O302](scene_032_b8cTxDM8gDG_O302/manifest.json) | outdoor | pass | Transparent glass includes reflected or transmitted background, so segmentation is not a material label. |
| [scene_033_cV4RVeZvu5T_O2](scene_033_cV4RVeZvu5T_O2/manifest.json) | outdoor | pass | One exterior frame looks down; roofed rock overhang should be annotated as shelter rather than confused with a fully enclosed room. |
| [scene_034_e9zR4mvMWw7_O142](scene_034_e9zR4mvMWw7_O142/manifest.json) | outdoor | pass | Some departure views face the house; annotate glazing separately from its transmitted background. |
| [scene_035_kEZ7cmS4wCh_O56](scene_035_kEZ7cmS4wCh_O56/manifest.json) | outdoor | pass | Saved certificate reports threshold_point_unavailable. The association threshold is distance to the native navigation segment, not a certified exact physical crossing point. |
| [scene_036_p5wJjkQkbXX_O113](scene_036_p5wJjkQkbXX_O113/manifest.json) | semi_outdoor | pass | Garage is protocol-defined semi_outdoor; images do not establish its conditioning or ventilation. |
| [scene_037_p5wJjkQkbXX_O570](scene_037_p5wJjkQkbXX_O570/manifest.json) | outdoor | pass | Multiple upward ceiling views and reused capture locations make the image sequence less like a forward-only walk. |
| [scene_038_p5wJjkQkbXX_O597](scene_038_p5wJjkQkbXX_O597/manifest.json) | outdoor | needs_human_review | All six canonical exterior frames look back toward the interior or facade; outdoor openness is not clearly established by the model-visible departure views alone. Human review of prompt-context sufficiency is needed. |
| [scene_039_pRbA3pwrgk9_O406](scene_039_pRbA3pwrgk9_O406/manifest.json) | outdoor | pass | Native object O406 is one component of assembly O404; neither native IDs nor physical leaves should be counted as extra episodes. |
| [scene_040_q9vSo1VnCiC_O234](scene_040_q9vSo1VnCiC_O234/manifest.json) | outdoor | pass | Target instance includes the broad door assembly, not a single homogeneous material surface. |
| [scene_041_qoiz87JEwZ2_O68](scene_041_qoiz87JEwZ2_O68/manifest.json) | outdoor | pass | The photographed door appears closed. This is an ordered sequence of navigation-connected captures, not evidence that the door was physically opened during a recorded traversal. Door-state/reachability annotation remains necessary. |
| [scene_042_r1Q1Z4BcV1o_O469](scene_042_r1Q1Z4BcV1o_O469/manifest.json) | outdoor | pass | Several upward views focus on the porch roof; this is not continuously forward-facing video. |
| [scene_043_rPc6DW4iMge_O220](scene_043_rPc6DW4iMge_O220/manifest.json) | outdoor | pass | A small stray target patch appears on the exterior wall in frame 12 (64 pixels, below the adopted sighting bar). Use the correct preframes for target annotation rather than assuming every rendered instance pixel is accurate. |
| [scene_044_rPc6DW4iMge_O242](scene_044_rPc6DW4iMge_O242/manifest.json) | outdoor | needs_human_review | Significant native-target contamination: exterior frames 9, 10 and 12 project O242 onto a plain wall away from the actual leaf; frame 9 has 2605 target pixels. Preframe 3 also gives a sliver from the adjoining lounge view. A human must certify the target surface/instance before pixel-level material or visibility GT is used. |
| [scene_045_rPc6DW4iMge_O85](scene_045_rPc6DW4iMge_O85/manifest.json) | outdoor | pass | Some first exterior images face indoors; camera context must not be confused with the class of every visible pixel. |
| [scene_046_sT4fr6TAbpF_O292](scene_046_sT4fr6TAbpF_O292/manifest.json) | outdoor | pass | Later exterior views are wall-heavy, and the crossing includes downward-looking frames. |
| [scene_047_sT4fr6TAbpF_O322](scene_047_sT4fr6TAbpF_O322/manifest.json) | outdoor | pass | Approach views spend substantial time on wardrobe doors or blinds; object name/material should be tied to the marked exit, not those nearby surfaces. |
| [scene_048_vyrNrziPKCB_O1054](scene_048_vyrNrziPKCB_O1054/manifest.json) | outdoor | needs_human_review | Canonical postframes mostly face the facade; direct outdoor evidence is much clearer in supplementary views. Human review of model-visible context sufficiency is needed, despite the physically confirmed open-air location. |
| [scene_049_vyrNrziPKCB_O1342](scene_049_vyrNrziPKCB_O1342/manifest.json) | outdoor | pass | Frame 9 is nearly all blank wall; same-courtyard opposite door must not be confused with the target assembly. |
| [scene_050_vyrNrziPKCB_O1335](scene_050_vyrNrziPKCB_O1335/manifest.json) | outdoor | pass | The other side of this courtyard has another valid but distinct portal; preserve assembly-level identity. |
| [scene_051_vyrNrziPKCB_O1357](scene_051_vyrNrziPKCB_O1357/manifest.json) | semi_outdoor | pass | Garage is enclosed but protocol-defined semi_outdoor; thermal state and ventilation cannot be inferred from the class alone. |
| [scene_052_vyrNrziPKCB_O20](scene_052_vyrNrziPKCB_O20/manifest.json) | outdoor | pass | Transparent glazing and frame comprise different materials; target native object is not homogeneous material GT. |
| [scene_053_vyrNrziPKCB_O87](scene_053_vyrNrziPKCB_O87/manifest.json) | outdoor | pass | One qualifying sighting is edge-on and one later frame looks down; retain these as original views, not simulated movement. |
| [scene_054_vyrNrziPKCB_O927](scene_054_vyrNrziPKCB_O927/manifest.json) | outdoor | needs_human_review | Canonical exterior frames primarily face the facade/interior, so the receiving context is weakly presented to the model despite being physically confirmed by supplemental views. Human review of prompt-context sufficiency is needed. |
| [scene_055_vyrNrziPKCB_O965](scene_055_vyrNrziPKCB_O965/manifest.json) | outdoor | needs_human_review | Significant target-mask contamination: O965 covers much of the unrelated exterior wall/window in postframes 8–9 (7209 and 2157 pixels), not just the actual exit leaf. Require target-surface certification before using masks for physics/material visibility GT. |
| [scene_056_wc2JMjhGNzB_O53](scene_056_wc2JMjhGNzB_O53/manifest.json) | outdoor | pass | Postframe mask traces are partial or projected through the glass/opening; use clear approach views for material annotation. |

## Interpretation

These are assistant-screened boundary candidates, not 100% certified physics ground truth. A needs_human_review flag is retained visibly rather than hidden or silently counted as fully certified. Material/reflectance, pane transparency, photographed door state, shelter and directional reachability still need the designated human annotation. No route has been resequenced to conceal failures.
