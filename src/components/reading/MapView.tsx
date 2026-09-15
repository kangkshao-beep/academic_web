'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition, type StylesheetStyle } from 'cytoscape';
import {
  ExternalLink,
  Focus,
  LocateFixed,
  Network,
  RotateCcw,
  Search,
  UnfoldHorizontal,
} from 'lucide-react';
import { verifiedExternalUrl } from '@/lib/reading/links';
import type {
  PaperRole,
  ReadingPaper,
  ReadingRelation,
  ReadingViewConfig,
  RelationLayer,
  RelationType,
} from '@/lib/reading/types';

interface MapViewProps {
  papers: ReadingPaper[];
  relations: ReadingRelation[];
  config: ReadingViewConfig['graph'];
  onOpenPaper: (paperId: string) => void;
}

interface PaperFilters {
  topic: string;
  process: string;
  role: string;
  year: string;
}

const ALL = 'all';

const ROLE_LABELS: Record<PaperRole, string> = {
  foundation: '基础',
  method: '方法',
  phenomenology: '唯象',
  experiment: '实验',
  review: '综述',
  frontier: '前沿',
};

const LAYER_LABELS: Record<RelationLayer, string> = {
  citation: '引用事实',
  documented_semantic: '有据语义关系',
  curatorial: '建议阅读连接',
};

const RELATION_LABELS: Record<RelationType, string> = {
  cites: '引用',
  uses_framework_of: '使用其框架',
  uses_data_from: '使用其数据',
  cross_checks_against: '与其交叉检验',
  adapts_method_of: '改编其方法',
  updates_software_of: '更新其软件',
  curated_connection: '建议阅读连接',
};

const ROLE_COLORS: Record<PaperRole, string> = {
  foundation: '#2563eb',
  method: '#0f766e',
  phenomenology: '#7c3aed',
  experiment: '#dc2626',
  review: '#b45309',
  frontier: '#475569',
};

const GRAPH_STYLE: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'border-color': '#ffffff',
      'border-width': 2,
      color: '#0f172a',
      label: 'data(label)',
      'font-size': 10,
      'font-weight': 600,
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.9,
      'text-background-padding': '3px',
      'text-background-shape': 'roundrectangle',
      'text-margin-y': 14,
      'text-max-width': '96px',
      'text-wrap': 'ellipsis',
      height: 23,
      width: 23,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#d4a562',
      'border-width': 5,
      height: 29,
      width: 29,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      label: '',
      'font-size': 8,
      color: '#475569',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.82,
      'text-background-padding': '2px',
      'line-color': '#64748b',
      'target-arrow-color': '#64748b',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      width: 1.6,
    },
  },
  {
    selector: 'edge[layer = "documented_semantic"]',
    style: {
      'line-color': '#0f766e',
      'target-arrow-color': '#0f766e',
      'line-style': 'dotted',
      width: 2.2,
    },
  },
  {
    selector: 'edge[layer = "curatorial"]',
    style: {
      'line-color': '#b45309',
      'line-style': 'dashed',
      'target-arrow-shape': 'none',
      width: 2.2,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      label: 'data(shortLabel)',
      'line-color': '#d4a562',
      'target-arrow-color': '#d4a562',
      width: 4,
      'z-index': 10,
    },
  },
];

function runGraphLayout(instance: Core, randomize: boolean): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  instance.layout({
    name: 'cose',
    animate: !reduceMotion,
    animationDuration: reduceMotion ? 0 : 300,
    fit: true,
    padding: 34,
    randomize,
    nodeRepulsion: 9000,
    idealEdgeLength: 180,
    edgeElasticity: 80,
    nestingFactor: 1.2,
    gravity: 0.18,
    numIter: 1200,
    nodeOverlap: 40,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
  }).run();
}

