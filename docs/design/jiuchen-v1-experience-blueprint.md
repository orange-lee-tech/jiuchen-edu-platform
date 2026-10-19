> **EXECUTION STATUS — GATE 0 COMPLETE / BOUNDED PHASE 1a RELEASED (2026-10-09)**
>
> The 2026-10-04 Phase 0 mapping is complete. Codex may implement the **bounded
> native four-slot navigation and safe role shell** under
> `docs/handoff/phase1-codex-execution-2026-10-09.md`.
> This replaces the outdated “Phase 0 mapping only” banner, **not** the original
> blueprint's security, truthful-data and no-business-rewrite constraints.
>
> Full lifecycle Home Phase 1b requires separately reviewed, authenticated,
> read-only `HomeExperienceSnapshot` contract. Until that contract is approved,
> no fabricated teacher updates, assessment success, credit count, deadlines,
> cases or progress statistics to make a page appear finished.
>
> Current implementation reality: `docs/handoff/CURRENT.md`. The 2026-10-04
> Phase 0 route map is historical; refresh affected routes against current HEAD.

# Jiuchen V1 Experience Blueprint

Status: **APPROVED PRODUCT / UX EXECUTION BLUEPRINT**

Approved direction: 2026-10-04  
Scope: WeChat Mini Program V1 experience architecture, interaction grammar and visual grammar  
Branch: `p1/foundation`

This document is the execution blueprint for product/UX work. It does not authorize changing business truth, production schema, AI provider, payment rules or deployment architecture.

Related sources:

- `CONSTITUTION.md`
- `docs/product/v1-baseline.md`
- `docs/product/canonical-growth-profile-projection.md`
- `docs/design/jiuchen-v1-design-system.md`
- `docs/testing/wechat-product-device-acceptance-2026-10-03.md`

---

## 1. First principle

Jiuchen is not a collection of feature pages.

It is a service system that should continuously answer four questions for a student:

1. **Where am I now?**
2. **What changed recently?**
3. **What should I do next?**
4. **Who / what is helping me?**

The UI exists to reduce uncertainty, reduce repeated input, increase control, and make useful progress visible.

Do not optimize for “more functions on one screen”.  
Do not optimize for “looks like an AI app”.  
Do not optimize for “more cards”.

Optimize for:

- clarity;
- speed;
- trust;
- control;
- visible progress;
- continuity across an undergraduate lifecycle.

---

## 2. Product mental model

The canonical user loop is:

```text
Profile / current facts
-> change events
-> assessment / teacher judgment
-> plan
-> action
-> new facts / new events
-> updated judgment
```

Compact form:

```text
state -> judgment -> action -> change -> new state
```

This loop is more important than the old page taxonomy.

### Three data layers

#### Layer A — Profile: “Who am I?”

Low-frequency or stable facts:

- university;
- major;
- grade / stage;
- identity;
- basic academic context.

#### Layer B — Trajectory: “What happened?”

Time-based growth events:

- course grades;
- weighted average / GPA;
- rank changes;
- CET / IELTS / TOEFL results;
- research milestones;
- publication status;
- competition outcomes;
- projects;
- internships;
- awards;
- teacher updates.

#### Layer C — Judgment: “What does it mean?”

Derived guidance:

- current positioning;
- strengths / gaps;
- target ranges;
- teacher guidance;
- stage plan;
- re-assessment recommendation.

UI should preserve the distinction between facts, changes and judgments.

---

## 3. Social / psychological product rules

### 3.1 Comparison gives context, not shame

BaoYan is a competitive environment. Social comparison is useful, but an anxiety leaderboard is not.

Prefer:

- similar cases;
- contextual differences;
- evidence;
- actionable gaps.

Avoid:

- fake precision;
- “you are worse than X%” marketing pressure;
- red danger styling for normal competitive gaps;
- aggressive countdowns unrelated to real deadlines.

Every comparison should answer: **what can the user do next?**

### 3.2 Support autonomy

AI and teacher guidance are recommendations, not invisible commands.

Users should know:

- why a recommendation appeared;
- what information it is based on;
- whether it is a fact, suggestion or uncertainty;
- when they can edit / confirm / reject data normalization.

### 3.3 Build competence through real progress

Show real changes:

- 14/96 -> 11/96;
- experiment -> writing;
- 86.9 -> 87.6;
- draft -> submitted.

