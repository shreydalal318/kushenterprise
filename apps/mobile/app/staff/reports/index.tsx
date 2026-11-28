import { useState } from 'react';
import { Stack } from 'expo-router';
import { istDateString } from '@kush/core';
import { NotAllowed, Pills } from '@/components/admin/bits';
import { presets, RangePicker, type Range } from '@/components/admin/range';
import { FilesTab, GstTab, MarginTab, SalesTab, TodayTab } from '@/components/admin/report-tabs';
import { Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';

type Tab = 'today' | 'sales' | 'margin' | 'gst' | 'files';

/** The website's Analytics & reports: today's numbers, sales, margins, GST, and the Excel / Tally files. */
export default function Reports() {
  const can = useCan();
  const today = istDateString();
  const [tab, setTab] = useState<Tab>('today');
  const [range, setRange] = useState<Range>(presets(today)[0]![2]);
  const title = <Stack.Screen options={{ title: 'Sales & reports' }} />;
  if (!can('VIEW_ANALYTICS')) return <Screen>{title}<NotAllowed what="see sales and reports" /></Screen>;
  const tabs: [Tab, string][] = [['today', 'Today'], ['sales', 'Sales'], ...(can('VIEW_PRICES_MARGINS') ? [['margin', 'Margins'] as [Tab, string]] : []), ['gst', 'GST'], ['files', 'Downloads']];
  return (
    <Screen>
      {title}
      <Pills value={tab} options={tabs} onChange={setTab} />
      {tab !== 'today' && <RangePicker value={range} onChange={setRange} today={today} />}
      {tab === 'today' && <TodayTab />}
      {tab === 'sales' && <SalesTab r={range} />}
      {tab === 'margin' && <MarginTab r={range} />}
      {tab === 'gst' && <GstTab r={range} />}
      {tab === 'files' && <FilesTab r={range} />}
    </Screen>
  );
}
