// Builds test-fixtures/notion-export-sample.zip: a small, hand-built zip
// shaped like a real Notion "Export → Markdown & CSV" download, for
// exercising the Notion-import path without needing real Notion data.
import JSZip from "jszip";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(root, "test-fixtures/notion-export-sample.zip");

// A 1x1 transparent PNG, just enough to exercise the attachment-import path.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const WIKI_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const GETTING_STARTED_ID = "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5";
const ROADMAP_ID = "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";
const ROSTER_ID = "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1";

const wikiName = `Engineering Wiki ${WIKI_ID}`;
const gettingStartedName = `Getting Started ${GETTING_STARTED_ID}`;
const roadmapName = `Roadmap ${ROADMAP_ID}`;
const rosterName = `Team Roster ${ROSTER_ID}`;

const zip = new JSZip();

zip.file(
  `${wikiName}.md`,
  `# Engineering Wiki

Welcome! Start with [Getting Started](${wikiName}/${gettingStartedName}.md), or check the [Roadmap](${wikiName}/${roadmapName}.md).

See our team roster below.
`,
);

const wikiFolder = zip.folder(wikiName);

wikiFolder.file(
  `${gettingStartedName}.md`,
  `# Getting Started

This is the onboarding page.

![Team photo](${gettingStartedName}/team.png)

- Set up your laptop
- Read the [Roadmap](${roadmapName}.md)
- Say hi on Slack
`,
);

wikiFolder
  .folder(gettingStartedName)
  .file("team.png", Buffer.from(TINY_PNG_BASE64, "base64"), { binary: true });

wikiFolder.file(
  `${roadmapName}.md`,
  `# Roadmap

| Quarter | Goal |
| --- | --- |
| Q1 | Ship the import/export milestone |
| Q2 | Real-time collaboration |

Back to [Getting Started](${gettingStartedName}.md).
`,
);

wikiFolder.file(
  `${rosterName}.csv`,
  `Name,Role,Team\nAda Lovelace,Engineer,Platform\nGrace Hopper,Engineer,Compiler\nMargaret Hamilton,Lead,Flight Software\n`,
);

const buffer = await zip.generateAsync({ type: "nodebuffer" });
writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${buffer.length} bytes)`);
