import { useState, useEffect, createContext, useContext } from "react";

const WIDTH_KEY = "gz-content-width";
const MODES = [
  { key: "auto", label: "Small", chatClass: "max-w-[800px]", inputW: "md:w-[800px]" },
  { key: "medium", label: "Auto", chatClass: "max-w-[1100px]", inputW: "md:w-[1100px]" },
  { key: "full", label: "Full", chatClass: "max-w-[96%]", inputW: "md:w-[96%]" },
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
  return useContext(ContentWidthContext) || { mode: "medium", widthClass: "max-w-[1100px]", inputWidthClass: "md:w-[1100px]" };
}

export function useContentWidth() {
  const [mode, setMode] = useState(() => {
    if (typeof window === "undefined") return "medium";
    return localStorage.getItem(WIDTH_KEY) || "medium";
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
