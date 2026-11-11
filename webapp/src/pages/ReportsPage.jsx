import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { Button, EmptyState } from '../components/UI.jsx';
import { downloadReport, getReport } from '../lib/commerceApi.js';

const periods = ['week', 'month', 'year'];
const statusColors = { completed: '#3b82f6', preparing: '#22c5e8', pending: '#d9a441', cancelled: '#747d8b', ready: '#8b9cff' };

function selectionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const period = periods.includes(params.get('period')) ? params.get('period') : 'month';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : undefined;
  return { period, date };
}

function money(value) {
  const amount = Number(value);
  return `₱${Number.isFinite(amount) ? amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '0'}`;
}

function integer(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count.toLocaleString('en-PH') : '0';
}

function percentage(value, digits = 1) {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toFixed(digits) : '0.0'}%`;
}

function plural(value, singular, pluralValue = `${singular}s`) {
  return `${integer(value)} ${Number(value) === 1 ? singular : pluralValue}`;
}

function dayLabel(value, year) {
  if (!value) return '';
  const date = new Date(`${value}${value.length === 7 ? '-01' : ''}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-PH', year ? { month: 'short' } : { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

function duration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const minutes = Math.round(Number(seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours) return `${hours} h ${remaining} min`;
  return `${remaining} min`;
}

function Card({ title, subtitle, className = '', children, empty = false, insight }) {
  return <section className={`panel reports-card ${className}`}>
    <header className="reports-card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></header>
    {empty ? <div className="reports-empty"><span>No orders in this period</span></div> : children}
    {!empty && insight && <p className="reports-insight"><b>INSIGHT</b><span>{insight}</span></p>}
  </section>;
}

function SkeletonCard({ className = '' }) {
  return <section className={`panel reports-card reports-skeleton ${className}`} aria-label="Loading report">
    <i /><i /><i /><i />
  </section>;
}

function Stat({ title, value, note, accent = false, icon }) {
  return <article className={`panel reports-stat ${accent ? 'reports-stat-accent' : ''}`}>
    <div className="reports-stat-label"><span>{title}</span><Icon name={icon} size={16} /></div>
    <strong>{value}</strong><small>{note}</small>
  </article>;
}

function AreaChart({ rows, year }) {
  const width = 720;
  const height = 190;
  const padX = 12;
  const padY = 14;
  const max = Math.max(1000, ...rows.map((row) => Number(row.revenue) || 0));
  const roundedMax = Math.ceil(max / 1000) * 1000;
  const coords = rows.map((row, index) => {
    const x = rows.length <= 1 ? width / 2 : padX + (index / (rows.length - 1)) * (width - padX * 2);
    const y = height - padY - ((Number(row.revenue) || 0) / roundedMax) * (height - padY * 2);
    return { ...row, x, y };
  });
  const path = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = `${path} L ${coords.at(-1)?.x ?? width / 2} ${height - padY} L ${coords[0]?.x ?? width / 2} ${height - padY} Z`;
  const peak = coords.reduce((best, point) => Number(point.revenue) > Number(best?.revenue ?? -1) ? point : best, null);
  const labels = [...new Set([0, Math.floor((rows.length - 1) / 3), Math.floor(2 * (rows.length - 1) / 3), rows.length - 1])]
    .map((index) => rows[index])
    .filter(Boolean);

  return <div className="reports-chart">
    <div className="reports-chart-y">
      {[roundedMax, roundedMax * 0.66, roundedMax * 0.33, 0].map((value) => <span key={value}>{money(value)}</span>)}
    </div>
    <div className="reports-chart-main">
      <div className="reports-chart-grid"><i /><i /><i /><i /></div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Revenue over time">
        <defs><linearGradient id="reports-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".34" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#reports-area-fill)" />
        <path d={path} fill="none" stroke="#5b9aff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {coords.map((point) => <circle key={point.date} tabIndex="0" aria-label={`${dayLabel(point.date, year)}: ${money(point.revenue)}`} cx={point.x} cy={point.y} r="3" fill="#22c5e8" stroke="#151a20" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{`${dayLabel(point.date, year)}: ${money(point.revenue)}`}</title></circle>)}
        {peak && Number(peak.revenue) > 0 && <g className="reports-peak"><circle tabIndex="0" aria-label={`Peak ${money(peak.revenue)} on ${dayLabel(peak.date, year)}`} cx={peak.x} cy={peak.y} r="5"><title>{`Peak ${money(peak.revenue)} · ${dayLabel(peak.date, year)}`}</title></circle></g>}
      </svg>
      <div className="reports-chart-x">{labels.map((row) => <span key={row.date}>{dayLabel(row.date, year)}</span>)}</div>
    </div>
  </div>;
}

