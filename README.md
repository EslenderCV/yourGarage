# yourGarage 🚗🔧

A modern, offline-first vehicle maintenance and expense tracking mobile app built with **React Native**, **Expo SDK 58**, and **Expo Router**. Designed pixel-for-pixel against high-fidelity Figma specs with a unified dark palette (`#171A20`), real-time SQLite persistence, and local push notifications.

---

## ✨ Features

- **Garage Dashboard (`app/(tabs)/index.tsx`)**:
  - Active vehicle overview with live odometer badge and editable mileage.
  - Urgent "Next Service Due" amber alert card with dynamic progress tracking and remaining distance calculation.
  - Real-time monthly spend metric box and recent service history timeline with receipt badges.
  - Floating Action Button (FAB) for fast one-tap service logging.
  - Top header reminder bell sheet (`components/RemindersModal.tsx`) showing active upcoming maintenance alerts with immediate test notification trigger.

- **Quick Log Service Modal (`components/QuickLogServiceModal.tsx`)**:
  - Bottom sheet modal supporting quick categorization (`Oil`, `Brakes`, `Tires`, `Coolant`, `Other`).
  - Monospace numerical inputs for odometer and cost.
  - Receipt photo capture via Camera or Photo Library (`expo-image-picker`) with persistent file system storage.
  - Predictive future reminder chips (`+5,000 km`, `6 months`) that automatically schedule local push notifications.

- **Service Detail Screen & Lightbox (`app/service/[id].tsx`)**:
  - In-depth service breakdown displaying odometer, cost, mechanic notes, and shop attribution.
  - Receipt preview card with inline zoom pill and full-screen pinch/tap-to-zoom Lightbox viewer.
  - Native system share sheet export (`expo-sharing`) for receipt images.
  - Secure service deletion that cleans up database records and cancels scheduled notifications.

- **Multi-Vehicle Garage (`components/SwitchVehicleModal.tsx`)**:
  - Switch active vehicles seamlessly across all tabs with reactive updates via `useGarageData`.
  - Add new vehicles with custom odometer, mileage units (`km` / `mi`), notes, and vehicle avatars.

- **History & Analytics Tabs**:
  - **Service History (`app/(tabs)/history.tsx`)**: Real-time text search, category filter pills (`All`, `Oil`, `Brakes`, `Tires`, `Coolant`), grouped annual timelines, and yearly spend footer totals.
  - **Spend Insights (`app/(tabs)/insights.tsx`)**: Total expenditure, cost-per-kilometer analytics, 6-month monthly spend bar chart, and category percentage breakdown.

---

## 🛠️ Architecture & Tech Stack

```
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx         # 3-tab navigation (Garage, History, Insights)
│   │   ├── index.tsx           # Garage Dashboard
│   │   ├── history.tsx         # Searchable Service History timeline
│   │   └── insights.tsx        # Spend analytics & breakdown charts
│   ├── service/
│   │   └── [id].tsx            # Dynamic route for service record detail
│   └── _layout.tsx             # Root layout, SQLite initialization, notification channel
├── components/
│   ├── QuickLogServiceModal.tsx # Service logging bottom sheet with receipt camera
│   ├── SwitchVehicleModal.tsx  # Multi-vehicle selector and creator sheet
│   └── RemindersModal.tsx      # Upcoming notifications and test trigger sheet
├── constants/
│   └── theme.ts                # Design tokens (Background #171A20, Card #21252E, Amber #F59E0B)
├── db/
│   ├── index.ts                # expo-sqlite database instance
│   ├── migrations.ts           # Schema versioning & seed data (VW Golf & Kia K5)
│   └── repository.ts           # Type-safe SQL queries & transactions
├── hooks/
│   └── useGarageData.ts        # Central reactive state store with event notification
└── utils/
    ├── notifications.ts        # expo-notifications scheduling, permissions & channels
    └── receiptStorage.ts       # expo-file-system receipt persistence & expo-sharing
```

- **Framework**: React Native 0.88 / Expo SDK 58 (Expo Router v5)
- **Database**: `expo-sqlite` (WAL journal mode, foreign key cascades)
- **Icons**: `lucide-react-native`
- **Images & Photos**: `expo-image`, `expo-image-picker`, `expo-file-system`
- **Sharing**: `expo-sharing`
- **Notifications**: `expo-notifications` (channel configuration, date-based local triggers)

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm or bun
- Android Studio / Xcode (optional for local emulation) or Expo Go

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Start the local Metro development server:
   ```bash
   npx expo start
   ```

3. Run on your target platform:
   - Press `a` in the terminal to launch on an Android emulator / connected device.
   - Press `i` to launch on an iOS simulator.
   - Scan the QR code using Expo Go or a development build.

---

## 🧪 Code Quality & Verification

Run strict static analysis and type checks:

```bash
# Verify TypeScript strict mode (0 errors)
npx tsc --noEmit

# Run ESLint across all source files
npx expo lint
```

---

## 📦 Building with EAS

This project is configured with `eas.json` for cloud builds:

- **Development Build**:
  ```bash
  npx eas-cli build --profile development --platform android
  ```
- **Preview Standalone APK** (test directly on any Android device):
  ```bash
  npx eas-cli build --profile preview --platform android
  ```
- **Production Build**:
  ```bash
  npx eas-cli build --profile production --platform all
  ```
