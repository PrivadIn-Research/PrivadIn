import type { WorkSchedule } from "../types";

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  horarioInicioExpediente: "09:00",
  horarioFimExpediente: "18:00",
  horarioInicioAlmoco: "12:00",
  horarioFimAlmoco: "13:00",
  timezone: "America/Sao_Paulo",
};

export function resolveWorkSchedule(raw?: Partial<WorkSchedule> | null): WorkSchedule {
  const parseTime = (value: unknown, fallback: string) =>
    typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : fallback;

  return {
    horarioInicioExpediente: parseTime(
      raw?.horarioInicioExpediente,
      DEFAULT_WORK_SCHEDULE.horarioInicioExpediente,
    ),
    horarioFimExpediente: parseTime(raw?.horarioFimExpediente, DEFAULT_WORK_SCHEDULE.horarioFimExpediente),
    horarioInicioAlmoco: parseTime(raw?.horarioInicioAlmoco, DEFAULT_WORK_SCHEDULE.horarioInicioAlmoco),
    horarioFimAlmoco: parseTime(raw?.horarioFimAlmoco, DEFAULT_WORK_SCHEDULE.horarioFimAlmoco),
    timezone:
      typeof raw?.timezone === "string" && raw.timezone ? raw.timezone : DEFAULT_WORK_SCHEDULE.timezone,
  };
}

export function minutesOfDay(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isBetweenMinutes(current: number, start: number, end: number) {
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
}

export function localTimeInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  return formatter.format(date);
}

export function assertActiveWorkTime(schedule: WorkSchedule, now: Date) {
  const localTime = localTimeInTimezone(now, schedule.timezone);
  const current = minutesOfDay(localTime);
  const workStart = minutesOfDay(schedule.horarioInicioExpediente);
  const workEnd = minutesOfDay(schedule.horarioFimExpediente);
  const lunchStart = minutesOfDay(schedule.horarioInicioAlmoco);
  const lunchEnd = minutesOfDay(schedule.horarioFimAlmoco);

  if (!isBetweenMinutes(current, workStart, workEnd)) {
    throw new Error("Registro bloqueado fora do horário de expediente.");
  }

  if (isBetweenMinutes(current, lunchStart, lunchEnd)) {
    throw new Error("Registro bloqueado durante o horário de almoço.");
  }

  return localTime;
}

export function dailyWorkMinutes(schedule: WorkSchedule) {
  const workStart = minutesOfDay(schedule.horarioInicioExpediente);
  const workEnd = minutesOfDay(schedule.horarioFimExpediente);
  const lunchStart = minutesOfDay(schedule.horarioInicioAlmoco);
  const lunchEnd = minutesOfDay(schedule.horarioFimAlmoco);
  const work = workEnd >= workStart ? workEnd - workStart : 1440 - workStart + workEnd;
  const lunch = lunchEnd >= lunchStart ? lunchEnd - lunchStart : 1440 - lunchStart + lunchEnd;
  return Math.max(1, work - lunch);
}
