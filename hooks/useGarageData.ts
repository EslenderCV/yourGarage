import { useCallback, useEffect, useState } from 'react';

import {
  createServiceEntry,
  getActiveVehicle,
  getMonthlySpend,
  getPendingReminder,
  getServiceLogs,
  updateVehicleOdometer,
} from '@/db/repository';
import type {
  CreateServiceEntryInput,
  CreateServiceEntryResult,
  MonthlySpend,
  Reminder,
  ServiceLog,
  Vehicle,
} from '@/types/database';

export type LogServiceParams = Omit<CreateServiceEntryInput, 'vehicleId'>;

export interface GarageData {
  vehicle: Vehicle | null;
  pendingReminder: Reminder | null;
  monthlySpend: MonthlySpend;
  serviceLogs: ServiceLog[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  updateOdometer: (newOdometer: number) => void;
  logService: (params: LogServiceParams) => CreateServiceEntryResult | null;
}

interface GarageState {
  vehicle: Vehicle | null;
  pendingReminder: Reminder | null;
  monthlySpend: MonthlySpend;
  serviceLogs: ServiceLog[];
  isLoading: boolean;
  error: Error | null;
}

type GarageListener = () => void;

const listeners = new Set<GarageListener>();

export function notifyGarageDataChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

function createEmptyMonthlySpend(referenceDate: Date = new Date()): MonthlySpend {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const prevDate = new Date(currentYear, referenceDate.getMonth() - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');

  return {
    currentMonthTotal: 0,
    previousMonthTotal: 0,
    difference: 0,
    currentMonthServiceCount: 0,
    previousMonthServiceCount: 0,
    currentMonthKey: `${currentYear}-${currentMonth}`,
    previousMonthKey: `${prevYear}-${prevMonth}`,
    currency: 'USD',
  };
}

function loadGarageState(): GarageState {
  try {
    const vehicle = getActiveVehicle();

    if (!vehicle) {
      return {
        vehicle: null,
        pendingReminder: null,
        monthlySpend: createEmptyMonthlySpend(),
        serviceLogs: [],
        isLoading: false,
        error: null,
      };
    }

    return {
      vehicle,
      pendingReminder: getPendingReminder(vehicle.id),
      monthlySpend: getMonthlySpend(vehicle.id),
      serviceLogs: getServiceLogs(vehicle.id),
      isLoading: false,
      error: null,
    };
  } catch (err: unknown) {
    const normalizedError =
      err instanceof Error ? err : new Error('Failed to load garage data');

    return {
      vehicle: null,
      pendingReminder: null,
      monthlySpend: createEmptyMonthlySpend(),
      serviceLogs: [],
      isLoading: false,
      error: normalizedError,
    };
  }
}

export function useGarageData(): GarageData {
  const [state, setState] = useState<GarageState>(() => loadGarageState());

  const refresh = useCallback((): void => {
    setState(loadGarageState());
  }, []);

  useEffect(() => {
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);

  const updateOdometer = useCallback(
    (newOdometer: number): void => {
      const activeVehicle = state.vehicle ?? getActiveVehicle();
      if (!activeVehicle) {
        return;
      }

      try {
        updateVehicleOdometer(activeVehicle.id, newOdometer);
        notifyGarageDataChanged();
      } catch (err: unknown) {
        const normalizedError =
          err instanceof Error ? err : new Error('Failed to update odometer');
        setState((prev) => ({
          ...prev,
          error: normalizedError,
        }));
      }
    },
    [state.vehicle]
  );

  const logService = useCallback(
    (params: LogServiceParams): CreateServiceEntryResult | null => {
      const activeVehicle = state.vehicle ?? getActiveVehicle();
      if (!activeVehicle) {
        return null;
      }

      try {
        const created = createServiceEntry({
          ...params,
          vehicleId: activeVehicle.id,
        });
        notifyGarageDataChanged();
        return created;
      } catch (err: unknown) {
        const normalizedError =
          err instanceof Error ? err : new Error('Failed to save service log');
        setState((prev) => ({
          ...prev,
          error: normalizedError,
        }));
        throw normalizedError;
      }
    },
    [state.vehicle]
  );

  return {
    vehicle: state.vehicle,
    pendingReminder: state.pendingReminder,
    monthlySpend: state.monthlySpend,
    serviceLogs: state.serviceLogs,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    updateOdometer,
    logService,
  };
}
