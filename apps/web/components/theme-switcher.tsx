"use client";

import { Icon } from "@/components/icons";
import { useTheme, type ThemePreference } from "@/lib/theme";

const options: Array<{ value: ThemePreference; label: string; icon: "sun" | "moon" | "monitor" }> = [
  { value: "light", label: "Light theme", icon: "sun" },
  { value: "dark", label: "Dark theme", icon: "moon" },
  { value: "system", label: "Match system", icon: "monitor" },
];

export function ThemeSwitcher() {
  const { preference, setTheme } = useTheme();

  return (
    <div
      className="surface-transition flex items-center gap-0.5 rounded-[7px] border border-edge bg-surface p-0.5"
      role="group"
      aria-label="Theme"
    >
      {options.map((option) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => setTheme(option.value)}
            className={`surface-transition flex h-6 w-7 items-center justify-center rounded-[5px] ${
              active
                ? "bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                : "text-tertiary hover:bg-overlay-hover hover:text-secondary"
            }`}
          >
            <Icon name={option.icon} className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