function sortedValues(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function matchesFilters(paper: ReadingPaper, filters: PaperFilters): boolean {
  return (
    (filters.topic === ALL || paper.topics.includes(filters.topic)) &&
    (filters.process === ALL || paper.processes.includes(filters.process)) &&
    (filters.role === ALL || paper.role === filters.role) &&
    (filters.year === ALL || paper.year === Number(filters.year))
  );
}

function GraphCanvas({
  elements,
  fitRevision,
  layoutRevision,
  selectedPaperId,
  selectedEdgeId,
  onNodeSelect,
  onEdgeSelect,
}: {
  elements: ElementDefinition[];
  fitRevision: number;
  layoutRevision: number;
  selectedPaperId: string | null;
  selectedEdgeId: string | null;
  onNodeSelect: (id: string) => void;
  onEdgeSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const callbacksRef = useRef({ onNodeSelect, onEdgeSelect });
  const nodeIdsRef = useRef<Set<string>>(new Set());
  const layoutRevisionRef = useRef(layoutRevision);
  const fitRevisionRef = useRef(fitRevision);

  useEffect(() => {
    callbacksRef.current = { onNodeSelect, onEdgeSelect };
  }, [onEdgeSelect, onNodeSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const allowSingleTouchPageScroll = (event: TouchEvent) => {
      if (event.touches.length === 1) event.stopPropagation();
    };
    container.addEventListener('touchmove', allowSingleTouchPageScroll, { passive: true });

    const instance = cytoscape({
      container,
      elements: [],
      style: GRAPH_STYLE,
      minZoom: 0.2,
      maxZoom: 2.5,
      wheelSensitivity: 0.18,
      layout: { name: 'preset' },
    });

    instance.on('tap', 'node', (event) => callbacksRef.current.onNodeSelect(event.target.id()));
    instance.on('tap', 'edge', (event) => callbacksRef.current.onEdgeSelect(event.target.id()));
    const resizeObserver = new ResizeObserver(() => {
      instance.resize();
      instance.fit(undefined, 30);
    });
    resizeObserver.observe(container);
    cyRef.current = instance;

    return () => {
      container.removeEventListener('touchmove', allowSingleTouchPageScroll);
      resizeObserver.disconnect();
      instance.destroy();
      if (cyRef.current === instance) {
        cyRef.current = null;
        nodeIdsRef.current = new Set();
      }
    };
  }, []);

  useEffect(() => {
    const instance = cyRef.current;
    if (!instance) return;

    const incomingIds = new Set(
      elements
        .map((element) => element.data?.id)
        .filter((id): id is string => typeof id === 'string')
    );
    const nextNodeIds = new Set(
      elements
        .filter((element) => !element.data?.source && !element.data?.target)
        .map((element) => element.data?.id)
        .filter((id): id is string => typeof id === 'string')
    );
    const previousNodeIds = nodeIdsRef.current;
    const nodesChanged =
      previousNodeIds.size !== nextNodeIds.size
      || Array.from(nextNodeIds).some((id) => !previousNodeIds.has(id));
    const layoutRequested = layoutRevisionRef.current !== layoutRevision;

    instance.batch(() => {
      instance.elements().forEach((element) => {
        if (!incomingIds.has(element.id())) element.remove();
      });
      elements.forEach((definition) => {
        const id = definition.data?.id;
        if (typeof id !== 'string') return;
        const existing = instance.getElementById(id);
        if (existing.empty()) instance.add(definition);
        else existing.data(definition.data);
      });
    });

    nodeIdsRef.current = nextNodeIds;
    layoutRevisionRef.current = layoutRevision;
    if (nodesChanged || layoutRequested) {
      runGraphLayout(instance, layoutRequested || previousNodeIds.size === 0);
    }
  }, [elements, layoutRevision]);

  useEffect(() => {
    if (fitRevisionRef.current === fitRevision) return;
    fitRevisionRef.current = fitRevision;
    cyRef.current?.resize();
    cyRef.current?.fit(undefined, 30);
  }, [fitRevision]);

  useEffect(() => {
    const instance = cyRef.current;
    if (!instance) return;
    instance.$(':selected').unselect();
    const selectedId = selectedPaperId ?? selectedEdgeId;
    if (!selectedId) return;
    const element = instance.getElementById(selectedId);
    if (element.empty()) return;
    element.select();
    instance.center(element);
  }, [selectedEdgeId, selectedPaperId]);

  return (
    <div
      ref={containerRef}
      className="h-[32rem] w-full overflow-hidden bg-white dark:bg-neutral-900 sm:h-[38rem]"
      role="img"
      aria-label="文献关系交互图。图谱详情区的当前文献列表提供键盘操作方式。"
      aria-describedby="map-keyboard-fallback-description"
      data-testid="reading-graph-canvas"
      style={{ touchAction: 'pan-y' }}
    />
  );
}

export default function MapView({ papers, relations, config, onOpenPaper }: MapViewProps) {
  const paperById = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);
  const [filters, setFilters] = useState<PaperFilters>({ topic: ALL, process: ALL, role: ALL, year: ALL });
  const [relationFilter, setRelationFilter] = useState<string>(ALL);
  const [activeLayers, setActiveLayers] = useState<Set<RelationLayer>>(() => {
    const initial = new Set(config.default_layers);
    if (config.curatorial_layer_default) initial.add('curatorial');
    return initial;
  });
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set(config.initial_focus_ids));
  const [showFullGraph, setShowFullGraph] = useState(false);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [fitRevision, setFitRevision] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const focusEdgeDetailRef = useRef(false);

  const topics = useMemo(() => sortedValues(papers.flatMap((paper) => paper.topics)), [papers]);
  const processes = useMemo(() => sortedValues(papers.flatMap((paper) => paper.processes)), [papers]);
  const years = useMemo(
    () => Array.from(new Set(papers.map((paper) => paper.year))).sort((left, right) => right - left),
    [papers]
  );
  const relationTypes = useMemo(
    () => sortedValues(relations.map((relation) => relation.relation)) as RelationType[],
    [relations]
  );

  const eligiblePapers = useMemo(
    () => papers.filter(
      (paper) => paper.priority >= config.eligible_priority_min && matchesFilters(paper, filters)
    ),
    [config.eligible_priority_min, filters, papers]
  );
  const eligibleIds = useMemo(() => new Set(eligiblePapers.map((paper) => paper.id)), [eligiblePapers]);

  const layerRelations = useMemo(
    () => relations.filter(
      (relation) =>
        activeLayers.has(relation.layer) &&
        (relationFilter === ALL || relation.relation === relationFilter)
    ),
    [activeLayers, relationFilter, relations]
  );

  const displayedIds = useMemo(() => {
    if (showFullGraph) return eligibleIds;
    return new Set(Array.from(visibleIds).filter((id) => eligibleIds.has(id)));
  }, [eligibleIds, showFullGraph, visibleIds]);

  const displayedPapers = useMemo(
    () => eligiblePapers.filter((paper) => displayedIds.has(paper.id)),
    [displayedIds, eligiblePapers]
  );
  const displayedRelations = useMemo(
    () => layerRelations.filter(
      (relation) => displayedIds.has(relation.source) && displayedIds.has(relation.target)
    ),
    [displayedIds, layerRelations]
  );

  const elements = useMemo<ElementDefinition[]>(() => [
    ...displayedPapers.map((paper) => ({
      data: {
        id: paper.id,
        label: `${paper.collaboration || paper.authors[0] || paper.id} · ${paper.year}`,
        color: ROLE_COLORS[paper.role],
        role: paper.role,
      },
    })),
    ...displayedRelations.map((relation) => ({
      data: {
        id: relation.id,
        source: relation.source,
        target: relation.target,
        layer: relation.layer,
        shortLabel: RELATION_LABELS[relation.relation],
      },
    })),
  ], [displayedPapers, displayedRelations]);

  const selectedPaper = selectedPaperId && displayedIds.has(selectedPaperId)
    ? paperById.get(selectedPaperId) ?? null
    : null;
  const selectedEdge = selectedEdgeId
    ? displayedRelations.find((relation) => relation.id === selectedEdgeId) ?? null
    : null;

  const adjacent = useMemo(() => {
    if (!selectedPaperId) return [];
    return layerRelations
      .filter(
        (relation) =>
          (relation.source === selectedPaperId || relation.target === selectedPaperId) &&
          eligibleIds.has(relation.source) &&
          eligibleIds.has(relation.target)
      )
      .map((relation) => {
        const adjacentId = relation.source === selectedPaperId ? relation.target : relation.source;
        return { relation, paper: paperById.get(adjacentId) };
      })
      .filter((entry): entry is { relation: ReadingRelation; paper: ReadingPaper } => Boolean(entry.paper));
  }, [eligibleIds, layerRelations, paperById, selectedPaperId]);

  useEffect(() => {
    if (selectedPaperId && !displayedIds.has(selectedPaperId)) {
      setSelectedPaperId(null);
      setSearchMessage('');
    }
  }, [displayedIds, selectedPaperId]);

  useEffect(() => {
    if (!selectedEdgeId) return;
    const stillAvailable = displayedRelations.some((relation) => relation.id === selectedEdgeId);
    if (!stillAvailable) setSelectedEdgeId(null);
  }, [displayedRelations, selectedEdgeId]);

  useEffect(() => {
    if (!selectedEdgeId || !focusEdgeDetailRef.current) return;
    focusEdgeDetailRef.current = false;
    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById('selected-edge-detail')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedEdgeId]);

  const resetGraph = useCallback(() => {
    setFilters({ topic: ALL, process: ALL, role: ALL, year: ALL });
    setRelationFilter(ALL);
    const initialLayers = new Set(config.default_layers);
    if (config.curatorial_layer_default) initialLayers.add('curatorial');
    setActiveLayers(initialLayers);
    setVisibleIds(new Set(config.initial_focus_ids));
    setShowFullGraph(false);
    setSelectedPaperId(null);
    setSelectedEdgeId(null);
    setSearchQuery('');
    setSearchMessage('');
    setLayoutRevision((revision) => revision + 1);
  }, [config.curatorial_layer_default, config.default_layers, config.initial_focus_ids]);

  const toggleLayer = (layer: RelationLayer) => {
    setActiveLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const expandFromSelection = (hops: 1 | 2) => {
    if (!selectedPaperId) return;
    const next = new Set(visibleIds);
    next.add(selectedPaperId);
    let frontier = new Set([selectedPaperId]);

    for (let depth = 0; depth < hops; depth += 1) {
      const following = new Set<string>();
      for (const relation of layerRelations) {
        if (!eligibleIds.has(relation.source) || !eligibleIds.has(relation.target)) continue;
        if (frontier.has(relation.source)) following.add(relation.target);
        if (frontier.has(relation.target)) following.add(relation.source);
      }
      following.forEach((id) => next.add(id));
      frontier = following;
    }

    setShowFullGraph(false);
    setVisibleIds(next);
    setLayoutRevision((revision) => revision + 1);
  };

  const focusSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    const match = eligiblePapers.find((paper) =>
      [paper.id, paper.title, paper.collaboration ?? '', ...paper.authors]
        .some((value) => value.toLowerCase().includes(query))
    );
    if (!match) {
      setSearchMessage('当前筛选范围内没有匹配文献。');
      return;
    }
    setVisibleIds((current) => new Set([...current, match.id]));
    setShowFullGraph(false);
    setSelectedPaperId(match.id);
    setSelectedEdgeId(null);
    setSearchMessage(`已定位：${match.title}`);
    setFitRevision((revision) => revision + 1);
  };

  const selectNode = useCallback((id: string) => {
    setSelectedPaperId(id);
    setSelectedEdgeId(null);
  }, []);

  const selectEdge = useCallback((id: string) => {
    setSelectedEdgeId(id);
    setSelectedPaperId(null);
  }, []);

  const selectAdjacentNode = (id: string) => {
    setVisibleIds((current) => new Set([...current, id]));
    selectNode(id);
  };

  const updateFilter = (key: keyof PaperFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setSearchMessage('');
  };

  const openEdgeFromKeyboardList = (id: string) => {
    const relation = relations.find((candidate) => candidate.id === id);
    if (relation) {
      setVisibleIds((current) => new Set([...current, relation.source, relation.target]));
    }
    focusEdgeDetailRef.current = true;
    selectEdge(id);
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="map-controls-heading" className="border border-neutral-200 bg-neutral-50 p-4 dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-800/40">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <h2 id="map-controls-heading" className="flex items-center gap-2 text-lg font-semibold text-primary">
              <Network className="h-5 w-5 text-accent" aria-hidden="true" />
              图谱范围
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-500">
              优先级至少 {config.eligible_priority_min}；缺少连线表示图谱信息缺失，不表示尚无人研究。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowFullGraph((value) => !value)}
              aria-pressed={showFullGraph}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-primary hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-neutral-400 dark:bg-neutral-900"
            >
              <UnfoldHorizontal className="h-4 w-4" aria-hidden="true" />
              {showFullGraph ? '回到当前展开' : '显示全部筛选结果'}
            </button>
            <button
              type="button"
              onClick={resetGraph}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-primary hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-neutral-400 dark:bg-neutral-900"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              重置
            </button>
          </div>
        </div>

        <form onSubmit={focusSearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="map-search" className="sr-only">搜索并定位文献</label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
            <input
              id="map-search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchMessage('');
              }}
              placeholder="题名、作者或文献 ID"
              className="min-w-0 w-full rounded-md border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-400 dark:bg-neutral-900"
            />
          </div>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-background focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-neutral-900">
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
            定位
          </button>
        </form>
        <p className="mt-2 min-h-5 text-xs text-neutral-500" aria-live="polite">{searchMessage}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect label="主题" value={filters.topic} onChange={(value) => updateFilter('topic', value)} options={topics} />
          <FilterSelect label="过程" value={filters.process} onChange={(value) => updateFilter('process', value)} options={processes} />
          <FilterSelect label="角色" value={filters.role} onChange={(value) => updateFilter('role', value)} options={Object.keys(ROLE_LABELS)} labels={ROLE_LABELS} />
          <FilterSelect label="年份" value={filters.year} onChange={(value) => updateFilter('year', value)} options={years.map(String)} />
          <FilterSelect label="关系" value={relationFilter} onChange={setRelationFilter} options={relationTypes} labels={RELATION_LABELS} />
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold uppercase text-neutral-500">证据层</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {(Object.keys(LAYER_LABELS) as RelationLayer[]).map((layer) => (
              <label key={layer} className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-600">
                <input
                  type="checkbox"
                  checked={activeLayers.has(layer)}
                  onChange={() => toggleLayer(layer)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {LAYER_LABELS[layer]}
              </label>
            ))}
            <span className="text-sm text-neutral-500">假设层：空（v1）</span>
          </div>
        </fieldset>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 border border-neutral-200 bg-white dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-label="关系图谱">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 text-sm dark:border-[rgba(148,163,184,0.30)]">
            <span className="text-neutral-600 dark:text-neutral-500">
              {displayedPapers.length} 篇文献 · {displayedRelations.length} 条当前连线
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setFitRevision((revision) => revision + 1)} title="适配视图" aria-label="适配图谱视图" className="border border-neutral-300 p-2 text-neutral-600 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)] dark:text-neutral-600">
                <Focus className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setLayoutRevision((revision) => revision + 1)} title="重新布局" aria-label="重新计算图谱布局" className="border border-neutral-300 p-2 text-neutral-600 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)] dark:text-neutral-600">
                <Network className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {displayedPapers.length > 0 ? (
            <GraphCanvas
              elements={elements}
              fitRevision={fitRevision}
              layoutRevision={layoutRevision}
              selectedPaperId={selectedPaperId}
              selectedEdgeId={selectedEdgeId}
              onNodeSelect={selectNode}
              onEdgeSelect={selectEdge}
            />
          ) : (
            <div className="flex h-[32rem] items-center justify-center p-8 text-center text-sm text-neutral-500 sm:h-[38rem]">
              当前筛选没有可显示的文献。请调整筛选或重置图谱。
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-5" aria-label="图谱详情">
          {selectedPaper ? (
            <section className="border border-neutral-200 bg-white p-4 dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="selected-paper-heading">
              <p className="text-xs font-semibold uppercase text-accent">选中文献</p>
              <h3 id="selected-paper-heading" className="mt-2 break-words font-serif text-lg font-semibold leading-snug text-primary">{selectedPaper.title}</h3>
              <p className="mt-2 break-words text-sm text-neutral-600 dark:text-neutral-500">
                {selectedPaper.authors.join(', ')}{!selectedPaper.authors_complete && '（作者列表不完整）'}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <DetailTerm label="年份" value={String(selectedPaper.year)} />
                <DetailTerm label="角色" value={ROLE_LABELS[selectedPaper.role]} />
                <DetailTerm label="建议优先级" value={`${selectedPaper.priority} / 5`} />
                <DetailTerm label="阅读状态" value={selectedPaper.reading_status === 'unknown' ? '未知' : selectedPaper.reading_status} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {config.default_hops >= 1 && (
                  <button type="button" onClick={() => expandFromSelection(config.default_hops as 1 | 2)} className="inline-flex items-center gap-2 border border-neutral-300 px-3 py-2 text-sm font-medium text-primary hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)]">
                    <UnfoldHorizontal className="h-4 w-4" aria-hidden="true" />
                    按默认展开 {config.default_hops} 跳
                  </button>
                )}
                {config.default_hops !== 1 && (
                  <button type="button" onClick={() => expandFromSelection(1)} className="border border-neutral-300 px-3 py-2 text-sm font-medium text-primary hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)]">展开 1 跳</button>
                )}
                {config.max_expansion_hops >= 2 && config.default_hops !== 2 && (
                  <button type="button" onClick={() => expandFromSelection(2)} className="border border-neutral-300 px-3 py-2 text-sm font-medium text-primary hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)]">展开 2 跳</button>
                )}
                <button type="button" onClick={() => onOpenPaper(selectedPaper.id)} className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 dark:bg-accent dark:text-neutral-900 dark:focus:ring-accent dark:focus:ring-offset-neutral-900">Library 详情</button>
              </div>
            </section>
          ) : selectedEdge ? (
            <EdgeDetail edge={selectedEdge} paperById={paperById} />
          ) : (
            <section className="border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-[rgba(148,163,184,0.30)]">
              选择节点可查看文献与邻接项；选择连线可检查方向、证据和状态。
            </section>
          )}

          {selectedPaper && (
            <section className="border border-neutral-200 bg-white p-4 dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="adjacent-heading">
              <h3 id="adjacent-heading" className="text-sm font-semibold text-primary">邻接文献（键盘列表）</h3>
              {adjacent.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {adjacent.map(({ relation, paper }) => (
                    <li key={`${relation.id}-${paper.id}`} className="border-l-2 border-accent pl-3">
                      <button type="button" onClick={() => selectAdjacentNode(paper.id)} className="w-full text-left focus:outline-none focus:ring-2 focus:ring-accent">
                        <span className="block text-sm font-medium leading-snug text-primary">{paper.title}</span>
                      </button>
                      <div className="mt-1 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0 break-words text-xs text-neutral-500">
                          {relation.directed ? (relation.source === selectedPaper.id ? '向外' : '向内') : '无向'} · {RELATION_LABELS[relation.relation]} · {LAYER_LABELS[relation.layer]}
                        </span>
                        <button type="button" onClick={() => openEdgeFromKeyboardList(relation.id)} className="shrink-0 border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)] dark:text-neutral-600" aria-label={`查看 ${paper.title} 的${RELATION_LABELS[relation.relation]}关系`}>
                          查看关系
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">当前证据层与筛选下没有邻接项。</p>
              )}
            </section>
          )}

          <section id="map-keyboard-fallback" className="border border-neutral-200 bg-white p-4 dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="map-keyboard-fallback-heading">
            <h3 id="map-keyboard-fallback-heading" className="text-sm font-semibold text-primary">当前图谱文献（键盘列表）</h3>
            <p id="map-keyboard-fallback-description" className="mt-2 text-xs leading-relaxed text-neutral-500">
              图形画布用于指针探索；可用 Tab 键进入此列表并选择任一文献，再通过邻接列表检查关系。
            </p>
            {displayedPapers.length > 0 ? (
              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {displayedPapers.map((paper) => (
                  <li key={paper.id}>
                    <button
                      type="button"
                      onClick={() => selectNode(paper.id)}
                      aria-pressed={selectedPaperId === paper.id}
                      className={`w-full min-w-0 rounded border px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-accent ${
                        selectedPaperId === paper.id
                          ? 'border-amber-700 bg-amber-50 dark:border-accent dark:bg-accent/10'
                          : 'border-neutral-200 hover:border-amber-700 dark:border-neutral-400 dark:hover:border-accent'
                      }`}
                    >
                      <span className="block break-words text-sm font-medium leading-snug text-primary">{paper.title}</span>
                      <span className="mt-1 block text-xs text-neutral-500">{paper.year} · {ROLE_LABELS[paper.role]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">当前筛选没有可选择的文献。</p>
            )}
          </section>
        </aside>
      </div>

      <section aria-labelledby="map-legend-heading" className="border-t border-neutral-200 pt-4 dark:border-[rgba(148,163,184,0.30)]">
        <h2 id="map-legend-heading" className="text-sm font-semibold text-primary">图例与解释边界</h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-xs text-neutral-600 dark:text-neutral-500">
          <LegendLine color="#64748b" style="solid" label="引用：实线、有箭头" />
          <LegendLine color="#0f766e" style="dotted" label="有据语义：点线、有箭头" />
          <LegendLine color="#b45309" style="dashed" label="策展连接：虚线、无方向" />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-600 dark:text-neutral-500" aria-label="节点角色颜色">
          {(Object.keys(ROLE_LABELS) as PaperRole[]).map((role) => (
            <li key={role} className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-white shadow-sm" style={{ backgroundColor: ROLE_COLORS[role] }} aria-hidden="true" />
              {ROLE_LABELS[role]}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          箭头从 source 指向 target：source cites target；uses_data_from 表示分析使用测量数据。图中路径不证明历史影响，策展连接只是建议的阅读导航。
        </p>
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="text-xs font-medium text-neutral-600 dark:text-neutral-500">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block min-w-0 max-w-full w-full rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-400 dark:bg-neutral-900">
        <option value={ALL}>全部</option>
        {options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}
      </select>
    </label>
  );
}

function DetailTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-primary">{value}</dd>
    </div>
  );
}

function EdgeDetail({ edge, paperById }: { edge: ReadingRelation; paperById: Map<string, ReadingPaper> }) {
  const source = paperById.get(edge.source);
  const target = paperById.get(edge.target);
  return (
    <section id="selected-edge-detail" tabIndex={-1} className="border border-neutral-200 bg-white p-4 outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="selected-edge-heading">
      <p className="text-xs font-semibold uppercase text-accent">选中关系</p>
      <h3 id="selected-edge-heading" className="mt-2 text-base font-semibold text-primary">{RELATION_LABELS[edge.relation]}</h3>
      <p className="mt-3 break-words text-sm leading-relaxed text-neutral-700 dark:text-neutral-600">
        <span className="font-medium">{source?.title ?? edge.source}</span>
        <span className="mx-2 text-accent" aria-label={edge.directed ? '指向' : '双向连接'}>{edge.directed ? '→' : '—'}</span>
        <span className="font-medium">{target?.title ?? edge.target}</span>
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <DetailTerm label="证据层" value={LAYER_LABELS[edge.layer]} />
        <DetailTerm label="方向" value={edge.directed ? '有向' : '无向'} />
        <DetailTerm label="置信标记" value={edge.confidence === 'high' ? '高（已核证）' : '策展建议'} />
        <DetailTerm label="状态" value={edge.status === 'evidence_checked' ? '证据已检查' : '建议'} />
      </dl>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">{edge.note}</p>
      <h4 className="mt-5 text-sm font-semibold text-primary">证据</h4>
      <ul className="mt-2 space-y-3 text-xs text-neutral-600 dark:text-neutral-500">
        {edge.evidence.map((evidence, index) => {
          if (evidence.kind === 'primary_source') {
            const url = verifiedExternalUrl(evidence.url);
            return (
              <li key={`${evidence.kind}-${index}`} className="border-l-2 border-neutral-300 pl-3 dark:border-[rgba(148,163,184,0.30)]">
                <span className="block">原始来源 · {evidence.locator} · 核对于 {evidence.checked_on}</span>
                {url && <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="mt-1 inline-flex items-center gap-1 font-medium text-amber-700 hover:underline dark:text-accent"><ExternalLink className="h-3 w-3" aria-hidden="true" />查看证据</a>}
              </li>
            );
          }
          return (
            <li key={`${evidence.kind}-${index}`} className="border-l-2 border-neutral-300 pl-3 dark:border-[rgba(148,163,184,0.30)]">
              论文语境：第 {evidence.chapter} 章 {evidence.section}，印刷页 {evidence.printed_pages.join(', ')} / PDF 页 {evidence.pdf_pages.join(', ')}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LegendLine({ color, style, label }: { color: string; style: 'solid' | 'dotted' | 'dashed'; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-10 border-t-2" style={{ borderColor: color, borderStyle: style }} aria-hidden="true" />
      {label}
    </span>
  );
}
