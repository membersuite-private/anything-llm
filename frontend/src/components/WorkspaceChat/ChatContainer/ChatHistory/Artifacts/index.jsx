import { useState, useMemo } from "react";
import { Eye, Code, ArrowsOut } from "@phosphor-icons/react";

/**
 * Detect HTML/SVG artifact blocks in message text.
 * Returns array of { type: 'text'|'artifact', content: string }
 */
export function parseArtifacts(text) {
  if (!text) return [{ type: "text", content: text || "" }];

  const parts = [];
  // Match SVG blocks (standalone, not in code fences)
  // Match ```html or ```svg code blocks
  const codeBlockRegex = /```(?:html|svg|htm)\n([\s\S]*?)```/gi;
  // Match bare <svg> blocks not inside code fences
  const svgBlockRegex = /(<svg[\s\S]*?<\/svg>)/gi;
  // Match bare <!DOCTYPE html> or <html> blocks
  const htmlBlockRegex = /(<!DOCTYPE html>[\s\S]*?<\/html>)/gi;

  let combined = text;
  const artifacts = [];

  // Extract code-fenced HTML/SVG first
  combined = combined.replace(codeBlockRegex, (match, code) => {
    const id = `__ARTIFACT_${artifacts.length}__`;
    artifacts.push(code.trim());
    return id;
  });

  // Extract bare SVG blocks
  combined = combined.replace(svgBlockRegex, (match, svg) => {
    const id = `__ARTIFACT_${artifacts.length}__`;
    artifacts.push(svg.trim());
    return id;
  });

  // Extract bare HTML documents
  combined = combined.replace(htmlBlockRegex, (match, html) => {
    const id = `__ARTIFACT_${artifacts.length}__`;
    artifacts.push(html.trim());
    return id;
  });

  if (artifacts.length === 0) {
    return [{ type: "text", content: text }];
  }

  // Split by artifact placeholders
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
 * Renders an HTML/SVG artifact in a sandboxed iframe.
 */
export default function ArtifactFrame({ content }) {
  const [showCode, setShowCode] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isSVG = content.trim().startsWith("<svg");

  // Wrap SVG in a minimal HTML document for the iframe
  const htmlContent = useMemo(() => {
    if (isSVG) {
      return `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100%; background: transparent; }
  svg { max-width: 100%; height: auto; }
</style></head><body>${content}</body></html>`;
    }
    // If it's already a full HTML doc, use as-is
    if (content.includes("<!DOCTYPE") || content.includes("<html")) {
      return content;
    }
    // Wrap fragment
    return `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: transparent; color: #e2e8f0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 8px 12px; border: 1px solid #374151; text-align: left; }
  th { background: #1f2937; }
</style></head><body>${content}</body></html>`;
  }, [content, isSVG]);

  const srcDoc = htmlContent;

  return (
    <div className={`my-3 rounded-lg border border-zinc-700 light:border-slate-300 overflow-hidden ${expanded ? "fixed inset-4 z-50 bg-zinc-900" : ""}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 light:bg-slate-100 text-xs">
        <span className="text-zinc-400 light:text-slate-500 font-medium">
          {isSVG ? "SVG Artifact" : "HTML Artifact"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            className="flex items-center gap-1 text-zinc-400 hover:text-white light:text-slate-500 light:hover:text-slate-800"
            title={showCode ? "Show preview" : "Show source"}
          >
            {showCode ? <Eye size={14} /> : <Code size={14} />}
            <span>{showCode ? "Preview" : "Source"}</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-zinc-400 hover:text-white light:text-slate-500 light:hover:text-slate-800"
            title={expanded ? "Collapse" : "Expand"}
          >
            <ArrowsOut size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {showCode ? (
        <pre className="p-3 text-xs text-slate-300 bg-zinc-900 overflow-auto max-h-[500px]">
          <code>{content}</code>
        </pre>
      ) : (
        <iframe
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          className={`w-full border-0 bg-white ${expanded ? "h-[calc(100%-36px)]" : "min-h-[300px] max-h-[800px]"}`}
          style={{ height: expanded ? undefined : Math.min(800, Math.max(300, isSVG ? 500 : 400)) }}
          title="Artifact preview"
        />
      )}

      {/* Expand overlay backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/60 -z-10"
          onClick={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