Do not invent a synthetic “BaoYan completion 73%” unless there is a defensible business definition.

### 3.4 Make relatedness visible

For bound students, teacher service is part of the product, not hidden metadata.

Surface:

- who updated a plan;
- when it changed;
- what changed;
- the next action;
- recent guidance / follow-up.

The desired feeling is “someone is following my progress”, not “I bought access to a content library”.

### 3.5 Restore control

The home page should not tell a user everything Jiuchen can do.

It should tell them what matters **now**.

---

## 4. Stable shell, dynamic core

Personalization happens inside pages, especially Home.

Top-level navigation should remain stable inside one role so users can build spatial memory.

### 4.1 Ordinary user / student navigation

```text
Home | Plan | Opportunity | Mine
```

#### Home

Question answered:

> What matters now?

#### Plan

Question answered:

> Where am I going, and where am I in the plan?

This inherits the valid domain rules from the previous Classroom feature.

#### Opportunity

Question answered:

> What external opportunity or deadline is worth attention now?

Includes:

- school / program information;
- summer camp;
- pre-admission;
- policy;
- official-account content;
- teacher-recommended opportunities.

“News” is a source, not the product goal.

#### Mine

Question answered:

> What facts and assets belong to me?

Includes:

- profile;
- grades / rank;
- language;
- research / competition / project / internship;
- identity;
- assessment history;
- canonical growth profile;
- resume / application projection when enabled.

### 4.2 Teacher navigation

```text
Workbench | Students | Coaching | Mine
```

### 4.3 Admin navigation

```text
Workbench | Users | Business | Mine
```

### 4.4 Capabilities removed from permanent top-level navigation

#### AI Positioning / Assessment

Assessment is high-value but normally low-frequency.

Lifecycle:

```text
first profile
-> first assessment is prominent
-> assessment becomes “current positioning”
-> meaningful changes accumulate
-> system may recommend re-assessment
```

Do not keep “run AI assessment” as a permanent first-class destination after it has stopped being the user's next job.

#### Classroom

The valid business rules remain, but the user-facing mental model becomes **Plan**.

#### News

Content discovery becomes part of **Opportunity** rather than a standalone article feed.

---

## 5. Lifecycle home states

Home is not one fixed layout. It is a stable page whose primary module changes with user state.

### State 0 — First open, not logged in

Primary job: explain Jiuchen's value and start profile creation.

Above fold:

- one clear value proposition;
- three compact capabilities at most;
- primary CTA: **Start my BaoYan profile**.

Public opportunities can appear below without requiring login.

Do not show:

- fake student metrics;
- empty dashboards;
- AI feature grids;
- four equal-weight marketing cards.

### State 1 — Logged in, no first assessment

Primary job: obtain the minimum useful facts.

Above fold:

- “build your first BaoYan profile”;
- explicit missing key information;
- continue-profile CTA;
- first-assessment entry as the next step, not as a permanent tab.

Prefer:

> 3 key items remain

over:

> profile 57% complete

unless the percentage has a clear denominator and user value.

### State 2 — First assessment completed

Primary job: convert judgment into action.

Above fold:

- current positioning;
- strengths;
- primary gaps;
- next actions;
- full-analysis entry.

“Assess again” retreats.

### State 3 — Student bound + teacher assigned

Primary job: make continuous service visible.

Above fold:

- current stage;
- teacher update if new;
- 1–3 highest-value tasks;
- current factual status;
- current positioning validity.

Teacher updates can outrank generic AI recommendations.

### State 4 — Mature student after sustained use

Primary job: show **changes + tasks**.

Above fold:

- this week / now;
- meaningful recent changes;
- current stage plan;
- re-assessment recommendation only when justified.

This is the target steady-state experience.

### State 5 — Teacher

Primary job: show who needs attention.

Above fold:

- today's pending items;
- students requiring attention;
- high-frequency coaching actions.

### State 6 — Admin

Primary job: lightweight mobile operations.

Above fold:

- system / identity exceptions;
- pending role / relationship tasks;
- high-frequency, urgent, lightweight admin actions.

Complex bulk maintenance stays in the PC admin.

---

## 6. Home priority model

Do not build an opaque recommendation algorithm for V1.

Use deterministic tiers.

### P0 — Blocker / must-act

Examples:

