import type * as SQLite from 'expo-sqlite';

import { db } from '@/db';
import type { Reminder, ServiceLog, Vehicle } from '@/types/database';

const DATABASE_VERSION = 1;

interface UserVersionRow {
  user_version: number;
}

interface CountRow {
  count: number;
}

export function runMigrations(database: SQLite.SQLiteDatabase = db): void {
  database.execSync('PRAGMA journal_mode = WAL;');
  database.execSync('PRAGMA foreign_keys = ON;');

  const versionRow = database.getFirstSync<UserVersionRow>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  database.withTransactionSync(() => {
    if (currentVersion < 1) {
      database.execSync(`
        CREATE TABLE IF NOT EXISTS vehicles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('car', 'motorcycle')),
          current_odometer INTEGER NOT NULL,
          unit TEXT NOT NULL CHECK (unit IN ('km', 'mi')),
          subtitle TEXT,
          image_uri TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS service_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vehicle_id INTEGER NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('oil', 'brakes', 'tires', 'coolant', 'other')),
          title TEXT NOT NULL,
          odometer_at_service INTEGER NOT NULL,
          total_cost REAL NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          shop_name TEXT,
          notes TEXT,
          receipt_uri TEXT,
          service_date TEXT NOT NULL,
          FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vehicle_id INTEGER NOT NULL,
          service_log_id INTEGER,
          category TEXT NOT NULL CHECK (category IN ('oil', 'brakes', 'tires', 'coolant', 'other')),
          title TEXT NOT NULL,
          last_service_odometer INTEGER NOT NULL,
          due_odometer INTEGER,
          due_date TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
          FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
          FOREIGN KEY (service_log_id) REFERENCES service_logs(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_service_logs_vehicle_date
          ON service_logs (vehicle_id, service_date DESC);

        CREATE INDEX IF NOT EXISTS idx_reminders_vehicle_status
          ON reminders (vehicle_id, status, due_odometer ASC);
      `);
    }

    database.execSync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

export function seedDatabaseIfNeeded(database: SQLite.SQLiteDatabase = db): void {
  const existingVehicles = database.getFirstSync<CountRow>(
    'SELECT COUNT(*) as count FROM vehicles'
  );

  if ((existingVehicles?.count ?? 0) > 0) {
    return;
  }

  database.withTransactionSync(() => {
    const seedVehicle: Omit<Vehicle, 'id'> = {
      name: '2021 VW Golf',
      type: 'car',
      current_odometer: 48250,
      unit: 'km',
      subtitle: 'Personal vehicle',
      image_uri: null,
      created_at: '2026-08-01T09:00:00.000Z',
    };

    const vehicleResult = database.runSync(
      `INSERT INTO vehicles (name, type, current_odometer, unit, subtitle, image_uri, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      seedVehicle.name,
      seedVehicle.type,
      seedVehicle.current_odometer,
      seedVehicle.unit,
      seedVehicle.subtitle,
      seedVehicle.image_uri,
      seedVehicle.created_at
    );

    const vehicleId = vehicleResult.lastInsertRowId;

    const seedLogs: Omit<ServiceLog, 'id'>[] = [
      {
        vehicle_id: vehicleId,
        category: 'oil',
        title: 'Oil & filter change',
        odometer_at_service: 48250,
        total_cost: 89.0,
        currency: 'USD',
        shop_name: 'Northside Auto',
        notes:
          'Replaced oil with 5W-30 full synthetic and fitted a new filter. Fluid levels checked; no leaks found.\nServiced by A. Rivera',
        receipt_uri: 'seed://receipt-northside-auto-ns1024',
        service_date: '2026-10-24',
      },
      {
        vehicle_id: vehicleId,
        category: 'tires',
        title: 'Tire rotation',
        odometer_at_service: 46100,
        total_cost: 40.0,
        currency: 'USD',
        shop_name: null,
        notes: null,
        receipt_uri: 'seed://receipt-tire-rotation-sep2026',
        service_date: '2026-09-12',
      },
      {
        vehicle_id: vehicleId,
        category: 'brakes',
        title: 'Brake inspection',
        odometer_at_service: 43800,
        total_cost: 35.0,
        currency: 'USD',
        shop_name: null,
        notes: null,
        receipt_uri: null,
        service_date: '2026-08-03',
      },
    ];

    let tireServiceLogId: number | null = null;

    for (const log of seedLogs) {
      const logResult = database.runSync(
        `INSERT INTO service_logs (
          vehicle_id,
          category,
          title,
          odometer_at_service,
          total_cost,
          currency,
          shop_name,
          notes,
          receipt_uri,
          service_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        log.vehicle_id,
        log.category,
        log.title,
        log.odometer_at_service,
        log.total_cost,
        log.currency,
        log.shop_name,
        log.notes,
        log.receipt_uri,
        log.service_date
      );

      if (log.category === 'tires' && log.title === 'Tire rotation') {
        tireServiceLogId = logResult.lastInsertRowId;
      }
    }

    const seedReminder: Omit<Reminder, 'id'> = {
      vehicle_id: vehicleId,
      service_log_id: tireServiceLogId,
      category: 'tires',
      title: 'Tire rotation',
      last_service_odometer: 46100,
      due_odometer: 50000,
      due_date: null,
      status: 'pending',
    };

    database.runSync(
      `INSERT INTO reminders (
        vehicle_id,
        service_log_id,
        category,
        title,
        last_service_odometer,
        due_odometer,
        due_date,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      seedReminder.vehicle_id,
      seedReminder.service_log_id,
      seedReminder.category,
      seedReminder.title,
      seedReminder.last_service_odometer,
      seedReminder.due_odometer,
      seedReminder.due_date,
      seedReminder.status
    );
  });
}

export function initializeDatabase(database: SQLite.SQLiteDatabase = db): void {
  runMigrations(database);
  seedDatabaseIfNeeded(database);
}