function Donut({ rows, total, centerLabel, centerValue }) {
  const circumference = 2 * Math.PI * 43;
  let offset = 0;
  return <div className="reports-donut-layout">
    <div className="reports-donut">
      <svg viewBox="0 0 100 100" role="img" aria-label={centerLabel}>
        <circle cx="50" cy="50" r="43" fill="none" stroke="#303640" strokeWidth="11" />
        {total > 0 && rows.map((row, index) => {
          const share = Math.max(0, Number(row.percent) || 0);
          const dash = (share / 100) * circumference;
          const segment = <circle key={row.key} tabIndex="0" aria-label={`${row.label}: ${integer(row.count)} (${percentage(share)})`} cx="50" cy="50" r="43" fill="none" stroke={row.color || ['#3b82f6', '#22c5e8', '#d9a441'][index % 3]} strokeWidth="11" strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)"><title>{`${row.label}: ${integer(row.count)} (${percentage(share)})`}</title></circle>;
          offset += dash;
          return segment;
        })}
      </svg>
      <div><strong>{centerValue}</strong><span>{centerLabel}</span></div>
    </div>
    <div className="reports-donut-legend">{rows.map((row, index) => <div key={row.key}><i style={{ background: row.color || ['#3b82f6', '#22c5e8', '#d9a441'][index % 3] }} /><span>{row.label}</span><b>{integer(row.count)}</b><small>{percentage(row.percent, 0)}</small></div>)}</div>
  </div>;
}

function Bars({ rows, valueKey, formatter = integer, colorFor }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey]) || 0));
  return <div className="reports-bars">{rows.map((row) => {
    const value = Number(row[valueKey]) || 0;
    return <div className="reports-bar-row" key={row.key}>
      <span>{row.label}</span><div><i style={{ width: `${value ? Math.max(2, (value / max) * 100) : 0}%`, background: colorFor?.(row) || '#3b82f6' }} /></div><b>{formatter(value)}</b>
    </div>;
  })}</div>;
}

