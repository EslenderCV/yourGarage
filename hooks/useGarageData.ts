import { useCallback, useEffect, useState } from 'react';

import {
  createServiceEntry,
  createVehicle,
  getActiveVehicle,
  getAllVehicles,
  getMonthlySpend,
  getPendingReminder,
  getServiceLogs,
  updateVehicleOdometer,
} from '@/db/repository';
import type {
  CreateServiceEntryInput,
  CreateServiceEntryResult,
  CreateVehicleInput,
  MonthlySpend,
  Reminder,
  ServiceLog,
  Vehicle,
} from '@/types/database';

export type LogServiceParams = Omit<CreateServiceEntryInput, 'vehicleId'>;

export interface GarageData {
  vehicle: Vehicle | null;
  vehicles: Vehicle[];
  pendingReminder: Reminder | null;
  monthlySpend: MonthlySpend;
  serviceLogs: ServiceLog[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  selectVehicle: (vehicleId: number) => void;
  addVehicle: (input: CreateVehicleInput) => Vehicle;
  updateOdometer: (newOdometer: number) => void;
  logService: (params: LogServiceParams) => CreateServiceEntryResult | null;
}

interface GarageState {
  vehicle: Vehicle | null;
  vehicles: Vehicle[];
  pendingReminder: Reminder | null;
  monthlySpend: MonthlySpend;
  serviceLogs: ServiceLog[];
  isLoading: boolean;
  error: Error | null;
}

type GarageListener = () => void;

const listeners = new Set<GarageListener>();
let activeVehicleIdStore: number | null = null;

export function notifyGarageDataChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setActiveVehicleSelection(vehicleId: number): void {
  activeVehicleIdStore = vehicleId;
  notifyGarageDataChanged();
}

function createEmptyMonthlySpend(
  referenceDate: Date = new Date()
): MonthlySpend {
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
    const vehicles = getAllVehicles();
    const vehicle =
      (activeVehicleIdStore !== null
        ? vehicles.find((item) => item.id === activeVehicleIdStore)
        : undefined) ??
      vehicles[0] ??
      getActiveVehicle(activeVehicleIdStore);

    activeVehicleIdStore = vehicle?.id ?? null;

    if (!vehicle) {
      return {
        vehicle: null,
        vehicles,
        pendingReminder: null,
        monthlySpend: createEmptyMonthlySpend(),
        serviceLogs: [],
        isLoading: false,
        error: null,
      };
    }

    return {
      vehicle,
      vehicles,
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
      vehicles: [],
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

  const selectVehicle = useCallback((vehicleId: number): void => {
    setActiveVehicleSelection(vehicleId);
  }, []);

  const addVehicle = useCallback((input: CreateVehicleInput): Vehicle => {
    try {
      const created = createVehicle(input);
      activeVehicleIdStore = created.id;
      notifyGarageDataChanged();
      return created;
    } catch (err: unknown) {
      const normalizedError =
        err instanceof Error ? err : new Error('Failed to create vehicle');
      setState((prev) => ({
        ...prev,
        error: normalizedError,
      }));
      throw normalizedError;
    }
  }, []);

  const updateOdometer = useCallback(
    (newOdometer: number): void => {
      const activeVehicle =
        state.vehicle ?? getActiveVehicle(activeVehicleIdStore);
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
      const activeVehicle =
        state.vehicle ?? getActiveVehicle(activeVehicleIdStore);
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
    vehicles: state.vehicles,
    pendingReminder: state.pendingReminder,
    monthlySpend: state.monthlySpend,
    serviceLogs: state.serviceLogs,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    selectVehicle,
    addVehicle,
    updateOdometer,
    logService,
  };
}
