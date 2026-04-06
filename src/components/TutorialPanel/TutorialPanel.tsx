import React, { useState } from 'react';
import styles from './TutorialPanel.module.css';

const sections = [
  {
    title: 'Getting started',
    content: `
SEL Logic Visualizer accepts raw QuickSet terminal output — no editing required.

**Step 1: Get your relay settings**
In QuickSet, connect to your relay and run one of these commands in the terminal:
- \`SHO SET\`   — general settings
- \`SHO SET L\` — SELogic (logic) settings
- \`SHO SET G\` — group settings

**Step 2: Copy and paste**
Select all of the terminal output (including headers) and paste it into the Import panel.
The app handles headers, blank lines, and unsupported settings automatically.

**Step 3: Click "Import & Visualize"**
The app parses your settings and builds an interactive logic graph.
    `.trim(),
  },
  {
    title: 'Reading the graph',
    content: `
Each box in the graph is a logic **node**. Nodes are color-coded by type:

| Color      | Type     | Meaning                              |
|------------|----------|--------------------------------------|
| Blue       | Input    | Hardware input / external bit (52A)  |
| Red-pink   | Output   | Relay output coil (TR, CL, BFI)      |
| Green      | Derived  | Defined by a logic equation (SV01)   |
| Purple     | AND      | All inputs must be true              |
| Blue-grey  | OR       | Any input must be true               |
| Orange-red | NOT      | Inverted signal                      |
| Purple     | Timer    | PCT / TON / TOF timer element        |
| Orange     | Latch    | SET/RST latch                        |

Edges show signal flow. **Green animated edges** indicate an active (true) signal in simulation.
Red edges carry negated (NOT) signals.

**Click any node** to highlight its upstream dependencies and downstream effects in the Analysis panel.
    `.trim(),
  },
  {
    title: 'Tracing trip logic',
    content: `
To trace what causes a trip output (TR):

1. Import your settings.
2. Click on the **TR** node in the graph.
3. The Analysis panel shows:
   - **Upstream**: all signals that feed TR
   - **Downstream**: signals that TR drives
   - **Input paths**: all paths from hardware inputs to TR

This lets you quickly answer: "What inputs need to be asserted to cause a trip?"

You can also click on protection elements like **50P1**, **51P1T**, **67P** etc. to see their
exact logic contributions.
    `.trim(),
  },
  {
    title: 'Simulation',
    content: `
The simulator lets you rehearse test sequences before applying them to the relay.

**How to use:**
1. Switch to the **Simulation** panel.
2. Click any **input node** button to toggle it on/off (1/0).
3. Click **Step** to advance one logic evaluation cycle.
4. Click **Run** to step automatically at 0.5s intervals.
5. Watch outputs and derived points react.

**What it models:**
- Combinational AND/OR/NOT logic
- Rising edge (R_) and falling edge (F_) detection
- Timers: assert after 3+ steps of continuous enable
- Latches: SET/RST state retention

**Limitations (v1):**
- Timers use a fixed 3-step threshold; actual pickup delays require the relay's timer settings.
- Does not emulate protection element physics (currents, voltages).
    `.trim(),
  },
  {
    title: 'Revision comparison',
    content: `
To compare two relay settings revisions:

1. Import the **old revision** settings via the Import panel.
2. Switch to the **Comparison** panel.
3. Paste the **new revision** settings into the text box.
4. Click **Compare**.

The app shows:
- **Added** settings (new in revision B)
- **Removed** settings (not in revision B)
- **Changed** settings (different value in revision B)

This is especially useful for pre-outage reviews and commissioning turnover documents.
    `.trim(),
  },
  {
    title: 'SEL naming reference',
    content: `
The app preserves exact SEL naming conventions. Here are common examples:

| Name    | Meaning                          |
|---------|----------------------------------|
| 52A     | Breaker A auxiliary contact      |
| 52B     | Breaker B auxiliary contact      |
| 50P1    | Phase overcurrent 1 output       |
| 50P1T   | Phase overcurrent 1 timer output |
| 51G1T   | Ground TOC 1 timer output        |
| 27P1    | Phase undervoltage 1 output      |
| 59P1    | Phase overvoltage 1 output       |
| 67P1    | Phase directional overcurrent    |
| 86      | Lockout relay bit                |
| TR      | Trip coil output                 |
| CL      | Close coil output                |
| BFI     | Breaker failure initiate         |
| BFT     | Breaker failure trip             |
| SV01    | SELogic variable 01              |
| R_52A   | Rising edge of 52A               |
| F_52A   | Falling edge of 52A              |
| PCT     | Programmable counter/timer       |

No renaming is required. Paste directly from QuickSet.
    `.trim(),
  },
];

export function TutorialPanel() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  function renderContent(text: string) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('| ') || line.startsWith('|-')) {
        return <div key={i} className={styles.tableRow}><code>{line}</code></div>;
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <div key={i} className={styles.strong}>{line.slice(2, -2)}</div>;
      }
      if (line.startsWith('- ')) {
        return <div key={i} className={styles.bullet}>• {line.slice(2)}</div>;
      }
      if (line.startsWith('#')) {
        return <div key={i} className={styles.heading}>{line.replace(/^#+\s*/, '')}</div>;
      }
      if (line.trim() === '') return <div key={i} className={styles.spacer} />;
      return <div key={i} className={styles.para}>{line}</div>;
    });
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Tutorial &amp; Help</h3>
      <p className={styles.intro}>
        Select a topic to expand it.
      </p>
      {sections.map((section, idx) => (
        <div key={idx} className={styles.section}>
          <button
            className={`${styles.sectionHeader} ${openIdx === idx ? styles.open : ''}`}
            onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
          >
            <span>{section.title}</span>
            <span className={styles.chevron}>{openIdx === idx ? '▲' : '▼'}</span>
          </button>
          {openIdx === idx && (
            <div className={styles.sectionBody}>
              {renderContent(section.content)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
