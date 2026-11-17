# AIEC Elevator OS — rebuilt

An offline-first work manager for lift (elevator) companies: one record per lift job, from the first site visit to handover and yearly service (AMC). It works in **मराठी, हिंदी and English**, on any phone, without internet, and installs as an app (PWA).

This is a from-scratch rebuild of the single-file app at `UNLIT-GPT-HTML/AIEC-Elevator-OS.html`. That app was one 1.8 MB HTML file with about 16,700 lines of script. The rebuild keeps its domain (stages, roles, quotation maths, payment plan, checklists, the 12 installation steps) and its native Hindi and Marathi wording. It replaces the code structure and the user journey.

## The journey

```
Lead ─▶ Sales ─▶ Deal ─▶ Site ─▶ Material ─▶ Install ─▶ Hand over ─▶ AMC
field   call     agree   prep    PO          permit ⚖️   licence ⚖️    visits
worker  needs    sign    QC      dispatch    safety      3 signatures  tickets
        quote    token   fixes   arrival     12 steps    lift code     licence renewal
                                             QC final
```

| Role | What they see first |
|---|---|
| Field worker | **Add site** (photos + GPS → contact → building) and how many of their sites Sales accepted |
| Sales | The next call, quotation or decision; "My jobs with others now" with names |
| Head Quarter / Admin | Key numbers, approvals, release, and **stuck work** (late work and who holds it) |
| Finance | Payments to check against the bank (never one they recorded themselves) |
| QC Inspector | Site and final inspections: pass/fail checks, measurements, photos |
| Supplier | Purchase orders: accept with a date, then dispatch with vehicle and photos |
| Technician | Today's safety check, then the next installation step |
| Customer | Their lift on a 7-step rail, what to sign or pay, chat, and reporting a breakdown |

## What changed in the experience

- **One next thing.** Every home screen starts with a single "Start now" card for the most urgent task. The rest follows in order: late, then due, then waiting.
- **Every task opens one focused flow.** It has one question per step, step dots, a sticky action bar, and errors shown inline. Long forms keep a draft as you type.
- **A "Done" screen that keeps work moving.** It says what happened and who is next (by name), and gives a one-tap button to *your* next task.
- **Nothing is hidden.** If you can't do something yet, the screen says why and who it is waiting for: for example "waiting for the customer's payment for the material".
- **Accessible and practical on site.** Touch targets are 52–60 px. There is a sunlight theme for gloves and bright sun, a dark theme and large text. Every screen can be read aloud (🔊) and long text can be dictated (🎤). The layout is a bottom nav on phones and a side rail on desktop. It supports keyboard focus and reduced motion, and passes an automated WCAG 2.1 AA audit (axe-core) on every main screen in all three themes.
- **Legal papers.** Following the Maharashtra Lifts Act, installation cannot start until the office records the erection permit, and the lift cannot be handed over without a valid lift licence. Both are business rules the Head Quarter can turn off. Licence renewal is asked for 60 days before it expires.
- **Work pay.** Technicians and QC inspectors see what their saved work earned, by week: each installation step, inspection and service visit counts. When a week ends, the office approves it and Finance marks it paid. Nobody can approve or pay their own work. Rates are fixed on the day of the work, so a later change to the rates never rewrites past pay.
- **Supplier bills.** The supplier sends a bill with a photo. The office approves it, with any deduction for damaged or missing material, or sends it back. Finance can pay it only after the customer's material payment is confirmed in the bank.
- **Bank statement matching.** Finance pastes statement lines or opens the bank's CSV. The app suggests which pending customer payments arrived, marked "reference matches" or "only the amount matches — check". A person confirms each one; nothing is confirmed automatically.
- **Sharing between phones.** "Share data" opens the phone's share sheet (WhatsApp, email, Drive). Where sharing isn't supported, it downloads the file instead.
- **Hold and resume.** The office can pause a job (customer, supplier, weather, payment). Everyone sees why, and held work is never counted as late.
- **Practice mode.** A practice company with jobs at every stage and a person in every role (PIN 1111). Practice records pass the same rules as real ones.

## How it is built

No build step and no dependencies: plain HTML, CSS and JavaScript files that GitHub Pages or any static host can serve.

| File | Job |
|---|---|
| `js/domain.js` | Pure rules, no DOM: constants, quotation and payment maths, **one rule table** (`ACTIONS`: who may do what, at which stage, what data is required, how state changes), the task engine, lateness and escalation. Node tests load it too. |
| `js/store.js` | Event log in IndexedDB (memory fallback); photos and signatures stored as separate blobs; PIN login with lock-out; idle lock; data-file export/import. Every imported record is checked by the same rules. |
| `js/ui.js` | Words, formatting, router, sheets, toast, in-app camera (photos stamped with time and GPS), signature pad, read-aloud, voice input |
| `js/app.js` | Shell, role menus, event delegation, theme, boot, service worker |
| `js/screens*.js` | Door, login, setup, home, tasks, jobs, job page (details / money / photos / history / chat), printable quotation and agreement, people, business rules, dashboard, settings |
| `js/flows.js` | The flow engine and 36 task flows |
| `js/demo.js` | Practice company |
| `js/i18n.js` | All 1,130 strings in English, हिंदी and मराठी |

**Every change is an event.** The state is rebuilt from events, so home, lists, the job page and the numbers always agree. Buttons, task lists and saving all ask the same `guard()`, so a button never shows for an action that saving would refuse. Separation of duties is built into those rules: a quote maker cannot approve their own price, and the person who recorded a payment cannot confirm it. Below-floor prices need the Head Quarter. If nobody holds a role, the office covers it, so a small company is never stuck.

## Run

```bash
python3 -m http.server 8765      # then open http://localhost:8765
```

## Tests

```bash
node tests/domain.test.js                         # 256 checks: maths, rules, full lifecycle, replay
node tests/e2e.js http://localhost:8765/          # one new job lead → AMC through the screens, every role
node tests/setup.e2e.js http://localhost:8765/    # real company setup, people, PIN, themes (phone + desktop)
node tests/offline.e2e.js http://localhost:8765/  # installed app opens and works with the network off
npm install && node tests/a11y.e2e.js http://localhost:8765/   # accessibility audit: every role, three themes
```

## Not carried over

These parts of the original are not in this rebuild:

- the encrypted sync server and per-phone signing keys (phones share work through data files)
- the partner-company marketplace
- the career ladder
- stock
- housing-society voting

The event and rule-table design is meant to take them as new `ACTIONS` without changing the screens around them.
