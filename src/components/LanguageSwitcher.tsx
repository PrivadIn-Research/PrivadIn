import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clsx } from "clsx";
import { useAppLanguage } from "../hooks/useAppLanguage";

export function LanguageSwitcher({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const { language, options, changeLanguage } = useAppLanguage();

  return (
    <label
      className={clsx(
        "flex items-center gap-2 rounded-xl border border-line/10 bg-panel px-3 py-2 text-fg-soft",
        className,
      )}
      title={t("language.switcherLabel")}
    >
      <Languages size={compact ? 15 : 16} className="text-accent-strong" />
      <span className="sr-only">{t("language.label")}</span>
      <select
        className={clsx(
          "bg-transparent font-semibold outline-none",
          compact ? "max-w-[42vw] text-xs" : "text-sm",
        )}
        aria-label={t("language.switcherLabel")}
        value={language}
        onChange={(event) => {
          void changeLanguage(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-panel-strong text-fg">
            {compact ? option.compactLabel : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
