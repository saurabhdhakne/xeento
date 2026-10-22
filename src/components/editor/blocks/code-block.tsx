import { createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";

const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>';
const LIST_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';

// The bundled list covers JS/TS/Python/JSON/HTML/CSS/SQL/Bash("shellscript")/
// Java/Rust/Markdown already — only Go is missing from @blocknote/code-block's
// default set, so it's added here (Shiki's engine supports it natively).
const supportedLanguages = {
  ...codeBlockOptions.supportedLanguages,
  go: { name: "Go", aliases: ["golang"] },
};

const baseSpec = createCodeBlockSpec({
  indentLineWithTab: true,
  defaultLanguage: codeBlockOptions.defaultLanguage,
  supportedLanguages,
});

/**
 * Wraps BlockNote's official Shiki-backed code block (language dropdown,
 * highlighting, tab-indent, theme-following — all handled there) with a
 * copy button and a line-number gutter. The gutter is a sibling column
 * next to the block's own DOM (flex row), never inserted inside the `pre`
 * ProseMirror manages — that tree is off-limits to mutate directly without
 * risking NodeView/mutation-observer conflicts. A one-time height
 * measurement accounts for the language-dropdown row so the gutter still
 * starts level with the first code line when multiple languages are
 * registered (as they are here).
 */
export const codeBlockSpec = {
  ...baseSpec,
  implementation: {
    ...baseSpec.implementation,
    render: (block: Parameters<NonNullable<typeof baseSpec.implementation.render>>[0], editor: Parameters<NonNullable<typeof baseSpec.implementation.render>>[1]) => {
      // `createBlockSpec`'s generated render method reads `this.blockContentDOMAttributes`
      // (and `this.renderType`/`this.props`) — core's own NodeView invokes it via
      // `.call({...})`, so calling it as a bare function here (losing `this`) throws
      // "Cannot read properties of undefined (reading 'blockContentDOMAttributes')"
      // immediately. Bind the same shape core's non-NodeView ("dom") call sites use.
      const render = baseSpec.implementation.render as NonNullable<
        typeof baseSpec.implementation.render
      >;
      const base = render.call(
        { blockContentDOMAttributes: {}, renderType: "dom", props: undefined },
        block,
        editor,
      ) as NonNullable<ReturnType<typeof render>>;

      const wrapper = document.createElement("div");
      wrapper.className = "xeento-code-block";

      const toolbar = document.createElement("div");
      toolbar.className = "xeento-code-toolbar";
      toolbar.contentEditable = "false";

      const lineToggle = document.createElement("button");
      lineToggle.type = "button";
      lineToggle.title = "Toggle line numbers";
      lineToggle.innerHTML = LIST_ICON;
      toolbar.appendChild(lineToggle);

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.title = "Copy code";
      copyButton.innerHTML = COPY_ICON;
      toolbar.appendChild(copyButton);

      const row = document.createElement("div");
      row.className = "xeento-code-row";

      const gutter = document.createElement("div");
      gutter.className = "xeento-code-gutter";
      gutter.contentEditable = "false";
      gutter.style.display = "none";

      const content = document.createElement("div");
      content.className = "xeento-code-content";
      content.appendChild(base.dom);

      row.appendChild(gutter);
      row.appendChild(content);
      wrapper.appendChild(toolbar);
      wrapper.appendChild(row);

      let gutterEnabled = false;

      function updateGutter() {
        if (!gutterEnabled) return;
        const text = base.contentDOM?.textContent ?? "";
        const lineCount = Math.max(1, text.split("\n").length);
        const existing = gutter.childElementCount;
        if (existing === lineCount) return;
        gutter.innerHTML = "";
        for (let i = 1; i <= lineCount; i++) {
          const line = document.createElement("div");
          line.textContent = String(i);
          gutter.appendChild(line);
        }
        // Account for the language dropdown row (if present) so numbering
        // still starts level with the first line of code.
        const select = content.querySelector("select");
        gutter.style.marginTop = select ? `${select.getBoundingClientRect().height}px` : "0";
      }

      lineToggle.addEventListener("click", () => {
        gutterEnabled = !gutterEnabled;
        lineToggle.classList.toggle("active", gutterEnabled);
        gutter.style.display = gutterEnabled ? "block" : "none";
        if (gutterEnabled) updateGutter();
      });

      copyButton.addEventListener("click", () => {
        const text = base.contentDOM?.textContent ?? "";
        navigator.clipboard.writeText(text).then(() => {
          copyButton.innerHTML = CHECK_ICON;
          setTimeout(() => {
            copyButton.innerHTML = COPY_ICON;
          }, 1200);
        });
      });

      return {
        dom: wrapper,
        contentDOM: base.contentDOM,
        destroy: base.destroy,
        update: (node: Parameters<NonNullable<typeof base.update>>[0]) => {
          const result = base.update?.(node);
          updateGutter();
          return result;
        },
      };
    },
  },
};