- required identity binding;
- user-blocking error requiring action;
- real deadline today / tomorrow;
- administrator role conflict.

### P1 — High-impact human/service update

Examples:

- teacher updated plan;
- teacher requested correction;
- rank changed materially;
- high-credit course grade published;
- target opportunity near deadline.

### P2 — Current stage action

Examples:

- research milestone;
- language task;
- GPA/course task;
- competition / internship task.

### P3 — Current status / judgment

Examples:

- current positioning;
- trend summary;
- assessment still valid / reassessment recommended.

### P4 — Discovery / content

Examples:

- generic articles;
- product introduction;
- broad knowledge content.

Rules:

- Above the fold: normally no more than 1–3 actionable items.
- Do not create a chronological social feed.
- A new item does not automatically become important.
- Marketing content must not outrank active service tasks for an existing student.

---

## 7. Change-frequency-driven interaction

Not all student information deserves the same UI.

| Information | Change frequency | Preferred interaction |
| --- | --- | --- |
| University / major | very low | confirm once, edit in profile |
| Grade / academic stage | low but high impact | infer where possible + user confirm |
| Course grades | high/event-based | fast add/update, reuse imported course list |
| Weighted average / GPA | derived / recurrent | calculate when rule is known; otherwise store official value |
| Rank | medium / high impact | quick update + history |
| CET-4 / CET-6 | low | add an exam result; quiet when inactive |
| IELTS / TOEFL | low | exam-result event |
| Research | ongoing | structured project + milestones |
| Publication | state machine | writing -> submitted -> review -> accepted -> published |
| Competition | event-based | structured experience + result |
| Internship | period/state | structured experience + milestones |
| Target schools | medium / high impact | shortlist + change history |
| Teacher guidance | recurrent / high impact | new update surfaces in Home / Plan |
| Full AI assessment | low / high impact | first baseline + meaningful-change re-evaluation |

### Grade capture example

If schedule import has already created course records:

```text
Thermodynamics       [92]
Heat Transfer        [89]
Fluid Mechanics      [pending]
```

Do not ask the user to type course names again.

After save, show a truthful delta if it can be calculated:

```text
Weighted average 87.32 -> 87.48
```

If the school's GPA rule is unknown, do not invent a universal calculation rule.

---

## 8. Input grammar

This section is mandatory for feature lanes.

### Rule 1 — If we already know it, do not ask again

Reuse the canonical source of truth.

### Rule 2 — If it can be safely derived, do not make the user calculate it

Derived values must remain explainable.

### Rule 3 — If the option set is small, select instead of type

Examples:

- academic year;
- publication status;
- competition level.

### Rule 4 — If the option set is large, search instead of scroll

Examples:

- university;
- major;
- institution.

Support “custom / other” where the controlled vocabulary is incomplete.

### Rule 5 — If users naturally describe it in prose, allow prose and normalize it

Example raw research description:

> I worked on battery thermal management, mainly Fluent simulation; paper is being written and I am second author.

System may propose:

- project title;
- time;
- role;
- method/tool;
- responsibility;
- state;
- outcome;
- author order.

Then show:

```text
Parsed result -> user review -> confirm -> canonical fact
```

AI must not silently promote uncertain extraction to canonical truth.

### Rule 6 — Every machine uncertainty must have a human confirmation surface

### Rule 7 — Save incrementally

Long student profiles should not require completing one giant form before anything is retained.

---

## 9. Growth profile / projection integration

Do not create a second resume biography.

Use:

`docs/product/canonical-growth-profile-projection.md`

Experience surfaces should treat Canonical Growth Profile as a reusable asset.

Possible Mine entries:

- Full undergraduate record
- Resume projection
- Application form assistant

These outputs are projections of canonical facts, not separate facts.

---

## 10. Visual communication grammar

Target feeling:

> **clear, calm, capable**

Not:

- tutoring advertisement;
- childish campus app;
- generic blue rounded SaaS;
- purple-black AI demo;
- old gray enterprise software.

### 10.1 Shape — square-first V1

The first approved implementation direction is **square / restrained-corner**, not large rounded cards.

Default:

- structural section block: 0–8rpx radius;
- list row: 0rpx;
- standard button: 6–10rpx;
- input: 4–8rpx;
- modal / large overlay: may use 8–12rpx;
- status chip may use pill shape only when chip semantics are useful.

Avoid:

