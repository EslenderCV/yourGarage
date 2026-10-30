import { router } from 'expo-router';
import {
  ChevronDown,
  CircleDot,
  Disc3,
  Droplet,
  ReceiptText,
  Search,
  ThermometerSnowflake,
  Wrench,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SwitchVehicleModal } from '@/components/SwitchVehicleModal';
import { Colors, Fonts } from '@/constants/theme';
import { useGarageData } from '@/hooks/useGarageData';
import type { ServiceCategory, ServiceLog } from '@/types/database';

type CategoryFilter = 'all' | 'oil' | 'brakes' | 'tires' | 'coolant';

interface FilterOption {
  key: CategoryFilter;
  label: string;
}

interface YearGroup {
  year: string;
  logs: ServiceLog[];
}

const FILTER_OPTIONS: readonly FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'oil', label: 'Oil' },
  { key: 'brakes', label: 'Brakes' },
  { key: 'tires', label: 'Tires' },
  { key: 'coolant', label: 'Coolant' },
] as const;

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatOdometer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function extractYear(isoDate: string): string {
  const year = isoDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
}

function formatServiceDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) {
    return isoDate;
  }
  const [year, monthStr, dayStr] = parts;
  const monthNumber = Number.parseInt(monthStr, 10);
  const dayNumber = Number.parseInt(dayStr, 10);
  if (
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12 ||
    !Number.isInteger(dayNumber)
  ) {
    return isoDate;
  }
  const dayPadded = String(dayNumber).padStart(2, '0');
  return `${dayPadded} ${MONTH_NAMES_SHORT[monthNumber - 1]} ${year}`;
}

