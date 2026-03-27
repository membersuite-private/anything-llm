import { useState, useEffect, createContext, useContext } from "react";

const WIDTH_KEY = "gz-content-width";
const MODES = [
  { key: "compact", label: "Compact", chatClass: "max-w-[65ch]", inputW: "md:max-w-[65ch]" },
  { key: "auto", label: "Auto", chatClass: "max-w-[55vw]", inputW: "md:max-w-[55vw]" },
  { key: "wide", label: "Wide", chatClass: "max-w-[80vw]", inputW: "md:max-w-[80vw]" },
  { key: "full", label: "Full", chatClass: "max-w-[96vw]", inputW: "md:max-w-[96vw]" },
];

const ContentWidthContext = createContext(null);

export function ContentWidthProvider({ children }) {
  const value = useContentWidth();
  return (
    <ContentWidthContext.Provider value={value}>
      {children}
    </ContentWidthContext.Provider>
  );
}

export function useContentWidthContext() {
  return useContext(ContentWidthContext) || { mode: "auto", widthClass: "max-w-[55vw]", inputWidthClass: "md:max-w-[55vw]" };
}

export function useContentWidth() {
  const [mode, setMode] = useState(() => {
    if (typeof window === "undefined") return "auto";
    return localStorage.getItem(WIDTH_KEY) || "auto";
  });

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, mode);
  }, [mode]);

  const config = MODES.find((m) => m.key === mode) || MODES[0];
  return { mode, setMode, widthClass: config.chatClass, inputWidthClass: config.inputW, MODES };
}

export default function ContentWidthToggle({ mode, setMode }) {
  return (
    <div className="flex items-center gap-0.5 bg-zinc-800 light:bg-slate-100 rounded-md p-0.5">
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => setMode(m.key)}
          className={`px-2 py-1 text-[10px] rounded transition-colors ${
            mode === m.key
              ? "bg-zinc-600 light:bg-slate-300 text-white light:text-slate-900"
              : "text-zinc-400 light:text-slate-500 hover:text-white light:hover:text-slate-800"
          }`}
          title={m.label}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