- 20rpx+ radius on every container;
- nested rounded cards;
- bubble-like visual language.

Shape should communicate grouping, not decoration.

### 10.2 Surface — not pure-white everywhere

Do not place every block on #FFFFFF.

Use a restrained two-level neutral / blue-gray surface system.

Recommended starting tokens:

```text
Canvas             #F2F4F6
Surface Primary    #FAFBFC
Surface Secondary  #EDF2F7
Surface Selected   #E7EEF8

Text Primary       #18202A
Text Secondary     #5F6B78
Text Muted         #89939E

Line Strong        #D8DEE6
Line Soft          #E5E9EE

Brand Action       #2F6FED
Brand Deep         #2459BE
Brand Soft         #E7EEF8
```

Ratio guideline (**starting balance, not an automatic pass/fail percentage**):

- roughly 70–80% neutral canvas / text / lines overall;
- roughly 15–25% secondary blue-gray or other approved **purposeful** tinted surfaces;
- strong brand / semantic color concentrated on focal actions and real states (often <10%, with screen-specific justified exceptions).

A “calm” interface is not an all-gray interface: visible brand-blue action and selected states, honest green/amber/red status cues and sparse human-guidance warmth should create intentional focal rhythm where needed. No gratuitous rainbow; no color-free card wall. Semantic content must remain legible without color. Refer to the updated `jiuchen-v1-design-system.md` §§6 and 9 for interaction-level tests.

### 10.3 Secondary tonal hierarchy

Use color value to show information hierarchy.

Example:

```text
page canvas
  -> primary content surface
    -> selected / current / actionable surface
```

Do not assign unrelated colors to GPA / English / research / competition just to make them visually different.

Category identity should normally come from:

- label;
- icon;
- section title;
- data type.

Color is reserved for hierarchy and state.

### 10.4 Human-guidance surface

Teacher / human-service updates may use one restrained warm-neutral secondary surface:

```text
Human Note Surface #F4F1EA
Human Note Text    #514B40
```

Use sparingly.

It distinguishes human guidance from system computation without turning the interface into a multi-color dashboard.

### 10.5 Semantic colors

Use semantic color only when the meaning exists.

Suggested direction:

- success / confirmed: muted green;
- warning / due soon / needs confirmation: muted amber;
- destructive / failed / overdue: muted red;
- informational / active / selected: brand blue.

Do not use red for normal competition pressure or user weakness.

Never use color as the only carrier of meaning; combine it with text / icon / direction.

### 10.6 Visual hierarchy

Priority order:

1. current task / decision;
2. real data / meaningful change;
3. section title;
4. supporting explanation;
5. container decoration.

Users should notice the **information** before the box around it.

**2026-10-09 human-first execution clarification:** the hierarchy should lead a novice from *recognition* to *decision* to *action* to *result*. Meaningful color and whitespace explain priority; neither an austere gray list nor oversized colorful buttons substitute for discoverable controls. In changed Phase 1a pages, demand a real-phone walkthrough: visible current state, one immediately comprehensible primary action, understandable Chinese labels, useful pressed/loading/success/error feedback, safe exit/back and no sideways overflow. The administrator ID screen's broken identifiers, large colliding buttons and raw English statuses are documented anti-patterns; its full restructuring belongs to Phase 4 rather than Phase 1a navigation.

### 10.7 Jiuchen memory element: growth trajectory

Preferred recurring visual language:

- point;
- line;
- milestone;
- direction;
- before -> after.

Examples:

```text
Year 1 ---- Year 2 ---- [Year 3] ---- Year 4
14/96 -> 11/96
experiment -> writing -> submission
CET6 526 -> target 560
```

Do not convert qualitative progress into fake precision.

---

## 11. Page contracts

Feature lanes may reorganize blocks as long as business rules remain intact.

### Home contract

Must answer within the first screen:

- who / what state am I in?
- what matters now?
- what is the next action?

### Plan contract

Must expose:

- current stage;
- current goals;
- current state;
- next action;
- teacher / guidance context where applicable;
- history / version without dominating current work.

Default view is **now**, not a historical semester list.

### Opportunity contract

Must prioritize:

- deadline;
- relevance to current target / stage;
- teacher recommendation if any;
- source.

Do not turn it into an undifferentiated article feed.

### Mine contract

Must represent durable user assets:

- canonical facts;
- growth trajectory;
- identity;
- history;
- outputs such as resume / application projection.

