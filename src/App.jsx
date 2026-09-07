import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, LayoutDashboard, Inbox, Tags, ChartNoAxesCombined, FileText, Settings, ChevronDown, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, ArrowRight, Plus, Search, Download, Sparkles, X, Check, Clock3, CircleCheck, CircleAlert, Mail, MessageSquare, Globe, Phone, SlidersHorizontal, RefreshCw, LoaderCircle, CalendarDays, Command, Menu, BookOpen, ExternalLink, ShieldCheck, CheckCheck, Bell, ArrowUp, ListFilter } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
const DAY = 86400000;
const dateISO = d => d.toISOString().slice(0, 10);
const getPeriod = days => ({
  from: dateISO(new Date(Date.now() - (days - 1) * DAY)),
  to: dateISO(new Date())
});
const num = n => new Intl.NumberFormat('ru-RU').format(n ?? 0);
const shortDate = value => new Date(value).toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC'
});
const fullDate = value => new Date(value).toLocaleString('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC'
});
const channelIcons = {
  email: Mail,
  chat: MessageSquare,
  web: Globe,
  phone: Phone
};
const sourceNames = {
  ai: 'ИИ',
  keywords: 'Ключевые слова',
  manual: 'Вручную',
  demo: 'Демо'
};
const navItems = [{
  id: 'overview',
  label: 'Обзор',
  icon: LayoutDashboard
}, {
  id: 'tickets',
  label: 'Обращения',
  icon: Inbox
}, {
  id: 'categories',
  label: 'Категории',
  icon: Tags
}, {
  id: 'analytics',
  label: 'Аналитика',
  icon: ChartNoAxesCombined
}, {
  id: 'reports',
  label: 'Отчёты',
  icon: FileText
}];
async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить данные');
  return data;
}
function Button({
  children,
  variant = '',
  className = '',
  ...props
}) {
  return <button className={`btn ${variant} ${className}`} {...props}>{children}</button>;
}
function Badge({
  type,
  children
}) {
  return <span className={`badge ${type}`}>{children}</span>;
}
function Empty({
  title = 'Ничего не найдено',
  text = 'Попробуйте изменить период или сбросить фильтры.'
}) {
  return <div className="empty"><Inbox size={34} /><h3>{title}</h3><p>{text}</p></div>;
}
function Loading() {
  return <div className="loading"><LoaderCircle className="spin" size={24} /> Загружаем данные…</div>;
}
function Category({
  id,
  meta
}) {
  const c = meta.categories.find(c => c.id === id);
  return <span className="category-label"><i style={{
      background: c?.color
    }} />{c?.name || id}</span>;
}
function Select({
  label,
  children,
  ...props
}) {
  return <label className="select-wrap"><span className="sr-only">{label}</span><select aria-label={label} {...props}>{children}</select><ChevronDown size={14} /></label>;
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false
}) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const body = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const list = ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = body;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => {
    if (e.target === e.currentTarget) onClose();
  }}><section ref={ref} tabIndex={-1} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={21} /></button></header>{children}</section></div>;
}
export default function App() {
  const [page, setPage] = useState('overview');
  const [meta, setMeta] = useState(null),
    [stats, setStats] = useState(null),
    [list, setList] = useState(null),
    [ai, setAI] = useState(null);
  const [period, setPeriod] = useState('30'),
    [range, setRange] = useState(getPeriod(30));
  const [filters, setFilters] = useState({
      category: 'all',
      status: 'all',
      priority: 'all',
      channel: 'all',
      tag: ''
    }),
    [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState(''),
    [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [toast, setToast] = useState(null);
  const [newOpen, setNewOpen] = useState(false),
    [selectedId, setSelectedId] = useState(null),
    [exportOpen, setExportOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [alertsOpen, setAlertsOpen] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    [autoAnalyzing, setAutoAnalyzing] = useState(null);
  const searchRef = useRef(null);
  const notify = useCallback((text, type = 'success') => setToast({
    text,
    type
  }), []);
  const refresh = useCallback(() => setRevision(r => r + 1), []);
  const closeNew = useCallback(() => setNewOpen(false), []),
    closeTicket = useCallback(() => setSelectedId(null), []),
    closeExport = useCallback(() => setExportOpen(false), []),
    closeHelp = useCallback(() => setHelpOpen(false), []),
    closeAlerts = useCallback(() => setAlertsOpen(false), []);
  const updateFilter = (key, value) => {
    setFilters(f => ({
      ...f,
      [key]: value
    }));
    setPageNumber(1);
  };
  const navigate = id => {
    setPage(id);
    setMobileOpen(false);
    setPageNumber(1);
  };
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPageNumber(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    api('/meta').then(setMeta).catch(e => setError(e.message));
  }, [revision]);
  const checkAI = useCallback(() => api('/ai').then(setAI).catch(() => setAI({
    connected: false,
    ready: false,
    models: []
  })), []);
  useEffect(() => {
    checkAI();
    const timer = setInterval(checkAI, 60000);
    return () => clearInterval(timer);
  }, [checkAI]);
  const qs = new URLSearchParams({
    ...range,
    ...filters,
    q: debounced
  }).toString();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([api('/analytics?' + qs, {
      signal: controller.signal
    }), api('/tickets?' + qs + `&page=${pageNumber}&limit=${page === 'overview' ? 5 : 12}`, {
      signal: controller.signal
    })]).then(([a, b]) => {
      setStats(a);
      setList(b);
    }).catch(e => {
      if (e.name !== 'AbortError') setError(e.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [qs, pageNumber, revision, page]);
  const setPeriodValue = value => {
    setPeriod(value);
    if (value !== 'custom') setRange(getPeriod(Number(value)));
    setPageNumber(1);
  };
  const filtered = Object.values(filters).some(v => v && v !== 'all') || debounced;
  const resetFilters = () => {
    setFilters({
      category: 'all',
      status: 'all',
      priority: 'all',
      channel: 'all',
      tag: ''
    });
    setSearch('');
    setPageNumber(1);
  };
  const chooseCategory = id => {
    updateFilter('category', id);
    navigate('tickets');
  };
  const created = (id, auto) => {
    refresh();
    setSelectedId(id);
    if (auto) {
      setAutoAnalyzing(id);
      notify('Обращение сохранено. ИИ анализирует текст…');
      api(`/tickets/${id}/classify`, {
        method: 'POST',
        body: '{}'
      }).then(t => {
        notify(t.source === 'ai' ? 'ИИ определил категорию и причину' : t.ai_error, t.source === 'ai' ? 'success' : 'info');
        refresh();
        window.dispatchEvent(new CustomEvent('ticket-updated', {
          detail: id
        }));
      }).catch(e => notify(e.message, 'error')).finally(() => setAutoAnalyzing(null));
    }
  };
  return <div className="app-shell">
    {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <a href="#" className="brand" onClick={e => {
        e.preventDefault();
        navigate('overview');
      }}><span className="brand-mark"><Activity size={25} /></span><span>сигнал<span className="brand-dot">.</span></span></a>
      <div className="workspace"><span className="workspace-icon">S</span><div><strong>Рабочее пространство</strong><small>Анализ обращений</small></div><span className="workspace-check"><Check size={13} /></span></div>
      <div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav aria-label="Основная навигация">{navItems.map(({
          id,
          label,
          icon: Icon
        }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span>{id === 'tickets' && stats && <span className="nav-count">{num(stats.metrics.total)}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="ai-sidebar"><span className="ai-icon"><Sparkles size={17} /></span><strong>Интеллект на вашей стороне</strong><p>ИИ помогает находить смысл<br />в каждом обращении.</p><button onClick={() => navigate('settings')}>Настроить ИИ <ArrowUpRight size={14} /></button></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={18} />Настройки</button><button className="nav-item" onClick={() => setHelpOpen(true)}><BookOpen size={18} />Помощь и документация</button><div className="profile"><span className="avatar">ЛП</span><div><strong>Локальный проект</strong><small>Рабочее пространство</small></div><ShieldCheck size={17} /></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Открыть меню"><Menu size={21} /></button><span>Рабочее пространство</span><ChevronRight size={14} /><strong>{navItems.find(n => n.id === page)?.label || 'Настройки'}</strong></div><div className="topbar-actions"><span className={`connection ${ai?.ready ? 'online' : ''}`}><i />{ai?.ready ? 'ИИ подключён' : ai?.connected ? 'Модель не выбрана' : 'ИИ не подключён'}</span><span className="topbar-divider" /><button className="icon-btn notification" aria-label="Уведомления" onClick={() => setAlertsOpen(true)}><Bell size={19} />{stats?.alerts.length > 0 && <i />}</button><span className="avatar small">ЛП</span></div></header>
    <main>
      <div className="page-heading"><div><div className="eyebrow">{page === 'overview' ? 'ВАШ СЕРВИС В ЦИФРАХ' : page === 'tickets' ? 'КАЖДОЕ ОБРАЩЕНИЕ ВАЖНО' : page === 'analytics' ? 'ОТ ДАННЫХ К РЕШЕНИЯМ' : page === 'reports' ? 'ПОЛНАЯ КАРТИНА' : page === 'categories' ? 'ПОРЯДОК В ОБРАЩЕНИЯХ' : 'ЛОКАЛЬНЫЙ ИНТЕЛЛЕКТ'}</div><h1>{page === 'overview' ? 'Обзор обращений' : page === 'tickets' ? 'Обращения' : page === 'analytics' ? 'Аналитика' : page === 'reports' ? 'Аналитические отчёты' : page === 'categories' ? 'Категории обращений' : 'Настройки'}</h1><p>{page === 'overview' ? 'Понимайте пользователей. Замечайте важное. Улучшайте сервис.' : page === 'tickets' ? 'Все запросы пользователей в одном месте.' : page === 'analytics' ? 'Исследуйте причины обращений и изменения за выбранный период.' : page === 'reports' ? 'Превращайте накопленные данные в понятные выводы.' : page === 'categories' ? 'Пять направлений, чтобы быстрее находить и решать проблемы.' : 'Управляйте подключением ИИ и локальной моделью.'}</p></div><div className="heading-actions">{page !== 'settings' && <Button onClick={() => setExportOpen(true)}><Download size={16} />Экспорт</Button>}<Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={18} />Новое обращение</Button></div></div>
      {page !== 'settings' && <div className="filterbar"><div className="period-group"><CalendarDays size={16} /><Select label="Период" value={period} onChange={e => setPeriodValue(e.target.value)}><option value="7">Последние 7 дней</option><option value="30">Последние 30 дней</option><option value="90">Последние 90 дней</option><option value="custom">Свой период</option></Select>{period === 'custom' ? <div className="custom-dates"><input aria-label="Дата начала" type="date" value={range.from} onChange={e => {
                setRange(r => ({
                  ...r,
                  from: e.target.value
                }));
                setPageNumber(1);
              }} /><span>—</span><input aria-label="Дата окончания" type="date" value={range.to} onChange={e => {
                setRange(r => ({
                  ...r,
                  to: e.target.value
                }));
                setPageNumber(1);
              }} /></div> : <span className="date-label">{shortDate(range.from)} — {shortDate(range.to)}, {range.to.slice(0, 4)}</span>}</div><div className="filter-right">{meta && <Select label="Категория" value={filters.category} onChange={e => updateFilter('category', e.target.value)}><option value="all">Все категории</option>{meta.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}{filtered && <button className="text-btn" onClick={resetFilters}>Сбросить <X size={13} /></button>}<button className="icon-btn" aria-label="Обновить данные" onClick={refresh}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button></div></div>}
      {filtered && page !== 'tickets' && page !== 'settings' && <div className="filter-notice"><ListFilter size={14} /> Применены фильтры обращений{debounced && ` · Поиск: «${debounced}»`}{filters.status !== 'all' && ` · ${meta?.statuses[filters.status]}`}<button className="text-btn" onClick={resetFilters}>Сбросить все</button></div>}
      {error ? <div className="error-panel" role="alert"><CircleAlert size={22} /><div><strong>Не удалось загрузить данные</strong><p>{error}</p></div><Button onClick={refresh}>Повторить</Button></div> : !meta || !stats && page !== 'settings' ? <Loading /> : <>
        {page === 'overview' && <div className={loading ? 'refreshing' : ''}><Metrics stats={stats} /><div className="charts-grid"><Trend stats={stats} /><CategoriesChart stats={stats} onSelect={chooseCategory} /></div><div className="insight-strip"><span className="insight-spark"><Sparkles size={20} /></span><div><strong>{stats.alerts[0]?.title || 'За цифрами — реальные потребности'}</strong><p>{stats.alerts[0]?.text || (stats.metrics.total ? `Самая частая причина — «${stats.reasons[0]?.name}». Изучите обращения, чтобы найти точки улучшения.` : 'Добавьте обращения, чтобы увидеть закономерности и изменения.')}</p></div><button className="text-btn" onClick={() => navigate('analytics')}>Подробнее <ArrowRight size={16} /></button></div><div className="bottom-grid"><TicketSection meta={meta} list={list} onSelect={setSelectedId} compact onAll={() => navigate('tickets')} /><Reasons stats={stats} /></div></div>}
        {page === 'tickets' && <><div className="ticket-tools"><label className="search-box"><Search size={17} /><input ref={searchRef} aria-label="Поиск обращений" placeholder="Поиск по теме, тексту, имени или номеру…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>Ctrl K</kbd></label><Select label="Статус" value={filters.status} onChange={e => updateFilter('status', e.target.value)}><option value="all">Все статусы</option>{Object.entries(meta.statuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select><Select label="Приоритет" value={filters.priority} onChange={e => updateFilter('priority', e.target.value)}><option value="all">Любой приоритет</option>{Object.entries(meta.priorities).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select><Select label="Канал" value={filters.channel} onChange={e => updateFilter('channel', e.target.value)}><option value="all">Все каналы</option>{Object.entries(meta.channels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select><Select label="Тег" value={filters.tag} onChange={e => updateFilter('tag', e.target.value)}><option value="">Все теги</option>{meta.tags.map(tag => <option key={tag}>{tag}</option>)}</Select></div><div className={loading ? 'refreshing' : ''}><TicketSection meta={meta} list={list} onSelect={setSelectedId} />{list?.pages > 1 && <div className="pagination"><span>Страница {list.page} из {list.pages} · Всего {num(list.total)}</span><div><Button disabled={pageNumber === 1 || loading} onClick={() => setPageNumber(p => p - 1)}><ChevronLeft size={16} />Назад</Button><Button disabled={pageNumber >= list.pages || loading} onClick={() => setPageNumber(p => p + 1)}>Далее<ChevronRight size={16} /></Button></div></div>}</div></>}
        {page === 'analytics' && <><Metrics stats={stats} /><div className="charts-grid"><Trend stats={stats} detailed /><CategoriesChart stats={stats} onSelect={chooseCategory} /></div><div className="bottom-grid"><div className="panel"><PanelTitle title="Сравнение по категориям" subtitle="С предыдущим периодом такой же длины" /><div className="comparison-table table-scroll"><table><thead><tr><th>КАТЕГОРИЯ</th><th>СЕЙЧАС</th><th>РАНЕЕ</th><th>ИЗМЕНЕНИЕ</th></tr></thead><tbody>{stats.categories.map(c => <tr key={c.id}><td><Category meta={meta} id={c.id} /></td><td>{c.count}</td><td>{c.previous}</td><td><span className={c.change > 0 ? 'delta warning' : 'delta'}>{c.change === null ? 'Нет базы' : `${c.change > 0 ? '+' : ''}${c.change}%`}</span></td></tr>)}</tbody></table></div></div><Reasons stats={stats} /></div><div className="panel channel-panel"><PanelTitle title="Откуда приходят обращения" subtitle="Распределение по каналам связи" /><div className="channel-grid">{stats.channels.map(c => {
                  const Icon = channelIcons[c.id];
                  return <button key={c.id} onClick={() => {
                    updateFilter('channel', c.id);
                    navigate('tickets');
                  }}><Icon size={22} /><span>{meta.channels[c.id]}</span><strong>{num(c.count)}</strong><small>{stats.metrics.total ? Math.round(c.count / stats.metrics.total * 100) : 0}% от всех обращений</small></button>;
                })}</div></div></>}
        {page === 'categories' && <div className="category-cards">{stats.categories.map(c => <article className="panel category-card" key={c.id}><div className="category-card-top"><span style={{
                  background: c.color + '18',
                  color: c.color
                }}><Tags size={24} /></span><Badge type="neutral">{c.share}% обращений</Badge></div><h2>{c.name}</h2><p>{c.description}</p><div className="category-number">{num(c.count)}<span>за выбранный период</span></div><div className="keyword-list">{c.keywords.slice(0, 5).map(k => <span key={k}>{k}…</span>)}{!c.keywords.length && <span>Без совпадений по ключевым словам</span>}</div><button className="text-btn" onClick={() => chooseCategory(c.id)}>Просмотреть обращения <ArrowRight size={16} /></button></article>)}<article className="category-explainer"><Sparkles size={28} /><h2>Категоризация с ИИ</h2><p>Модель анализирует смысл обращения и предлагает категорию, причину и приоритет. Любой результат можно исправить в карточке.</p><Button onClick={() => navigate('settings')}>Настройки модели <ArrowUpRight size={15} /></Button></article></div>}
        {page === 'reports' && <Reports qs={qs} stats={stats} onExport={() => setExportOpen(true)} notify={notify} />}
        {page === 'settings' && <SettingsPage ai={ai} checkAI={checkAI} notify={notify} />}
      </>}
      <footer className="page-footer"><span><span className="footer-dot" />{meta?.demo ? 'Демонстрационные данные · Все имена вымышлены' : 'Данные хранятся на вашем устройстве'}</span><span>Сигнал <span className="footer-sep">/</span> Сделано, чтобы слышать пользователей</span></footer>
    </main></div>
    {newOpen && meta && <NewTicket meta={meta} onClose={closeNew} notify={notify} onCreated={created} />}
    {selectedId && meta && <TicketModal id={selectedId} meta={meta} onClose={closeTicket} notify={notify} onChanged={refresh} autoAnalyzing={autoAnalyzing === selectedId} />}
    {exportOpen && <ExportModal qs={qs} range={range} onClose={closeExport} />}
    {helpOpen && <Modal title="Как работать с Сигналом" subtitle="От первого обращения до аналитического отчёта" onClose={closeHelp}><div className="modal-body help-content"><h3>1. Добавьте обращение</h3><p>Нажмите «Новое обращение», заполните тему и текст. При включённом анализе ИИ определит категорию и причину после сохранения.</p><h3>2. Организуйте работу</h3><p>Используйте поиск и фильтры. В карточке можно изменить статус, приоритет, категорию и теги. История изменений сохраняется.</p><h3>3. Изучите аналитику</h3><p>Период и фильтры применяются ко всем графикам и отчётам. Даты отображаются в UTC. Решённые — обращения, созданные в выбранном периоде и имеющие статус «Решено» сейчас.</p><h3>4. Сформируйте отчёт</h3><p>На странице «Отчёты» можно получить текстовую сводку через ИИ и скачать её. «Экспорт» выгружает CSV для Excel.</p><div className="info-box"><ShieldCheck size={20} /><p>Это локальная версия для одного рабочего пространства, без учётных записей. Подробности запуска и архитектуры находятся в README.md проекта.</p></div></div></Modal>}
    {alertsOpen && <Modal title="Уведомления" subtitle="Изменения за выбранный период и с учётом фильтров" onClose={closeAlerts}><div className="modal-body">{stats?.alerts.length ? stats.alerts.map(a => <div key={a.category} className="alert-item"><CircleAlert size={20} /><div><h3>{a.title}</h3><p>{a.text}</p><button className="text-btn" onClick={() => {
              closeAlerts();
              chooseCategory(a.category);
            }}>К обращениям <ArrowRight size={15} /></button></div></div>) : <Empty title="Резких изменений нет" text="Уведомление появится при росте категории от 50%, если в прошлом периоде было ≥ 5 обращений, а в текущем ≥ 10." />}</div></Modal>}
    {toast && <div className={`toast ${toast.type}`} role="status">{toast.type === 'error' ? <CircleAlert size={20} /> : <CircleCheck size={20} />}<span>{toast.text}</span><button onClick={() => setToast(null)} aria-label="Скрыть уведомление"><X size={16} /></button></div>}
  </div>;
}
function PanelTitle({
  title,
  subtitle,
  children
}) {
  return <div className="panel-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}</div>;
}
function Metrics({
  stats
}) {
  const m = stats.metrics;
  return <div className="metrics-grid"><article className="metric"><div className="metric-label">Всего обращений<span className="metric-icon"><Inbox size={17} /></span></div><div className="metric-value">{num(m.total)}<span className={`delta ${m.totalChange > 0 ? 'warning' : ''}`}>{m.totalChange === null ? 'Нет базы сравнения' : <>{m.totalChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {Math.abs(m.totalChange)}%</>}</span></div><p>к предыдущему периоду</p></article><article className="metric"><div className="metric-label">Решено<span className="metric-icon green"><CircleCheck size={18} /></span></div><div className="metric-value">{num(m.resolved)}<span className="metric-rate">{m.resolvedRate}%</span></div><p><span className="tiny-dot green" />от всех обращений периода</p></article><article className="metric"><div className="metric-label">Ожидают решения<span className="metric-icon amber"><Clock3 size={18} /></span></div><div className="metric-value">{num(m.active)}</div><p><span className="tiny-dot amber" />{m.high} с высоким приоритетом</p></article><article className="metric"><div className="metric-label">Среднее время решения<span className="metric-icon"><CheckCheck size={18} /></span></div><div className="metric-value">{m.avgResolutionHours === null ? '—' : num(m.avgResolutionHours)}<span className="metric-unit">{m.avgResolutionHours === null ? '' : 'ч'}</span></div><p>по решённым обращениям периода</p></article></div>;
}
function Trend({
  stats,
  detailed = false
}) {
  const [compare, setCompare] = useState(true);
  return <section className="panel trend-panel"><PanelTitle title="Динамика обращений" subtitle="Как меняется количество запросов"><div className="chart-legend"><span><i className="legend-dot current" />Текущий период</span><button className={!compare ? 'muted' : ''} onClick={() => setCompare(v => !v)} aria-pressed={compare}><i className="legend-dot previous" />Предыдущий</button></div></PanelTitle><div className="line-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={stats.daily} margin={{
          top: 14,
          right: 18,
          left: -25,
          bottom: 0
        }}><defs><linearGradient id={detailed ? 'areaFill2' : 'areaFill'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={.17} /><stop offset="95%" stopColor="#2563eb" stopOpacity={.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef0f1" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={shortDate} tick={{
            fontSize: 11,
            fill: '#7285a5'
          }} axisLine={false} tickLine={false} minTickGap={35} dy={8} /><YAxis allowDecimals={false} tick={{
            fontSize: 11,
            fill: '#7285a5'
          }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={shortDate} contentStyle={{
            border: '1px solid #dee6f4',
            borderRadius: 10,
            fontSize: 12
          }} />{compare && <Area isAnimationActive={false} type="monotone" name="Предыдущий период" dataKey="previous" stroke="#b3bec3" strokeDasharray="5 5" strokeWidth={1.5} fill="transparent" />}<Area isAnimationActive={false} type="monotone" name="Текущий период" dataKey="total" stroke="#2563eb" strokeWidth={2.5} fill={`url(#${detailed ? 'areaFill2' : 'areaFill'})`} activeDot={{
            r: 5,
            stroke: '#fff',
            strokeWidth: 3
          }} />{detailed && <Area isAnimationActive={false} type="monotone" name="Из них решено сейчас" dataKey="resolved" stroke="#8c9de1" fill="transparent" strokeWidth={1.5} />}</AreaChart></ResponsiveContainer></div></section>;
}
function CategoriesChart({
  stats,
  onSelect
}) {
  return <section className="panel donut-panel"><PanelTitle title="По категориям" subtitle="Что волнует пользователей" /><div className="donut-area"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={stats.metrics.total ? stats.categories.filter(c => c.count) : [{
            name: 'Нет данных',
            count: 1,
            color: '#e7ecf6'
          }]} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius="66%" outerRadius="87%" paddingAngle={stats.metrics.total ? 3 : 0} cornerRadius={4} stroke="none" onClick={c => c.id && onSelect(c.id)}>{(stats.metrics.total ? stats.categories.filter(c => c.count) : [{
              id: 'empty',
              color: '#e7ecf6'
            }]).map(c => <Cell key={c.id} fill={c.color} cursor={c.id === 'empty' ? 'default' : 'pointer'} />)}</Pie>{stats.metrics.total > 0 && <Tooltip contentStyle={{
            borderRadius: 10,
            fontSize: 12
          }} />}</PieChart></ResponsiveContainer><div className="donut-center"><strong>{num(stats.metrics.total)}</strong><span>обращений</span></div></div><div className="donut-legend">{stats.categories.map(c => <button key={c.id} onClick={() => onSelect(c.id)}><span><i style={{
            background: c.color
          }} />{c.name}</span><strong>{c.share}<small>%</small></strong></button>)}</div></section>;
}
function Reasons({
  stats
}) {
  const max = stats.reasons[0]?.count || 1;
  return <section className="panel reasons-panel"><PanelTitle title="Частые причины" subtitle="Топ проблем за выбранный период" />{stats.reasons.length ? <div className="reason-list">{stats.reasons.slice(0, 5).map((r, i) => <div className="reason" key={r.category + r.name}><span className="reason-index">0{i + 1}</span><div><div className="reason-label"><span>{r.name}</span><strong>{r.count}</strong></div><div className="reason-track"><i style={{
              width: `${r.count / max * 100}%`,
              background: i === 0 ? '#2563eb' : '#bfdbfe'
            }} /></div></div></div>)}</div> : <Empty />}<div className="panel-footnote">На основе категорий и причин обращений</div></section>;
}
function TicketSection({
  meta,
  list,
  onSelect,
  compact = false,
  onAll
}) {
  return <section className="panel tickets-panel"><PanelTitle title={compact ? 'Последние обращения' : 'Список обращений'} subtitle={compact ? 'Новые запросы, которые требуют внимания' : `${num(list?.total)} обращений с учётом фильтров`}>{compact && <button className="text-btn" onClick={onAll}>Все обращения <ArrowUpRight size={15} /></button>}</PanelTitle>{list?.items.length ? <div className="table-scroll"><table className={compact ? 'compact-table' : ''}><thead><tr><th>ОБРАЩЕНИЕ</th><th>КАТЕГОРИЯ</th><th>СТАТУС</th>{!compact && <th>ПРИОРИТЕТ</th>}<th>ДАТА</th><th aria-label="Открыть" /></tr></thead><tbody>{list.items.map(t => <tr key={t.id}><td><button className="ticket-title" onClick={() => onSelect(t.id)}><span>{t.subject}</span><small>#{String(t.id).padStart(4, '0')}<span>·</span>{t.author}</small></button></td><td><Category id={t.category} meta={meta} /></td><td><Badge type={t.status}><i />{meta.statuses[t.status]}</Badge></td>{!compact && <td><Badge type={'priority-' + t.priority}>{t.priority === 'high' && <ArrowUp size={12} />} {meta.priorities[t.priority]}</Badge></td>}<td className="date-cell">{shortDate(t.created_at)}</td><td><button className="icon-btn" aria-label={`Открыть обращение ${t.id}`} onClick={() => onSelect(t.id)}><ChevronRight size={15} /></button></td></tr>)}</tbody></table></div> : <Empty />}</section>;
}
function NewTicket({
  meta,
  onClose,
  onCreated,
  notify
}) {
  const [form, setForm] = useState({
      subject: '',
      body: '',
      author: '',
      email: '',
      channel: 'web',
      priority: 'medium',
      tags: ''
    }),
    [auto, setAuto] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (key, value) => setForm(f => ({
    ...f,
    [key]: value
  }));
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const ticket = await api('/tickets', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          tags: form.tags.split(',').map(t => t.trim()).filter(Boolean)
        })
      });
      notify('Обращение сохранено');
      onClose();
      onCreated(ticket.id, auto);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return <Modal title="Новое обращение" subtitle="Сохраните запрос — Сигнал поможет разобраться в остальном" onClose={onClose}><form onSubmit={submit}><div className="modal-body form-grid"><label className="field full">Тема обращения<input autoFocus required minLength={3} maxLength={200} placeholder="Кратко опишите проблему" value={form.subject} onChange={e => set('subject', e.target.value)} /></label><label className="field full">Текст обращения<textarea required minLength={5} maxLength={12000} rows={5} placeholder="Что произошло? Добавьте подробности, которые помогут разобраться." value={form.body} onChange={e => set('body', e.target.value)} /></label><label className="field">Имя пользователя<input required minLength={2} maxLength={100} placeholder="Иван Иванов" value={form.author} onChange={e => set('author', e.target.value)} /></label><label className="field">Email <span className="optional">необязательно</span><input type="email" placeholder="user@example.com" value={form.email} onChange={e => set('email', e.target.value)} /></label><label className="field">Канал<select value={form.channel} onChange={e => set('channel', e.target.value)}>{Object.entries(meta.channels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="field">Приоритет<select value={form.priority} onChange={e => set('priority', e.target.value)}>{Object.entries(meta.priorities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="field full">Теги <span className="optional">через запятую, до 10</span><input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="подписка, android" /></label><label className="auto-classify full"><Sparkles size={21} /><div><strong>Проанализировать с ИИ</strong><span>Категория, причина, краткое описание и приоритет</span></div><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /></label>{error && <p className="form-error full" role="alert">{error}</p>}</div><div className="modal-footer"><Button type="button" onClick={onClose}>Отмена</Button><Button variant="primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}Сохранить обращение</Button></div></form></Modal>;
}
function TicketModal({
  id,
  meta,
  onClose,
  notify,
  onChanged,
  autoAnalyzing = false
}) {
  const [ticket, setTicket] = useState(null),
    [draft, setDraft] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [localAnalyzing, setAnalyzing] = useState(false);
  const analyzing = localAnalyzing || autoAnalyzing;
  const assign = useCallback(t => {
    setTicket(t);
    setDraft({
      category: t.category,
      reason: t.reason,
      status: t.status,
      priority: t.priority,
      tags: t.tags.join(', ')
    });
  }, []);
  useEffect(() => {
    let active = true;
    setTicket(null);
    setError('');
    const load = () => api(`/tickets/${id}`).then(t => {
      if (active) assign(t);
    }).catch(e => {
      if (active) setError(e.message);
    });
    load();
    const handler = e => {
      if (e.detail === id) load();
    };
    window.addEventListener('ticket-updated', handler);
    return () => {
      active = false;
      window.removeEventListener('ticket-updated', handler);
    };
  }, [id, assign]);
  const change = (k, v) => setDraft(d => ({
    ...d,
    [k]: v,
    ...(k === 'category' ? {
      reason: meta.reasons[v][0]
    } : {})
  }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const patch = {
        version: ticket.version
      };
      for (const k of ['category', 'reason', 'status', 'priority']) if (draft[k] !== ticket[k]) patch[k] = draft[k];
      const tags = draft.tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.join(',') !== ticket.tags.join(',')) patch.tags = tags;
      if (Object.keys(patch).length === 1) {
        notify('Нет изменений для сохранения');
        return;
      }
      assign(await api(`/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      }));
      onChanged();
      notify('Изменения сохранены');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const analyze = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const result = await api(`/tickets/${id}/classify`, {
        method: 'POST',
        body: '{}'
      });
      assign(result);
      onChanged();
      notify(result.source === 'ai' ? 'Анализ ИИ завершён' : result.ai_error, result.source === 'ai' ? 'success' : 'info');
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };
  return <Modal wide title={`Обращение #${String(id).padStart(4, '0')}`} subtitle={ticket ? `Создано ${fullDate(ticket.created_at)} UTC` : null} onClose={onClose}>{!ticket ? <div className="modal-body">{error ? <p className="form-error">{error}</p> : <Loading />}</div> : <><div className="ticket-detail"><div className="ticket-main"><div className="ticket-author"><span className="avatar">{ticket.author.split(' ').map(s => s[0]).slice(0, 2).join('')}</span><div><strong>{ticket.author}</strong><small>{ticket.email || meta.channels[ticket.channel]}</small></div><Badge type="neutral">{meta.channels[ticket.channel]}</Badge></div><h2>{ticket.subject}</h2><p className="ticket-body">{ticket.body}</p><div className="ai-result"><div><Sparkles size={18} /><strong>Анализ обращения</strong><Badge type={ticket.source === 'ai' ? 'resolved' : 'neutral'}>{sourceNames[ticket.source]}</Badge></div><p>{ticket.summary || ticket.subject}</p>{ticket.ai_error && <small>{ticket.ai_error}</small>}<Button onClick={analyze} disabled={analyzing || busy}>{analyzing ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} {analyzing ? 'ИИ анализирует…' : 'Проанализировать с ИИ'}</Button><small>Анализ обновит категорию, причину и приоритет. Обычно до 90 секунд.</small></div><h3 className="history-heading">История обращения</h3><div className="history">{ticket.events.map(e => <div key={e.id}><i /><div><p>{e.text}</p><small>{fullDate(e.created_at)} UTC</small></div></div>)}</div></div><div className="ticket-properties"><label className="field">Статус<select aria-label="Статус" disabled={analyzing} value={draft.status} onChange={e => change('status', e.target.value)}>{Object.entries(meta.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="field">Приоритет<select aria-label="Приоритет" disabled={analyzing} value={draft.priority} onChange={e => change('priority', e.target.value)}>{Object.entries(meta.priorities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="field">Категория<select aria-label="Категория" disabled={analyzing} value={draft.category} onChange={e => change('category', e.target.value)}>{meta.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field">Причина<select aria-label="Причина" disabled={analyzing} value={draft.reason} onChange={e => change('reason', e.target.value)}>{meta.reasons[draft.category].map(r => <option key={r} value={r}>{r}</option>)}</select></label><label className="field">Теги<textarea aria-label="Теги" disabled={analyzing} rows={3} value={draft.tags} onChange={e => change('tags', e.target.value)} /><small>Через запятую, до 10 тегов</small></label><div className="property-note"><ShieldCheck size={17} /><p>Можно исправить результат ИИ вручную. Все изменения сохраняются в истории.</p></div></div></div>{error && <div className="form-error detail-error" role="alert">{error}</div>}<div className="modal-footer"><Button onClick={onClose}>Закрыть</Button><Button variant="primary" disabled={busy || analyzing} onClick={save}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Сохранить изменения</Button></div></>}</Modal>;
}
function ExportModal({
  qs,
  range,
  onClose
}) {
  const [format, setFormat] = useState('summary');
  return <Modal title="Экспорт данных" subtitle={`${shortDate(range.from)} — ${shortDate(range.to)} · с учётом текущих фильтров`} onClose={onClose}><div className="modal-body"><div className="export-choices">{[{
          id: 'summary',
          title: 'Аналитический отчёт',
          text: 'Показатели, категории, частые причины и сравнение периодов',
          icon: ChartNoAxesCombined
        }, {
          id: 'tickets',
          title: 'Список обращений',
          text: 'Все поля обращений, включая текст, контактные данные и теги',
          icon: Inbox
        }].map(({
          id,
          title,
          text,
          icon: Icon
        }) => <label key={id} className={format === id ? 'selected' : ''}><Icon size={24} /><div><strong>{title}</strong><p>{text}</p></div><input type="radio" name="export" value={id} checked={format === id} onChange={() => setFormat(id)} /></label>)}</div><div className="info-box"><FileText size={20} /><p>CSV в кодировке UTF-8 с разделителем «;». Открывается в Excel, LibreOffice и других табличных редакторах.</p></div></div><div className="modal-footer"><Button onClick={onClose}>Отмена</Button><a className="btn primary" href={`/api/reports/export?${qs}&format=${format}`} download onClick={onClose}><Download size={16} />Скачать CSV</a></div></Modal>;
}
function Reports({
  qs,
  stats,
  onExport,
  notify
}) {
  const [report, setReport] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setReport(null);
  }, [qs]);
  const reportQuery = useRef(qs);
  reportQuery.current = qs;
  const generate = async () => {
    setBusy(true);
    const requestQuery = qs;
    try {
      const result = await api('/reports/summary?' + qs, {
        method: 'POST',
        body: '{}'
      });
      if (reportQuery.current === requestQuery) setReport(result);else notify('Период изменился. Сформируйте отчёт для новых фильтров.', 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const content = `СИГНАЛ — АНАЛИТИЧЕСКИЙ ОТЧЁТ\nПериод: ${report.range.from} — ${report.range.to}\nИсточник: ${report.source === 'ai' ? `ИИ (${report.model})` : 'Статистическая сводка'}\nСформирован: ${report.created_at}\n\n${report.text}\n${report.warning || ''}`;
    const url = URL.createObjectURL(new Blob([content], {
      type: 'text/plain;charset=utf-8'
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `signal-report-${report.range.to}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="reports-layout"><section className="panel report-main"><div className="report-intro"><span className="large-ai-icon"><Sparkles size={25} /></span><Badge type="resolved">Локальный ИИ</Badge></div><h2>Данные рассказывают историю.<br />ИИ поможет её увидеть.</h2><p>Получите краткий обзор обращений, основные проблемы и рекомендации на основе статистики выбранного периода.</p><div className="report-facts"><div><strong>{num(stats.metrics.total)}</strong><span>обращений для анализа</span></div><div><strong>{stats.range.days}</strong><span>дней в периоде</span></div><div><strong>{stats.categories.filter(c => c.count > 0).length}</strong><span>категорий</span></div></div><Button variant="primary" disabled={busy || !stats.metrics.total} onClick={generate}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} {busy ? 'Формируем отчёт…' : 'Сформировать ИИ-отчёт'}</Button>{busy && <p className="small-text">Модель работает локально. Генерация может занять до 90 секунд.</p>}{report && <div className="generated-report"><div><h3>Аналитическая сводка</h3><Badge type="neutral">{report.source === 'ai' ? 'ИИ' : 'По статистике'}</Badge></div>{report.warning && <p className="report-warning">{report.warning}</p>}<p className="report-text">{report.text}</p><Button onClick={download}><Download size={16} />Скачать отчёт TXT</Button></div>}</section><aside className="report-side"><section className="panel"><FileText size={25} /><h3>Отчёт в таблице</h3><p>Категории, показатели и сравнение периодов — в CSV для дальнейшей работы.</p><Button onClick={onExport}><Download size={16} />Экспортировать</Button></section><section className="privacy-card"><ShieldCheck size={25} /><h3>Данные остаются рядом</h3><p>В отчёт ИИ передаётся агрегированная статистика. Имена, email и тексты обращений для отчёта не отправляются.</p></section><section className="report-method"><h3>Как считаются показатели</h3><p>Сравнение выполняется с предыдущим периодом такой же длины. Время решения считается от создания до последнего закрытия обращения. Все даты — UTC.</p></section></aside></div>;
}
function SettingsPage({
  ai,
  checkAI,
  notify
}) {
  const [model, setModel] = useState(ai?.model || ''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setModel(ai?.model || '');
  }, [ai?.model]);
  const save = async () => {
    setBusy(true);
    try {
      await api('/settings/model', {
        method: 'PUT',
        body: JSON.stringify({
          model
        })
      });
      await checkAI();
      notify('Модель сохранена');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return <div className="settings-layout"><section className="panel settings-panel"><PanelTitle title="Подключение ИИ" subtitle="Локальная модель для анализа обращений"><Badge type={ai?.ready ? 'resolved' : 'in_progress'}>{ai?.ready ? 'Подключено' : 'Требует настройки'}</Badge></PanelTitle><div className="settings-body"><div className="info-box"><Sparkles size={22} /><p>ИИ определяет категорию, причину и приоритет обращения, а также составляет аналитические отчёты.</p></div><label className="field">Модель<select value={model} onChange={e => setModel(e.target.value)}>{!ai?.models?.includes(model) && <option value={model}>{model || 'Нет доступных моделей'}</option>}{ai?.models?.map(m => <option key={m} value={m}>{m}</option>)}</select><small>Выберите текстовую модель. Например: qwen2.5:3b. Модели embeddings не подходят.</small></label><div className="settings-actions"><Button variant="primary" disabled={busy || !ai?.connected || !model} onClick={save}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Сохранить модель</Button><Button onClick={async () => {
            await checkAI();
            notify('Состояние подключения обновлено');
          }}><RefreshCw size={16} />Проверить подключение</Button></div><div className="settings-divider" /><h3>Если ИИ недоступен</h3><p>Сервис продолжает сохранять обращения и определять категории по ключевым словам. В карточке всегда указан источник результата. После запуска модели анализ можно повторить.</p><p className="small-text">Запустите локальный сервер ИИ и выберите установленную текстовую модель.</p></div></section><section className="privacy-card"><ShieldCheck size={26} /><h3>Локальное рабочее пространство</h3><p>Обращения хранятся в SQLite на этом компьютере. По умолчанию приложение и ИИ доступны только локально.</p><p>Для классификации передаются тема и текст. Отдельные поля имени и email не передаются; email и длинные номера в тексте маскируются.</p><p>Для совместной работы через интернет потребуется добавить авторизацию и HTTPS.</p></section></div>;
}
