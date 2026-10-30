export type VehicleType = 'car' | 'motorcycle';

export type OdometerUnit = 'km' | 'mi';

export type ServiceCategory = 'oil' | 'brakes' | 'tires' | 'coolant' | 'other';

export type ReminderStatus = 'pending' | 'completed';

export interface Vehicle {
  id: number;
  name: string;
  type: VehicleType;
  current_odometer: number;
  unit: OdometerUnit;
  subtitle: string | null;
  image_uri: string | null;
  created_at: string;
}

export interface ServiceLog {
  id: number;
  vehicle_id: number;
  category: ServiceCategory;
  title: string;
  odometer_at_service: number;
  total_cost: number;
  currency: string;
  shop_name: string | null;
  notes: string | null;
  receipt_uri: string | null;
  service_date: string;
}

export interface Reminder {
  id: number;
  vehicle_id: number;
  service_log_id: number | null;
  category: ServiceCategory;
  title: string;
  last_service_odometer: number;
  due_odometer: number | null;
  due_date: string | null;
  status: ReminderStatus;
}

export interface MonthlySpend {
  currentMonthTotal: number;
  previousMonthTotal: number;
  difference: number;
  currentMonthServiceCount: number;
  previousMonthServiceCount: number;
  currentMonthKey: string;
  previousMonthKey: string;
  currency: string;
}

export interface CreateServiceEntryInput {
  vehicleId: number;
  category: ServiceCategory;
  title?: string;
  odometerAtService: number;
  totalCost: number;
  currency?: string;
  shopName?: string | null;
  notes?: string | null;
  receiptUri?: string | null;
  serviceDate: string;
  dueOdometer?: number | null;
  dueDate?: string | null;
}

export interface CreateServiceEntryResult {
  serviceLog: ServiceLog;
  vehicle: Vehicle | null;
  reminder: Reminder | null;
}

export interface CreateVehicleInput {
  name: string;
  type: VehicleType;
  current_odometer: number;
  unit?: OdometerUnit;
  subtitle?: string | null;
  image_uri?: string | null;
}
