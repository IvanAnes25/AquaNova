import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon.jsx';
import { InventoryTable, MovementTable } from '../components/InventoryTable.jsx';
import { Button, PanelHeader, SectionTitle, SkeletonList, StatCard } from '../components/UI.jsx';

export default function InventoryPage({
  products,
  movements,
  archives,
  archivePagination,
  archiveFilters,
  archivePage,
  onArchiveSearch,
  onArchivePage,
  onDownloadArchive,
  query,
  setQuery,
  onStock,
  loading = false,
}) {
  const [sort, setSort] = useState('stock-asc');
  const [archiveDraft, setArchiveDraft] = useState(archiveFilters);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const safeProducts = products || [];
  const safeMovements = movements || [];
  const safeArchives = archives || [];
  const units = safeProducts.reduce((sum, product) => sum + product.stock, 0);
  const visibleProducts = useMemo(() => safeProducts
    .filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => sort === 'stock-desc'
      ? right.stock - left.stock || left.name.localeCompare(right.name)
      : sort === 'name'
        ? left.name.localeCompare(right.name)
        : left.stock - right.stock || left.name.localeCompare(right.name)), [safeProducts, query, sort]);
  useEffect(() => setArchiveDraft(archiveFilters), [archiveFilters]);

  const applyArchiveFilters = async (event) => {
    event.preventDefault();
    setArchiveLoading(true);
    try {
      await onArchiveSearch(archiveDraft, 1);
    } finally {
      setArchiveLoading(false);
    }
  };
  const changeArchivePage = async (page) => {
    setArchiveLoading(true);
    try {
      await onArchivePage(page);
    } finally {
      setArchiveLoading(false);
    }
  };
  const showProductHistory = (product) => {
    const filters = { ...archiveFilters, productId: product.id };
    setArchiveDraft(filters);
    onArchiveSearch(filters, 1);
    window.requestAnimationFrame(() => document.getElementById('stock-archive')?.scrollIntoView({ behavior: 'smooth' }));
  };
  const pageCount = Number(archivePagination?.pages) || 0;
  const currentPage = Number(archivePage) || 1;

  return <>
    <SectionTitle eyebrow="KNOW WHAT'S ON YOUR SHELVES" title="Inventory" action={<div className="button-row"><Button variant="secondary" aria-label="Adjust stock" onClick={() => onStock(null, 'Adjustment')}>Adjust stock</Button><Button aria-label="Restock" onClick={() => onStock(null, 'Restock')}><Icon name="plus" size={16} /> Restock</Button></div>} />
    <div className="inventory-stats"><StatCard label="Total products" value={safeProducts.length} note="Across all categories" icon="box" /><StatCard label="Units in stock" value={units} note="Available to sell" icon="grid" /><StatCard label="Low stock" value={safeProducts.filter((item) => item.stock > 0 && item.stock <= 5).length} note="5 units or less" icon="clock" /><StatCard label="Sold out" value={safeProducts.filter((item) => item.stock === 0).length} note="Need restocking" icon="close" /></div>
    <section className="panel table-panel inventory-table"><PanelHeader title="Stock levels" subtitle="Current quantities and product status" action={<div className="inventory-controls"><label>Sort by<select className="input" aria-label="Sort inventory" value={sort} onChange={(event) => setSort(event.target.value)}><option value="stock-asc">Stock: low to high</option><option value="stock-desc">Stock: high to low</option><option value="name">Name</option></select></label><div className="search-field search-compact"><Icon name="search" size={17} /><input placeholder="Search inventory..." value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>} />
      {loading || products == null
        ? <SkeletonList count={5} />
        : <InventoryTable products={visibleProducts} onStock={(product) => onStock(product, 'Restock')} onHistory={showProductHistory} />}
      <div className="movement-section"><PanelHeader title="Recent stock movements" subtitle="A clear record of every change" />{loading || movements == null ? <SkeletonList count={3} /> : <MovementTable movements={safeMovements.slice(0, 5)} />}</div>
    </section>
    <section className="panel table-panel inventory-archive" id="stock-archive">
      <PanelHeader title="Stock change archive" subtitle="Filter stock changes, review large changes, or export the filtered history." action={<Button variant="secondary" disabled={archiveLoading} onClick={() => onDownloadArchive(archiveFilters)}>Export CSV</Button>} />
      <form className="inventory-archive-filters" onSubmit={applyArchiveFilters}>
        <label>Product<select className="input" value={archiveDraft.productId} onChange={(event) => setArchiveDraft({ ...archiveDraft, productId: event.target.value })}><option value="">All products</option>{safeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Type<select className="input" value={archiveDraft.type} onChange={(event) => setArchiveDraft({ ...archiveDraft, type: event.target.value })}><option value="">All types</option><option value="restock">Restock</option><option value="adjustment">Adjustment</option></select></label>
        <label>Reason contains<input className="input" value={archiveDraft.reason} onChange={(event) => setArchiveDraft({ ...archiveDraft, reason: event.target.value })} /></label>
        <label>From<input className="input" type="date" value={archiveDraft.from} onChange={(event) => setArchiveDraft({ ...archiveDraft, from: event.target.value })} /></label>
        <label>To<input className="input" type="date" value={archiveDraft.to} onChange={(event) => setArchiveDraft({ ...archiveDraft, to: event.target.value })} /></label>
        <label className="archive-large-filter"><input type="checkbox" checked={Boolean(archiveDraft.largeOnly)} onChange={(event) => setArchiveDraft({ ...archiveDraft, largeOnly: event.target.checked })} /> Large changes only</label>
        <Button type="submit" loading={archiveLoading}>Apply filters</Button>
      </form>
      {archiveLoading || archives == null
        ? <SkeletonList count={3} />
        : <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>TYPE</th><th>CHANGE</th><th>REASON</th><th>NOTE</th><th>STOCK</th><th>FLAG</th><th>DATE</th></tr></thead>
          <tbody>{safeArchives.length ? safeArchives.map((entry) => <tr key={entry.id}>
            <td>{entry.product}</td><td>{entry.type}</td><td className={entry.change > 0 ? 'stock-plus' : 'stock-minus'}>{entry.change > 0 ? '+' : ''}{entry.change}</td>
            <td>{entry.reason}</td><td>{entry.note || '—'}</td><td>{entry.stockBefore} → {entry.stockAfter}</td>
            <td>{entry.large ? <span className="large-change-flag">! Large change</span> : '—'}</td><td>{entry.date}</td>
          </tr>) : <tr><td className="table-empty" colSpan="8">No stock changes match these filters.</td></tr>}</tbody>
        </table></div>}
      <nav className="inventory-archive-pagination" aria-label="Stock archive pages">
        <Button variant="secondary" disabled={archiveLoading || currentPage <= 1} onClick={() => changeArchivePage(currentPage - 1)}>Previous</Button>
        <span>Page {currentPage} of {Math.max(pageCount, 1)}</span>
        <Button variant="secondary" disabled={archiveLoading || currentPage >= pageCount} onClick={() => changeArchivePage(currentPage + 1)}>Next</Button>
      </nav>
    </section>
  </>;
}
