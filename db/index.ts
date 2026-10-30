import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'garage.db';

export const db: SQLite.SQLiteDatabase = SQLite.openDatabaseSync(DATABASE_NAME);
