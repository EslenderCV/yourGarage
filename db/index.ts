import * as SQLite from 'expo-sqlite';

import { initializeDatabase } from './migrations';

export const DATABASE_NAME = 'garage.db';

export const db: SQLite.SQLiteDatabase = SQLite.openDatabaseSync(DATABASE_NAME);

// Ensure all migrations and tables run upon opening the database
initializeDatabase(db);