function ServiceCategoryIcon({ category }: { category: ServiceCategory }) {
  const iconProps = {
    color: Colors.textSecondary,
    size: 17,
    strokeWidth: 1.9,
  } as const;

  switch (category) {
    case 'oil':
      return <Droplet {...iconProps} />;
    case 'tires':
      return <CircleDot {...iconProps} />;
    case 'brakes':
      return <Disc3 {...iconProps} />;
    case 'coolant':
      return <ThermometerSnowflake {...iconProps} />;
    case 'other':
      return <Wrench {...iconProps} />;
  }
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { vehicle, vehicles, serviceLogs, selectVehicle, addVehicle } =
    useGarageData();

  const [isSwitchVehicleOpen, setIsSwitchVehicleOpen] =
    useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>('all');

  const unitLabel = vehicle?.unit ?? 'km';
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredLogs = useMemo<ServiceLog[]>(() => {
    return serviceLogs.filter((log) => {
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const titleMatch = log.title.toLowerCase().includes(normalizedQuery);
      const shopMatch = (log.shop_name ?? '')
        .toLowerCase()
        .includes(normalizedQuery);
      const notesMatch = (log.notes ?? '')
        .toLowerCase()
        .includes(normalizedQuery);

      return titleMatch || shopMatch || notesMatch;
    });
  }, [serviceLogs, selectedCategory, normalizedQuery]);

  const yearGroups = useMemo<YearGroup[]>(() => {
    const groupsMap = new Map<string, ServiceLog[]>();

    for (const log of filteredLogs) {
      const year = extractYear(log.service_date);
      const existing = groupsMap.get(year);
      if (existing) {
        existing.push(log);
      } else {
        groupsMap.set(year, [log]);
      }
    }

    return Array.from(groupsMap.entries())
      .sort(([yearA], [yearB]) => yearB.localeCompare(yearA))
      .map(([year, logs]) => ({ year, logs }));
  }, [filteredLogs]);

  const latestOverallYear = useMemo<string>(() => {
    if (serviceLogs.length === 0) {
      return String(new Date().getFullYear());
    }
    let maxYear = extractYear(serviceLogs[0].service_date);
    for (const log of serviceLogs) {
      const y = extractYear(log.service_date);
      if (y > maxYear) {
        maxYear = y;
      }
    }
    return maxYear;
  }, [serviceLogs]);

  const summaryYear = yearGroups[0]?.year ?? latestOverallYear;

  const summaryYearTotal = useMemo<number>(() => {
    return filteredLogs.reduce((sum, log) => {
      return extractYear(log.service_date) === summaryYear
        ? sum + log.total_cost
        : sum;
    }, 0);
  }, [filteredLogs, summaryYear]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.headerSection}>
          <Text style={styles.headerEyebrow}>SERVICE RECORDS</Text>
          <Text style={styles.headerTitle}>Service history</Text>

          <Pressable
            accessibilityHint="Opens garage sheet to switch or add vehicles"
            accessibilityLabel={`Active vehicle ${vehicle?.name ?? '2021 VW Golf'}`}
            accessibilityRole="button"
            onPress={() => setIsSwitchVehicleOpen(true)}
            style={({ pressed }) => [
              styles.vehiclePill,
              pressed && styles.pressedOpacity,
            ]}
          >
            <Text numberOfLines={1} style={styles.vehiclePillText}>
              {vehicle?.name ?? '2021 VW Golf'}
            </Text>
            <ChevronDown
              color={Colors.textSecondary}
              size={15}
              strokeWidth={2}
            />
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <Search color={Colors.textSecondary} size={17} strokeWidth={2} />
          <TextInput
            accessibilityLabel="Search service records"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchQuery}
            placeholder="Search service records"
            placeholderTextColor={Colors.textSecondary}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setSearchQuery('')}
              style={({ pressed }) => [
                styles.clearSearchButton,
                pressed && styles.pressedOpacity,
              ]}
            >
              <X color={Colors.textSecondary} size={15} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.filterPillsRow}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScrollView}
        >
          {FILTER_OPTIONS.map((option) => {
            const isActive = selectedCategory === option.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                key={option.key}
                onPress={() => setSelectedCategory(option.key)}
                style={({ pressed }) => [
                  styles.filterPill,
                  isActive ? styles.filterPillActive : styles.filterPillInactive,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isActive
                      ? styles.filterPillTextActive
                      : styles.filterPillTextInactive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {yearGroups.length > 0 ? (
          yearGroups.map((group, groupIndex) => {
            const countLabel = `${group.logs.length} ${
              group.logs.length === 1 ? 'service' : 'services'
            }`;

            return (
              <View
                key={group.year}
                style={[
                  styles.yearGroupSection,
                  groupIndex > 0 && styles.yearGroupSpacing,
                ]}
              >
                <View style={styles.yearHeaderRow}>
                  <Text style={styles.yearHeaderTitle}>{group.year}</Text>
                  <Text style={styles.yearHeaderCount}>{countLabel}</Text>
                </View>

                <View style={styles.timelineList}>
                  {group.logs.map((log, index) => {
                    const isLast = index === group.logs.length - 1;

                    return (
                      <Pressable
                        accessibilityLabel={`${log.title}, ${formatServiceDate(log.service_date)}, ${formatCurrency(log.total_cost)}`}
                        accessibilityRole="button"
                        key={log.id}
                        onPress={() =>
                          router.push({
                            pathname: '/service/[id]',
                            params: { id: String(log.id) },
                          })
                        }
                        style={({ pressed }) => [
                          styles.timelineItem,
                          pressed && styles.pressedOpacity,
                        ]}
                      >
                        <View style={styles.timelineRail}>
                          <View style={styles.timelineIconCircle}>
                            <ServiceCategoryIcon category={log.category} />
                          </View>
                          {!isLast ? (
                            <View style={styles.timelineConnector} />
                          ) : null}
                        </View>

                        <View
                          style={[
                            styles.timelineContent,
                            !isLast && styles.timelineContentSpacing,
                          ]}
                        >
                          <View style={styles.timelineTopRow}>
                            <Text numberOfLines={1} style={styles.timelineTitle}>
                              {log.title}
                            </Text>
                            <Text style={styles.timelinePrice}>
                              {formatCurrency(log.total_cost)}
                            </Text>
                          </View>

                          <Text style={styles.timelineMeta}>
                            {formatServiceDate(log.service_date)}
                            {' · '}
                            <Text style={styles.timelineMetaMono}>
                              {formatOdometer(log.odometer_at_service)}{' '}
                              {unitLabel}
                            </Text>
                          </Text>

                          {log.receipt_uri ? (
                            <View style={styles.receiptBadge}>
                              <ReceiptText
                                color={Colors.textSecondary}
                                size={12}
                                strokeWidth={2}
                              />
                              <Text style={styles.receiptBadgeText}>
                                Receipt
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyStateBox}>
            <Text style={styles.emptyStateTitle}>
              {serviceLogs.length === 0
                ? 'No service records yet'
                : 'No matching service records'}
            </Text>
            <Text style={styles.emptyStateSubtitle}>
              {serviceLogs.length === 0
                ? 'Service entries logged for this vehicle will appear here.'
                : 'Try adjusting your search query or category filter.'}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.summaryFooterContainer}>
        <View style={styles.summaryFooter}>
          <Text style={styles.summaryFooterLabel}>
            Total spent in {summaryYear}
          </Text>
          <Text style={styles.summaryFooterAmount}>
            {formatCurrency(summaryYearTotal)}
          </Text>
        </View>
      </View>

      <SwitchVehicleModal
        activeVehicleId={vehicle?.id ?? null}
        onAddVehicle={addVehicle}
        onClose={() => setIsSwitchVehicleOpen(false)}
        onSelectVehicle={selectVehicle}
        vehicles={vehicles}
        visible={isSwitchVehicleOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  headerSection: {
    marginBottom: 18,
  },
  headerEyebrow: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  vehiclePill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  vehiclePillText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 220,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRecessed,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearSearchButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterScrollView: {
    marginTop: 12,
    marginHorizontal: -20,
    backgroundColor: Colors.background,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  filterPill: {
    height: 34,
    paddingHorizontal: 15,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: Colors.alertBackground,
    borderColor: Colors.primary,
  },
  filterPillInactive: {
    backgroundColor: Colors.surfaceRecessed,
    borderColor: Colors.border,
  },
  filterPillText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  filterPillTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  filterPillTextInactive: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  yearGroupSection: {
    marginTop: 22,
  },
  yearGroupSpacing: {
    marginTop: 26,
  },
  yearHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  yearHeaderTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
  },
  yearHeaderCount: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  timelineList: {
    flexDirection: 'column',
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timelineRail: {
    width: 36,
    alignItems: 'center',
    marginRight: 12,
  },
  timelineIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineConnector: {
    flex: 1,
    width: 1,
    backgroundColor: Colors.border,
    minHeight: 16,
  },
  timelineContent: {
    flex: 1,
    paddingTop: 2,
  },
  timelineContentSpacing: {
    paddingBottom: 24,
  },
  timelineTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timelineTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },
  timelinePrice: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 15,
    fontWeight: '500',
  },
  timelineMeta: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 4,
  },
  timelineMetaMono: {
    fontFamily: Fonts.mono,
  },
  receiptBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  receiptBadgeText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '500',
  },
  emptyStateBox: {
    marginTop: 28,
    borderRadius: 16,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    textAlign: 'center',
  },
  summaryFooterContainer: {
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  summaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 14,
  },
  summaryFooterLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  summaryFooterAmount: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 16,
    fontWeight: '700',
  },
  pressedOpacity: {
    opacity: 0.75,
  },
});