function ReportsContent({ data, onPeriod, onPrint, onExport, exporting }) {
  const period = data.period;
  const kpis = data.kpis;
  const empty = Number(kpis.orders.placed) === 0;
  const dailyRows = data.dailySeries;
  const totalPaid = Number(kpis.paidOrders.count) || 0;
  const methodRows = data.paymentMethods.map((item) => ({
    key: item.method, label: item.label, count: item.count, percent: item.percent,
  }));
  const fulfillmentRows = [
    { key: 'delivery', label: 'Delivery', count: data.deliveryVsPickup.delivery, percent: data.deliveryVsPickup.deliveryPercent, color: '#3b82f6' },
    { key: 'pickup', label: 'Pickup', count: data.deliveryVsPickup.pickup, percent: data.deliveryVsPickup.pickupPercent, color: '#d9a441' },
  ];
  const statuses = data.ordersByStatus.map((item) => ({
    key: item.status,
    label: item.status[0].toUpperCase() + item.status.slice(1),
    count: item.count,
  }));
  const categories = data.salesByCategory.map((item) => ({
    key: item.category, label: item.category, revenue: item.revenue,
  }));
  const periodLabel = period.label;
  const previousLabel = period.type === 'year' ? period.start.slice(0, 4) - 1 : period.type === 'month'
    ? new Date(`${period.previousStart}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })
    : `${period.previousStart} – ${period.previousEnd}`;
  const changeNote = (change) => change == null
    ? 'No data last period'
    : `${Number(change) > 0 ? '+' : ''}${percentage(change)} vs ${previousLabel}`;
  const review = data.paymentReview;
  const reviewedCount = Number(review.approved) + Number(review.rejected);

  return <div className="reports-page">
    <header className="reports-header">
      <div><h1>Reports</h1><p>Sales, payments and stock for {periodLabel}</p></div>
      <div className="reports-actions">
        <div className="reports-period" role="group" aria-label="Report period">{periods.map((item) => <button key={item} aria-pressed={period.type === item} className={period.type === item ? 'is-selected' : ''} onClick={() => onPeriod(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <Button variant="secondary" disabled={exporting} onClick={onExport}><Icon name="download" size={14} />{exporting ? 'Exporting…' : 'Export CSV'}</Button>
        <Button variant="secondary" onClick={onPrint}>Print</Button>
      </div>
    </header>

    <div className="reports-stats">
      <Stat title="Revenue" value={money(kpis.revenue.current)} note={changeNote(kpis.revenue.changePercent)} accent icon="chart" />
      <Stat title="Orders" value={integer(kpis.orders.placed)} note={`${plural(kpis.orders.placed, 'order', 'orders')} placed · ${plural(kpis.orders.cancelled, 'cancelled order', 'cancelled orders')}`} icon="orders" />
      <Stat title="Average order" value={money(kpis.averageOrder.current)} note={changeNote(kpis.averageOrder.changePercent)} icon="cart" />
      <Stat title="Cancellation rate" value={percentage(kpis.cancellationRate.percent)} note={`${integer(kpis.cancellationRate.cancelled)} of ${integer(kpis.cancellationRate.placed)} orders`} icon="clock" />
    </div>

    <div className="reports-row reports-row-primary">
      <Card title="Daily revenue" subtitle={`Paid orders only · ${period.start} – ${period.end}`} className="reports-daily" empty={empty} insight={data.insights.dailyRevenue}>
        <AreaChart rows={dailyRows} year={period.type === 'year'} />
      </Card>
      <Card title="Payment methods" subtitle="Share of paid orders" empty={totalPaid === 0} insight={data.insights.paymentMethods}>
        <Donut rows={methodRows} total={totalPaid} centerValue={integer(totalPaid)} centerLabel="paid orders" />
      </Card>
    </div>

    <div className="reports-row reports-row-three">
      <Card title="Orders by status" subtitle={`All ${integer(kpis.orders.placed)} orders this period`} empty={empty} insight={data.insights.ordersByStatus}>
        <Bars rows={statuses} valueKey="count" colorFor={(row) => statusColors[row.key]} />
      </Card>
      <Card title="Sales by category" subtitle="Revenue in ₱" empty={empty || !categories.length} insight={null}>
        <Bars rows={categories} valueKey="revenue" formatter={money} />
      </Card>
      <Card title="Delivery vs pickup" subtitle="Orders by how they were received" empty={data.deliveryVsPickup.total === 0} insight={data.insights.deliveryVsPickup}>
        <Donut rows={fulfillmentRows} total={data.deliveryVsPickup.total} centerValue={`${percentage(data.deliveryVsPickup.deliveryPercent, 0)}`} centerLabel="delivery" />
      </Card>
    </div>

    <div className="reports-row reports-row-bottom">
      <Card title="Top products" subtitle="Best sellers by revenue" className="reports-top-products" empty={!data.topProducts.length}>
        <div className="reports-table-scroll"><table className="reports-table"><thead><tr><th>PRODUCT</th><th>UNITS</th><th>REVENUE</th><th>SHARE OF SALES</th></tr></thead><tbody>
          {data.topProducts.map((item) => <tr key={item.product}><td>{item.product}</td><td>{integer(item.units)}</td><td>{money(item.revenue)}</td><td><div className="reports-share"><i style={{ width: `${Math.min(100, Math.max(0, Number(item.shareOfSales) || 0))}%` }} /><span>{percentage(item.shareOfSales, 0)}</span></div></td></tr>)}
        </tbody></table></div>
      </Card>
      <Card title="Payment review" subtitle="GCash proofs reviewed this period" empty={reviewedCount === 0} insight={data.insights.paymentReview}>
        <div className="reports-review">
          <div><i className="review-approved" /><span>Approved</span><b>{integer(review.approved)}</b></div>
          <div><i className="review-rejected" /><span>Rejected</span><b>{integer(review.rejected)}</b></div>
          <div className="reports-review-time"><span>Average review time</span><b>{duration(review.averageReviewSeconds)}</b></div>
          <div className="reports-review-first"><span>Approved on first upload</span><b>{review.firstUploadApprovalRate == null ? '—' : percentage(review.firstUploadApprovalRate)}</b></div>
        </div>
      </Card>
    </div>
    <div className="reports-print-actions"><Button variant="secondary" onClick={onPrint}>Print report</Button></div>
  </div>;
}

export default function ReportsPage({ report, onToast }) {
  const [selection, setSelection] = useState(selectionFromUrl);
  const [data, setData] = useState(() => report?.period?.type === selectionFromUrl().period ? report : null);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const syncUrl = () => setSelection(selectionFromUrl());
    window.addEventListener('popstate', syncUrl);
    return () => window.removeEventListener('popstate', syncUrl);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getReport(selection.period, selection.date).then((result) => {
      if (active) setData(result);
    }).catch((failure) => {
      if (active) setError(failure.message || 'Could not load reports.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [selection.period, selection.date, retry]);

  const updatePeriod = (period) => {
    const params = new URLSearchParams(window.location.search);
    params.set('period', period);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
    setSelection({ period, date: selection.date });
  };

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadReport(selection.period, selection.date);
    } catch (failure) {
      onToast?.(failure.message || 'Could not export the report.');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className="reports-page"><header className="reports-header"><div><h1>Reports</h1><p>Loading report data…</p></div></header><div className="reports-stats">{[1, 2, 3, 4].map((item) => <SkeletonCard key={item} />)}</div><div className="reports-loading-grid">{[1, 2, 3, 4, 5, 6].map((item) => <SkeletonCard key={item} />)}</div></div>;
  }
  if (error || !data) {
    return <div className="reports-page"><EmptyState icon="chart" title="Reports couldn’t load" text={error || 'No report data was returned.'} action={<Button onClick={() => setRetry((current) => current + 1)}>Retry</Button>} /></div>;
  }
  return <ReportsContent data={data} onPeriod={updatePeriod} onExport={exportCsv} exporting={exporting} onPrint={() => window.print()} />;
}
