const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto"
});

const units = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
  ["second", 1000]
] as const;

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function tomorrowAtNine(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow;
}

export function formatRelativeDateTime(value: string | Date) {
  const date = new Date(value);
  const delta = date.getTime() - Date.now();

  for (const [unit, milliseconds] of units) {
    if (Math.abs(delta) >= milliseconds || unit === "second") {
      return relativeFormatter.format(
        Math.round(delta / milliseconds),
        unit
      );
    }
  }

  return "just now";
}

export function formatAbsoluteDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
