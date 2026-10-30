import { db } from '@/db';
import type { MonthlySpend, Reminder, ServiceLog, Vehicle } from '@/types/database';

interface MonthlySpendQueryRow {
  current_month_total: number;
  current_month_count: number;
  previous_month_total: number;
  previous_month_count: number;
}

interface CurrencyRow {
  currency: string;
}

function formatYearMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getActiveVehicle(): Vehicle | null {
  return db.getFirstSync<Vehicle>(
    'SELECT * FROM vehicles ORDER BY id ASC LIMIT 1'
  );
}

export function getPendingReminder(vehicleId: number): Reminder | null {
  return db.getFirstSync<Reminder>(
    `SELECT *
     FROM reminders
     WHERE vehicle_id = ? AND status = 'pending'
     ORDER BY
       CASE WHEN due_odometer IS NULL THEN 1 ELSE 0 END ASC,
       due_odometer ASC,
       CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
       due_date ASC,
       id ASC
     LIMIT 1`,
    vehicleId
  );
}

export function getMonthlySpend(
  vehicleId: number,
  referenceDate: Date = new Date()
): MonthlySpend {
  const currentMonthDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  );
  const previousMonthDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() - 1,
    1
  );

  const currentMonthKey = formatYearMonth(currentMonthDate);
  const previousMonthKey = formatYearMonth(previousMonthDate);

  const spendRow = db.getFirstSync<MonthlySpendQueryRow>(
    `SELECT
       COALESCE(SUM(CASE WHEN substr(service_date, 1, 7) = ? THEN total_cost ELSE 0 END), 0) AS current_month_total,
       COALESCE(SUM(CASE WHEN substr(service_date, 1, 7) = ? THEN 1 ELSE 0 END), 0) AS current_month_count,
       COALESCE(SUM(CASE WHEN substr(service_date, 1, 7) = ? THEN total_cost ELSE 0 END), 0) AS previous_month_total,
       COALESCE(SUM(CASE WHEN substr(service_date, 1, 7) = ? THEN 1 ELSE 0 END), 0) AS previous_month_count
     FROM service_logs
     WHERE vehicle_id = ?
       AND substr(service_date, 1, 7) IN (?, ?)`,
    currentMonthKey,
    currentMonthKey,
    previousMonthKey,
    previousMonthKey,
    vehicleId,
    currentMonthKey,
    previousMonthKey
  );

  const currencyRow = db.getFirstSync<CurrencyRow>(
    `SELECT currency
     FROM service_logs
     WHERE vehicle_id = ?
     ORDER BY service_date DESC, id DESC
     LIMIT 1`,
    vehicleId
  );

  const currentMonthTotal = spendRow?.current_month_total ?? 0;
  const previousMonthTotal = spendRow?.previous_month_total ?? 0;

  return {
    currentMonthTotal,
    previousMonthTotal,
    difference: currentMonthTotal - previousMonthTotal,
    currentMonthServiceCount: spendRow?.current_month_count ?? 0,
    previousMonthServiceCount: spendRow?.previous_month_count ?? 0,
    currentMonthKey,
    previousMonthKey,
    currency: currencyRow?.currency ?? 'USD',
  };
}

export function getServiceLogs(vehicleId: number): ServiceLog[] {
  return db.getAllSync<ServiceLog>(
    `SELECT *
     FROM service_logs
     WHERE vehicle_id = ?
     ORDER BY service_date DESC, odometer_at_service DESC, id DESC`,
    vehicleId
  );
}

export function updateVehicleOdometer(
  vehicleId: number,
  newOdometer: number
): Vehicle | null {
  const sanitizedOdometer = Math.max(0, Math.round(newOdometer));

  db.runSync(
    'UPDATE vehicles SET current_odometer = ? WHERE id = ?',
    sanitizedOdometer,
    vehicleId
  );

  return db.getFirstSync<Vehicle>(
    'SELECT * FROM vehicles WHERE id = ?',
    vehicleId
  );
}
