import { Check, ChevronDown } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import { useGarageData } from '@/hooks/useGarageData';
import type { ServiceCategory, ServiceLog } from '@/types/database';

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

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  oil: 'Oil',
  brakes: 'Brakes',
  tires: 'Tires',
  coolant: 'Coolant',
  other: 'Other',
};

const ALL_CATEGORIES: readonly ServiceCategory[] = [
  'oil',
  'tires',
  'brakes',
  'coolant',
  'other',
] as const;

const MAX_BAR_HEIGHT = 104;

interface MonthBarBucket {
  yearMonthKey: string;
  year: number;
  monthIndex: number;
  shortLabel: string;
  total: number;
}

interface CategoryBreakdownRow {
  category: ServiceCategory;
  label: string;
  total: number;
  count: number;
  percent: number;
  progressWidth: `${number}%`;
}

function extractYear(isoDate: string): string {
  const year = isoDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
}

function extractMonthIndex(isoDate: string): number {
  const monthPart = isoDate.slice(5, 7);
  const parsed = Number.parseInt(monthPart, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
    ? parsed - 1
    : 0;
}

function formatOdometer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatCompactCurrency(amount: number): string {
  const roundedCents = Math.round(amount * 100) / 100;
  if (Number.isInteger(roundedCents)) {
    return `$${Math.round(roundedCents).toLocaleString('en-US')}`;
  }
  return `$${roundedCents.toFixed(2)}`;
}

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { vehicle, serviceLogs } = useGarageData();

  const availableYears = useMemo<string[]>(() => {
    const yearSet = new Set<string>();
    for (const log of serviceLogs) {
      yearSet.add(extractYear(log.service_date));
    }
    if (yearSet.size === 0) {
      yearSet.add(String(new Date().getFullYear()));
    }
    return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
  }, [serviceLogs]);

  const [userSelectedYear, setUserSelectedYear] = useState<string | null>(null);
  const [isYearMenuOpen, setIsYearMenuOpen] = useState<boolean>(false);

  const selectedYear =
    userSelectedYear && availableYears.includes(userSelectedYear)
      ? userSelectedYear
      : (availableYears[0] ?? String(new Date().getFullYear()));

  const unitLabel = vehicle?.unit ?? 'km';

  const yearLogs = useMemo<ServiceLog[]>(() => {
    return serviceLogs.filter(
      (log) => extractYear(log.service_date) === selectedYear
    );
  }, [serviceLogs, selectedYear]);

  const totalSpent = useMemo<number>(() => {
    return yearLogs.reduce((sum, log) => sum + log.total_cost, 0);
  }, [yearLogs]);

  const { trackedDistance, costPerUnit } = useMemo<{
    trackedDistance: number;
    costPerUnit: number;
  }>(() => {
    if (yearLogs.length === 0) {
      return { trackedDistance: 0, costPerUnit: 0 };
    }

    let minOdometer = yearLogs[0].odometer_at_service;
    let maxLogOdometer = yearLogs[0].odometer_at_service;

    for (const log of yearLogs) {
      if (log.odometer_at_service < minOdometer) {
        minOdometer = log.odometer_at_service;
      }
      if (log.odometer_at_service > maxLogOdometer) {
        maxLogOdometer = log.odometer_at_service;
      }
    }

    const isLatestYear = selectedYear === availableYears[0];
    const referenceOdometer = isLatestYear
      ? Math.max(vehicle?.current_odometer ?? 0, maxLogOdometer)
      : maxLogOdometer;

    const distance = Math.max(0, referenceOdometer - minOdometer);
    const perUnit = distance > 0 ? totalSpent / distance : 0;

    return {
      trackedDistance: distance,
      costPerUnit: perUnit,
    };
  }, [yearLogs, selectedYear, availableYears, vehicle, totalSpent]);

  const { monthBuckets, sixMonthRangeLabel, highlightedBarIndex, maxBarTotal } =
    useMemo<{
      monthBuckets: MonthBarBucket[];
      sixMonthRangeLabel: string;
      highlightedBarIndex: number;
      maxBarTotal: number;
    }>(() => {
      const now = new Date();
      const currentYearNum = now.getFullYear();
      const currentMonthIdx = now.getMonth();
      const selectedYearNum =
        Number.parseInt(selectedYear, 10) || currentYearNum;

      let latestLogMonthIdx = -1;
      for (const log of yearLogs) {
        const mIdx = extractMonthIndex(log.service_date);
        if (mIdx > latestLogMonthIdx) {
          latestLogMonthIdx = mIdx;
        }
      }

      const endMonthIndex =
        selectedYearNum === currentYearNum
          ? Math.max(currentMonthIdx, latestLogMonthIdx)
          : latestLogMonthIdx >= 0
            ? Math.max(5, latestLogMonthIdx)
            : 11;

      const spendByYearMonth = new Map<string, number>();
      for (const log of serviceLogs) {
        const key = log.service_date.slice(0, 7);
        spendByYearMonth.set(
          key,
          (spendByYearMonth.get(key) ?? 0) + log.total_cost
        );
      }

      const buckets: MonthBarBucket[] = [];
      for (let offset = 5; offset >= 0; offset -= 1) {
        const bucketDate = new Date(
          selectedYearNum,
          endMonthIndex - offset,
          1
        );
        const y = bucketDate.getFullYear();
        const m = bucketDate.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;

        buckets.push({
          yearMonthKey: key,
          year: y,
          monthIndex: m,
          shortLabel: MONTH_NAMES_SHORT[m],
          total: spendByYearMonth.get(key) ?? 0,
        });
      }

      const first = buckets[0];
      const last = buckets[buckets.length - 1];
      const rangeLabel =
        first && last
          ? first.year === last.year
            ? `${first.shortLabel} \u2013 ${last.shortLabel} ${last.year}`
            : `${first.shortLabel} ${first.year} \u2013 ${last.shortLabel} ${last.year}`
          : '';

      let maxTotal = 0;
      let highestIndex = -1;
      for (let i = 0; i < buckets.length; i += 1) {
        if (buckets[i].total > maxTotal) {
          maxTotal = buckets[i].total;
          highestIndex = i;
        }
      }

      const lastBucketIndex = buckets.length - 1;
      const activeHighlightIndex =
        lastBucketIndex >= 0 && buckets[lastBucketIndex].total > 0
          ? lastBucketIndex
          : highestIndex;

      return {
        monthBuckets: buckets,
        sixMonthRangeLabel: rangeLabel,
        highlightedBarIndex: activeHighlightIndex,
        maxBarTotal: maxTotal,
      };
    }, [selectedYear, yearLogs, serviceLogs]);

  const categoryBreakdown = useMemo<CategoryBreakdownRow[]>(() => {
    if (yearLogs.length === 0 || totalSpent <= 0) {
      return [];
    }

    const totalsMap = new Map<
      ServiceCategory,
      { total: number; count: number }
    >();

    for (const category of ALL_CATEGORIES) {
      totalsMap.set(category, { total: 0, count: 0 });
    }

    for (const log of yearLogs) {
      const current = totalsMap.get(log.category) ?? { total: 0, count: 0 };
      totalsMap.set(log.category, {
        total: current.total + log.total_cost,
        count: current.count + 1,
      });
    }

    const activeCategories = ALL_CATEGORIES.map((category) => {
      const stats = totalsMap.get(category) ?? { total: 0, count: 0 };
      return {
        category,
        label: CATEGORY_LABELS[category],
        total: stats.total,
        count: stats.count,
      };
    })
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total || b.count - a.count);

    let runningPercentSum = 0;

    return activeCategories.map((item, idx) => {
      const isLast = idx === activeCategories.length - 1;
      const percent = isLast
        ? Math.max(0, Math.min(100, 100 - runningPercentSum))
        : Math.round((item.total / totalSpent) * 100);

      runningPercentSum += percent;

      return {
        category: item.category,
        label: item.label,
        total: item.total,
        count: item.count,
        percent,
        progressWidth: `${percent}%`,
      };
    });
  }, [yearLogs, totalSpent]);

  const serviceCountSubtitle = `${yearLogs.length} ${
    yearLogs.length === 1 ? 'service' : 'services'
  }`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.headerSection}>
          <Text style={styles.headerEyebrow}>ANALYTICS</Text>
          <Text style={styles.headerTitle}>Spend &amp; insights</Text>

          <Pressable
            accessibilityLabel={`Selected year ${selectedYear}`}
            accessibilityRole="button"
            onPress={() => setIsYearMenuOpen((prev) => !prev)}
            style={({ pressed }) => [
              styles.yearPill,
              pressed && styles.pressedOpacity,
            ]}
          >
            <Text style={styles.yearPillText}>{selectedYear}</Text>
            <ChevronDown
              color={Colors.textSecondary}
              size={15}
              strokeWidth={2}
            />
          </Pressable>
        </View>

        {isYearMenuOpen ? (
          <View style={styles.yearDropdownCard}>
            {availableYears.map((year) => {
              const isSelected = year === selectedYear;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={year}
                  onPress={() => {
                    setUserSelectedYear(year);
                    setIsYearMenuOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.yearDropdownItem,
                    isSelected && styles.yearDropdownItemActive,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <Text
                    style={[
                      styles.yearDropdownText,
                      isSelected && styles.yearDropdownTextActive,
                    ]}
                  >
                    {year}
                  </Text>
                  {isSelected ? (
                    <Check color={Colors.primary} size={15} strokeWidth={2.4} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryEyebrow}>TOTAL SPENT</Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              numberOfLines={1}
              style={styles.summaryMonoValue}
            >
              {formatCurrency(totalSpent)}
            </Text>
            <Text numberOfLines={1} style={styles.summarySubtitle}>
              {serviceCountSubtitle}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryEyebrow}>
              COST PER {unitLabel.toUpperCase()}
            </Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              numberOfLines={1}
              style={styles.summaryMonoValue}
            >
              {formatCurrency(costPerUnit)}
              <Text style={styles.summaryUnitSuffix}>{`/${unitLabel}`}</Text>
            </Text>
            <Text numberOfLines={1} style={styles.summarySubtitle}>
              {formatOdometer(trackedDistance)} {unitLabel} tracked
            </Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Monthly spend</Text>
            <Text style={styles.cardSubtitleRight}>{sixMonthRangeLabel}</Text>
          </View>

          <View style={styles.barChartRow}>
            {monthBuckets.map((bucket, index) => {
              const hasSpend = bucket.total > 0;
              const isHighlighted = index === highlightedBarIndex && hasSpend;
              const barHeight =
                hasSpend && maxBarTotal > 0
                  ? Math.max(
                      18,
                      Math.round((bucket.total / maxBarTotal) * MAX_BAR_HEIGHT)
                    )
                  : 3;

              return (
                <View key={bucket.yearMonthKey} style={styles.barColumn}>
                  <View style={styles.barStage}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.barAmountLabel,
                        isHighlighted
                          ? styles.barAmountLabelActive
                          : styles.barAmountLabelMuted,
                      ]}
                    >
                      {formatCompactCurrency(bucket.total)}
                    </Text>

                    <View
                      style={[
                        hasSpend ? styles.barFill : styles.barBaseline,
                        { height: barHeight },
                        isHighlighted
                          ? styles.barFillHighlighted
                          : styles.barFillMuted,
                      ]}
                    />
                  </View>

                  <Text
                    style={[
                      styles.barMonthLabel,
                      isHighlighted && styles.barMonthLabelActive,
                    ]}
                  >
                    {bucket.shortLabel}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownCardTitle}>Category breakdown</Text>

          {categoryBreakdown.length > 0 ? (
            <View style={styles.breakdownList}>
              {categoryBreakdown.map((row) => (
                <View key={row.category} style={styles.breakdownRow}>
                  <View style={styles.breakdownTopRow}>
                    <Text style={styles.breakdownCategoryLabel}>
                      {row.label}
                    </Text>

                    <Text style={styles.breakdownValueMeta}>
                      {`${formatCompactCurrency(row.total)}  ·  ${row.percent}%`}
                    </Text>
                  </View>

                  <View style={styles.breakdownTrack}>
                    <View
                      style={[
                        styles.breakdownFill,
                        { width: row.progressWidth },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyBreakdownText}>
              No service spend recorded for {selectedYear}.
            </Text>
          )}
        </View>
      </ScrollView>
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
    paddingBottom: 32,
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
  yearPill: {
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
  yearPillText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
  },
  yearDropdownCard: {
    marginTop: -8,
    marginBottom: 16,
    alignSelf: 'flex-start',
    minWidth: 124,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 6,
    gap: 2,
  },
  yearDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 12,
  },
  yearDropdownItemActive: {
    backgroundColor: Colors.surfaceRecessed,
  },
  yearDropdownText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  yearDropdownTextActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
  },
  summaryEyebrow: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  summaryMonoValue: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  summaryUnitSuffix: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0,
  },
  summarySubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '400',
  },
  chartCard: {
    marginTop: 16,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '700',
  },
  cardSubtitleRight: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '500',
  },
  barChartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barStage: {
    width: '100%',
    height: 132,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barAmountLabel: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    marginBottom: 8,
  },
  barAmountLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  barAmountLabelMuted: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  barFill: {
    width: '72%',
    maxWidth: 34,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  barBaseline: {
    width: '72%',
    maxWidth: 34,
    borderRadius: 2,
  },
  barFillHighlighted: {
    backgroundColor: Colors.primary,
  },
  barFillMuted: {
    backgroundColor: Colors.border,
  },
  barMonthLabel: {
    marginTop: 10,
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '400',
  },
  barMonthLabelActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  breakdownCard: {
    marginTop: 16,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
  },
  breakdownCardTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  breakdownList: {
    gap: 16,
  },
  breakdownRow: {
    flexDirection: 'column',
  },
  breakdownTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  breakdownCategoryLabel: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
  },
  breakdownValueMeta: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
    fontWeight: '500',
  },
  breakdownTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.surfaceRecessed,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  emptyBreakdownText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  pressedOpacity: {
    opacity: 0.75,
  },
});
