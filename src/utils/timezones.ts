export interface TimezoneOption {
  value: string;
  label: string;
}

const TIMEZONE_VALUES = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Belem",
  "America/Recife",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
] as const;

function getGMTOffsetLabel(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date());
  const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  return offsetPart.replace("GMT", "GMT");
}

export function buildTimezoneOptions(): TimezoneOption[] {
  return TIMEZONE_VALUES.map((value) => ({
    value,
    label: `${value} - ${getGMTOffsetLabel(value)}`,
  }));
}
