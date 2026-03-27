import { useState, useEffect, useRef, useMemo } from "react";
import { Code, ArrowsOut, ArrowsIn } from "@phosphor-icons/react";

/**
 * Detect HTML/SVG artifact blocks in message text.
 * Returns array of { type: 'text'|'artifact', content: string }
 */
export function parseArtifacts(text) {
  if (!text) return [{ type: "text", content: text || "" }];

  const parts = [];
  const codeBlockRegex = /```(?:html|svg|htm)\n([\s\S]*?)```/gi;
  const svgBlockRegex = /(<svg[\s\S]*?<\/svg>)/gi;
  const htmlBlockRegex = /(<!DOCTYPE html>[\s\S]*?<\/html>)/gi;

  let combined = text;
  const artifacts = [];

  combined = combined.replace(codeBlockRegex, (match, code) => {
    const id = `__ARTIFACT_${artifacts.length}__`;
    artifacts.push(code.trim());
    return id;
  });

  combined = combined.replace(svgBlockRegex, (match, svg) => {
    const id = `__ARTIFACT_${artifacts.length}__`;
    artifacts.push(svg.trim());
    return id;
  });

  combined = combined.replace(htmlBlockRegex, (match, html) => {
    const id = `__ARTIFACT_${artifacts.length}__`;
    artifacts.push(html.trim());
    return id;
  });

  if (artifacts.length === 0) {
    return [{ type: "text", content: text }];
  }

  const segments = combined.split(/(__ARTIFACT_\d+__)/);
  for (const seg of segments) {
    const artifactMatch = seg.match(/^__ARTIFACT_(\d+)__$/);
    if (artifactMatch) {
      parts.push({ type: "artifact", content: artifacts[parseInt(artifactMatch[1])] });
    } else if (seg.trim()) {
      parts.push({ type: "text", content: seg });
    }
  }

  return parts;
}

/**
 * Renders an HTML/SVG artifact inline in the chat flow.
 * Auto-resizes to content height — no fixed boxes.
 * Expand button for full-screen when needed.
 */
export default function ArtifactFrame({ content }) {
  const [showCode, setShowCode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [frameHeight, setFrameHeight] = useState(0);
  const iframeRef = useRef(null);

  const isSVG = content.trim().startsWith("<svg");

  // Build HTML with a resize observer that posts height back to parent
  const htmlContent = useMemo(() => {
    const resizeScript = `
<script>
  function postHeight() {
    const h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'artifact-resize', height: h }, '*');
  }
  window.addEventListener('load', postHeight);
  new ResizeObserver(postHeight).observe(document.body);
  // Fallback for SVGs that load async
  setTimeout(postHeight, 100);
  setTimeout(postHeight, 500);
</script>`;

    if (isSVG) {
      return `<!DOCTYPE html>
<html><head><style>
  html, body { margin: 0; padding: 0; background: #1e1e2e; overflow: hidden; }
  body { display: flex; justify-content: center; }
  svg { width: 100%; height: auto; display: block; }
</style></head><body>${content}${resizeScript}</body></html>`;
    }

    if (content.includes("<!DOCTYPE") || content.includes("<html")) {
      // Inject resize script into existing HTML
      return content.replace("</body>", `${resizeScript}</body>`);
    }

    return `<!DOCTYPE html>
<html><head><style>
  html, body { margin: 0; padding: 16px; background: transparent; overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif; color: #e2e8f0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 8px 12px; border: 1px solid #374151; text-align: left; }
  th { background: #1f2937; font-weight: 600; }
  tr:nth-child(even) { background: rgba(255,255,255,0.03); }
</style></head><body>${content}${resizeScript}</body></html>`;
  }, [content, isSVG]);

  // Listen for height messages from the iframe
  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type === "artifact-resize" && iframeRef.current) {
        // Only accept messages from our iframe
        if (e.source === iframeRef.current.contentWindow) {
          setFrameHeight(e.data.height);
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (expanded) {
    return (
      <>
        <div className="fixed inset-0 bg-black/70 z-50" onClick={() => setExpanded(false)} />
        <div className="fixed inset-4 z-50 rounded-xl overflow-hidden border border-zinc-600 flex flex-col bg-zinc-900">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 text-xs shrink-0">
            <span className="text-zinc-400 font-medium">
              {isSVG ? "SVG" : "HTML"} Artifact — Expanded
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex items-center gap-1 text-zinc-400 hover:text-white"
            >
              <ArrowsIn size={14} /> Close
            </button>
          </div>
          <iframe
            srcDoc={htmlContent}
            sandbox="allow-scripts"
            className="flex-1 w-full border-0 bg-white"
            title="Artifact expanded"
          />
        </div>
      </>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-zinc-700/50 light:border-slate-200 overflow-hidden">
      {/* Minimal toolbar — only shows on hover or when code view is active */}
      <div className="flex items-center justify-end gap-2 px-2 py-1 bg-zinc-800/50 light:bg-slate-50 text-[10px]">
        <button
          type="button"
          onClick={() => setShowCode(!showCode)}
          className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 light:text-slate-400 light:hover:text-slate-600 transition-colors"
        >
          <Code size={12} />
          {showCode ? "Preview" : "Source"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 light:text-slate-400 light:hover:text-slate-600 transition-colors"
        >
          <ArrowsOut size={12} />
        </button>
      </div>

      {showCode ? (
        <pre className="p-3 text-xs text-slate-300 light:text-slate-700 bg-zinc-900 light:bg-slate-50 overflow-auto max-h-[400px]">
          <code>{content}</code>
        </pre>
      ) : (
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          sandbox="allow-scripts"
          className="w-full border-0"
          style={{
            height: frameHeight > 0 ? `${frameHeight}px` : "200px",
            background: "#1e1e2e",
            transition: "height 0.15s ease",
          }}
          title="Artifact preview"
        />
      )}
    </div>
  );
}