---

## 12. Role contracts

### Student

Primary experience:

```text
current tasks
+ growth changes
+ plan
+ opportunities
+ teacher continuity
```

### Teacher

Primary experience:

```text
pending work
+ students requiring attention
+ plan update
+ coaching record
```

The teacher home is not a student home with extra buttons.

### Admin

Primary mobile experience:

```text
exceptions
+ pending identity / relationship tasks
+ lightweight high-frequency operations
```

Bulk operations remain PC-first.

---

## 13. Loading / empty / error / disabled

States are part of the UI contract.

### Loading

- preserve page structure where possible;
- avoid full-page spinner if only one module is loading;
- do not let loading rearrange the entire page repeatedly.

### Empty

Explain whether it means:

- user has not created data;
- no current opportunity exists;
- feature is unavailable;
- backend returned a valid empty set.

Provide a useful next action only when one exists.

### Error

Use clear Chinese product language.

Do not expose raw backend codes to normal users.

Do not disguise a backend blocker as an empty state.

### Disabled

Explain why if the user is likely to expect the action to work.

---

## 14. Performance / perceived speed

Product quality includes responsiveness.

Rules:

- avoid fetching the same stable profile repeatedly per submodule;
- cache safe read-mostly reference data;
- load Home critical data before below-the-fold discovery content;
- render known local / cached state immediately, then reconcile;
- avoid decorative animation that competes with content;
- native WeChat capability remains preferred when appropriate.

Do not trade correctness for stale business state.

---

## 15. Migration strategy

Do **not** perform a full visual rewrite first.

### Phase 0 — Contract and route mapping

- freeze role navigation contracts;
- map old routes to new mental model;
- preserve deep links / existing functions;
- identify pages owned by active work packages.

### Phase 1 — Ordinary user / student shell

- Home / Plan / Opportunity / Mine navigation;
- lifecycle Home state controller;
- no business-rule rewrite.

### Phase 2 — High-frequency data updates

- grade / rank update flow;
- reuse imported course list;
- language exam events;
- growth-record structured edit / confirmation.

### Phase 3 — Plan experience

- “now” as default;
- teacher update visibility;
- stage plan + version history;
- current action emphasis.

### Phase 4 — Teacher / admin workbenches

- role-specific navigation;
- pending-work first;
- lightweight operations.

### Phase 5 — Visual consolidation

Apply approved square-first surface system and tonal hierarchy across stable pages.

### Phase 6 — Device QA

Test on Developer Tools and real devices:

- first open;
- logged-in no assessment;
- post-assessment;
- new student;
- mature student;
- teacher;
- admin.

Do not mark a lifecycle state PASS from static code inspection alone.

---

## 16. Cross-lane boundaries

This blueprint may change:

- layout;
- information hierarchy;
- route grouping;
- labels;
- visibility / prominence;
- input components;
- state presentation.

It must not silently change:

- Assessment model / prompt / provider;
- payment rules;
- credit ledger rules;
- production schema;
- teacher/student authorization;
- ECS / Nginx / deployment architecture;
- source-of-truth ownership.

If the new experience needs missing backend support, record the required contract and hand it to the owning lane.

Do not fake the behavior client-side.

---

## 17. Acceptance checklist

For every changed page or lifecycle state, answer:

1. Who is this user / role?
2. What changed or what is currently important?
3. Is the primary next action obvious within 5 seconds?
4. Are facts, system judgments and teacher guidance visually distinguishable?
5. Does the user have to enter something the system already knows?
6. Is AI being used to reduce work rather than add another destination?
7. Are empty / loading / error / disabled states honest?
8. Is the navigation stable for this role?
9. Does the page work without relying on color alone?
10. Did the change preserve business rules?
11. Was Developer Tools checked?
12. Was real-device behavior checked when device-sensitive?

---

## 18. Definition of done for an implementation batch

Return:

- baseline HEAD;
- final HEAD;
- commit SHA;
- lifecycle state(s) changed;
- page / route changes;
- backend contract dependencies;
- design rules applied;
- Developer Tools result;
- real-device result if available;
- screenshots / before-after;
- known blocked items;
- confirmation that unrelated work was preserved.

The goal is not to make every screen look the same.

The goal is to make the entire service feel like one coherent system that understands **where the user is, what changed, and what should happen next**.
