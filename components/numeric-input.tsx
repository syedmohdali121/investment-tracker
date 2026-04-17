"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Controlled numeric text input that displays the number with locale-aware
 * thousands separators (commas) while exposing a plain numeric string via
 * `onChange`. An empty string is emitted when the field is cleared.
 */
export function NumericInput({
  value,
  onChange,
  placeholder,
  className,
  locale = "en-IN",
  allowDecimal = true,
  min = 0,
  ...rest
}: {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
  locale?: string;
  allowDecimal?: boolean;
  min?: number;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>) {
  const [display, setDisplay] = useState<string>(() =>
    formatWithCommas(value, locale, allowDecimal),
  );
  const lastRaw = useRef<string>(value);

  useEffect(() => {
    if (value !== lastRaw.current) {
      setDisplay(formatWithCommas(value, locale, allowDecimal));
      lastRaw.current = value;
    }
  }, [value, locale, allowDecimal]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target.value;
    // Keep only digits, optional leading minus (only if min < 0), and one dot
    let raw = input.replace(/[^\d.-]/g, "");
    if (min >= 0) raw = raw.replace(/-/g, "");
    // Only first dot allowed
    const firstDot = raw.indexOf(".");
    if (!allowDecimal) {
      raw = raw.replace(/\./g, "");
    } else if (firstDot !== -1) {
      raw =
        raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
    }
    // Only one leading minus
    if (raw.indexOf("-") > 0) raw = raw.replace(/-/g, "");

    lastRaw.current = raw;
    setDisplay(formatWithCommas(raw, locale, allowDecimal));
    onChange(raw);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      autoComplete="off"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      className={cn("input", className)}
    />
  );
}

function formatWithCommas(raw: string, locale: string, allowDecimal: boolean) {
  if (raw === "" || raw === "-") return raw;
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  if (!allowDecimal) {
    const n = Number(body);
    if (!Number.isFinite(n)) return raw;
    return (negative ? "-" : "") + n.toLocaleString(locale);
  }
  const [intPart, decPart] = body.split(".");
  let intFormatted = "";
  if (intPart === "" || intPart === undefined) {
    intFormatted = "";
  } else {
    const n = Number(intPart);
    intFormatted = Number.isFinite(n) ? n.toLocaleString(locale) : intPart;
  }
  if (body.includes(".")) {
    return (negative ? "-" : "") + intFormatted + "." + (decPart ?? "");
  }
  return (negative ? "-" : "") + intFormatted;
}
