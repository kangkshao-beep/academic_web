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
const COMPACT_GRAPH_QUERY = '(max-width: 639px)';
const COMPACT_ANCHOR_LABEL_LIMIT = 3;
const DEFAULT_ANCHOR_LABEL_LIMIT = 5;

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
  foundation: '#315f8c',
  method: '#2f7d71',
  phenomenology: '#765b8e',
  experiment: '#b9504b',
  review: '#ad762d',
  frontier: '#56616f',
};

const LAYER_COLORS: Record<RelationLayer, string> = {
  citation: '#6b7a8b',
  documented_semantic: '#2f7d71',
  curatorial: '#ad762d',
};

const LAYER_LINE_STYLES: Record<RelationLayer, 'solid' | 'dotted' | 'dashed'> = {
  citation: 'solid',
  documented_semantic: 'dotted',
  curatorial: 'dashed',
};

const GRAPH_STYLE: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'border-color': '#f8fafc',
      'border-width': 2.5,
      color: '#f8fafc',
      label: '',
      'font-size': 9.5,
      'font-weight': 600,
      'min-zoomed-font-size': 5.5,
      'text-background-color': '#182334',
      'text-background-opacity': 0.94,
      'text-background-padding': '4px',
      'text-background-shape': 'roundrectangle',
      'text-margin-y': 17,
      'text-max-width': '112px',
      'text-wrap': 'ellipsis',
      height: 'data(size)',
      width: 'data(size)',
      'overlay-opacity': 0,
      'z-index': 2,
    },
  },
  {
    selector: 'node[anchorLabel = "yes"], node.hovered, node:selected',
    style: {
      label: 'data(label)',
      'z-index': 12,
    },
  },
  {
    selector: 'node.hovered',
    style: {
      'border-color': '#d4a562',
      'border-width': 4,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#d4a562',
      'border-width': 5,
      'underlay-color': '#d4a562',
      'underlay-opacity': 0.2,
      'underlay-padding': 7,
    },
  },
  {
    selector: 'node.related',
    style: {
      'border-color': '#d4a562',
      'border-width': 3,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'straight',
      label: '',
      'font-size': 9,
      color: '#f8fafc',
      'text-background-color': '#182334',
      'text-background-opacity': 0.96,
      'text-background-padding': '4px',
      'text-background-shape': 'roundrectangle',
      'line-color': LAYER_COLORS.citation,
      'target-arrow-color': LAYER_COLORS.citation,
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.65,
      opacity: 0.42,
      width: 1.15,
      'overlay-opacity': 0,
      'z-index': 1,
    },
  },
  {
    selector: 'edge[layer = "documented_semantic"]',
    style: {
      'line-color': LAYER_COLORS.documented_semantic,
      'target-arrow-color': LAYER_COLORS.documented_semantic,
      'line-style': 'dotted',
      opacity: 0.58,
      width: 1.8,
    },
  },
  {
    selector: 'edge[layer = "curatorial"]',
    style: {
      'line-color': LAYER_COLORS.curatorial,
      'line-style': 'dashed',
      'target-arrow-shape': 'none',
      opacity: 0.54,
      width: 1.7,
    },
  },
  {
    selector: 'edge.emphasized',
    style: {
      opacity: 0.92,
      width: 2.6,
      'z-index': 8,
    },
  },
  {
    selector: '.muted',
    style: {
      opacity: 0.1,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      label: 'data(shortLabel)',
      'line-color': '#d4a562',
      'target-arrow-color': '#d4a562',
      opacity: 1,
      width: 3.5,
      'z-index': 14,
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
    padding: 32,
    randomize,
    nodeRepulsion: 9000,
    idealEdgeLength: 128,
    edgeElasticity: 90,
    nestingFactor: 1.2,
    gravity: 0.42,
    numIter: 1600,
    nodeOverlap: 28,
    componentSpacing: 42,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
  }).run();
}

function compactPaperLabel(paper: ReadingPaper): string {
  if (paper.collaboration) {
    return `${paper.collaboration.replace(/\s+Collaboration$/i, '')} · ${paper.year}`;
  }
  const leadAuthor = paper.authors[0]?.trim() || paper.id;
  const surname = leadAuthor.split(/\s+/).at(-1) || leadAuthor;
  return `${surname} · ${paper.year}`;
}

function sortedValues(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function useCompactGraphLabels(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_GRAPH_QUERY).matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_GRAPH_QUERY);
    const update = () => setCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return compact;
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
  anchorLabelLimit,
  onNodeSelect,
  onEdgeSelect,
  onCanvasClear,
}: {
  elements: ElementDefinition[];
  fitRevision: number;
  layoutRevision: number;
  selectedPaperId: string | null;
  selectedEdgeId: string | null;
  anchorLabelLimit: number;
  onNodeSelect: (id: string) => void;
  onEdgeSelect: (id: string) => void;
  onCanvasClear: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const callbacksRef = useRef({ onNodeSelect, onEdgeSelect, onCanvasClear });
  const nodeIdsRef = useRef<Set<string>>(new Set());
  const layoutRevisionRef = useRef(layoutRevision);
  const fitRevisionRef = useRef(fitRevision);
  const anchorLabelLimitRef = useRef(anchorLabelLimit);

  useEffect(() => {
    callbacksRef.current = { onNodeSelect, onEdgeSelect, onCanvasClear };
  }, [onCanvasClear, onEdgeSelect, onNodeSelect]);

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
      maxZoom: 1.8,
      wheelSensitivity: 0.18,
      layout: { name: 'preset' },
    });

    instance.on('tap', 'node', (event) => callbacksRef.current.onNodeSelect(event.target.id()));
    instance.on('tap', 'edge', (event) => callbacksRef.current.onEdgeSelect(event.target.id()));
    instance.on('tap', (event) => {
      if (event.target === instance) callbacksRef.current.onCanvasClear();
    });
    instance.on('mouseover', 'node', (event) => {
      event.target.addClass('hovered');
      container.style.cursor = 'pointer';
    });
    instance.on('mouseout', 'node', (event) => {
      event.target.removeClass('hovered');
      container.style.cursor = '';
    });
    instance.on('mouseover', 'edge', () => {
      container.style.cursor = 'pointer';
    });
    instance.on('mouseout', 'edge', () => {
      container.style.cursor = '';
    });
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
    const labelProfileChanged = anchorLabelLimitRef.current !== anchorLabelLimit;

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
    anchorLabelLimitRef.current = anchorLabelLimit;
    if (nodesChanged || layoutRequested || labelProfileChanged) {
      runGraphLayout(instance, layoutRequested || previousNodeIds.size === 0);
    }
  }, [anchorLabelLimit, elements, layoutRevision]);

  useEffect(() => {
    if (fitRevisionRef.current === fitRevision) return;
    fitRevisionRef.current = fitRevision;
    cyRef.current?.resize();
    cyRef.current?.fit(undefined, 30);
  }, [fitRevision]);

  useEffect(() => {
    const instance = cyRef.current;
    if (!instance) return;
    instance.elements().removeClass('muted emphasized related');
    instance.$(':selected').unselect();
    if (selectedPaperId) {
      const node = instance.getElementById(selectedPaperId);
      if (node.empty()) return;
      instance.elements().addClass('muted');
      node.closedNeighborhood().removeClass('muted');
      node.connectedEdges().addClass('emphasized');
      node.neighborhood('node').addClass('related');
      node.select();
      return;
    }
    if (selectedEdgeId) {
      const edge = instance.$(`edge[id = "${selectedEdgeId}"]`);
      if (edge.empty()) return;
      instance.elements().addClass('muted');
      edge.removeClass('muted').addClass('emphasized');
      edge.connectedNodes().removeClass('muted').addClass('related');
      edge.select();
    }
  }, [elements, selectedEdgeId, selectedPaperId]);

  return (
    <div
      ref={containerRef}
      className="h-[28rem] w-full overflow-hidden bg-[#fbfcfd] dark:bg-[#101827] sm:h-[34rem] xl:h-[38rem]"
      role="img"
      aria-label={`文献关系交互图，默认标注最多 ${anchorLabelLimit} 个关键节点。图谱详情区的当前文献列表提供键盘操作方式。`}
      aria-describedby="map-keyboard-fallback-description"
      data-testid="reading-graph-canvas"
      data-anchor-label-limit={anchorLabelLimit}
      style={{ touchAction: 'pan-y' }}
    />
  );
}

export default function MapView({ papers, relations, config, onOpenPaper }: MapViewProps) {
  const compactGraphLabels = useCompactGraphLabels();
  const anchorLabelLimit = compactGraphLabels
    ? COMPACT_ANCHOR_LABEL_LIMIT
    : DEFAULT_ANCHOR_LABEL_LIMIT;
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

  const graphDegree = useMemo(() => {
    const degree = new Map(displayedPapers.map((paper) => [paper.id, 0]));
    displayedRelations.forEach((relation) => {
      degree.set(relation.source, (degree.get(relation.source) ?? 0) + 1);
      degree.set(relation.target, (degree.get(relation.target) ?? 0) + 1);
    });
    return degree;
  }, [displayedPapers, displayedRelations]);

  const anchorLabelIds = useMemo(() => {
    const labelLimit = Math.min(displayedPapers.length, anchorLabelLimit);
    return new Set(
      [...displayedPapers]
        .sort((left, right) =>
          (graphDegree.get(right.id) ?? 0) - (graphDegree.get(left.id) ?? 0)
          || right.priority - left.priority
          || right.year - left.year
          || left.id.localeCompare(right.id)
        )
        .slice(0, labelLimit)
        .map((paper) => paper.id)
    );
  }, [anchorLabelLimit, displayedPapers, graphDegree]);

  const elements = useMemo<ElementDefinition[]>(() => [
    ...displayedPapers.map((paper) => ({
      data: {
        id: paper.id,
        label: compactPaperLabel(paper),
        color: ROLE_COLORS[paper.role],
        role: paper.role,
        size: paper.priority >= 5 ? 32 : 24,
        anchorLabel: anchorLabelIds.has(paper.id) ? 'yes' : 'no',
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
  ], [anchorLabelIds, displayedPapers, displayedRelations]);

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

  const clearSelection = useCallback(() => {
    setSelectedPaperId(null);
    setSelectedEdgeId(null);
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
    <div className="space-y-5">
      <section aria-labelledby="map-controls-heading" className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50/80 dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-800/35">
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
              <h2 id="map-controls-heading" className="flex items-center gap-2 font-serif text-xl font-semibold text-primary">
                <Network className="h-5 w-5 text-accent" aria-hidden="true" />
                文献关系图
              </h2>
              <p className="mt-1 text-sm tabular-nums text-neutral-500">
                优先级 {config.eligible_priority_min}+ · {eligiblePapers.length} 篇候选文献
              </p>
          </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowFullGraph((value) => !value)}
                aria-pressed={showFullGraph}
                className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium outline-none transition-colors focus:ring-2 focus:ring-accent ${
                  showFullGraph
                    ? 'border-primary bg-primary text-background'
                    : 'border-neutral-300 bg-white text-primary hover:border-accent dark:border-neutral-400 dark:bg-neutral-900'
                }`}
              >
                <UnfoldHorizontal className="h-4 w-4" aria-hidden="true" />
                {showFullGraph ? '回到当前展开' : '显示全部筛选结果'}
              </button>
              <button
                type="button"
                onClick={resetGraph}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-primary outline-none transition-colors hover:border-accent focus:ring-2 focus:ring-accent dark:border-neutral-400 dark:bg-neutral-900"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                重置
              </button>
            </div>
          </div>

          <form onSubmit={focusSearch} className="mt-5 flex flex-col gap-2 sm:flex-row">
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
                placeholder="搜索题名、作者或文献 ID"
                className="min-h-10 min-w-0 w-full rounded-md border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-400 dark:bg-neutral-900"
              />
            </div>
            <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-background outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-neutral-900">
              <LocateFixed className="h-4 w-4" aria-hidden="true" />
              定位
            </button>
          </form>
          <p className={searchMessage ? 'mt-2 text-xs text-neutral-500' : 'sr-only'} aria-live="polite">{searchMessage}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <FilterSelect label="主题" value={filters.topic} onChange={(value) => updateFilter('topic', value)} options={topics} />
            <FilterSelect label="过程" value={filters.process} onChange={(value) => updateFilter('process', value)} options={processes} />
            <FilterSelect label="角色" value={filters.role} onChange={(value) => updateFilter('role', value)} options={Object.keys(ROLE_LABELS)} labels={ROLE_LABELS} />
            <FilterSelect label="年份" value={filters.year} onChange={(value) => updateFilter('year', value)} options={years.map(String)} />
            <FilterSelect label="关系" value={relationFilter} onChange={setRelationFilter} options={relationTypes} labels={RELATION_LABELS} />
          </div>

          <fieldset className="mt-4 border-t border-neutral-200 pt-4 dark:border-[rgba(148,163,184,0.22)]">
            <legend className="px-1 text-xs font-semibold text-neutral-500">证据层</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(LAYER_LABELS) as RelationLayer[]).map((layer) => (
                <label key={layer} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  activeLayers.has(layer)
                    ? 'border-neutral-400 bg-white text-primary dark:border-neutral-400 dark:bg-neutral-900'
                    : 'border-neutral-200 bg-transparent text-neutral-500 dark:border-neutral-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={activeLayers.has(layer)}
                    onChange={() => toggleLayer(layer)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="w-6 border-t-2" style={{ borderColor: LAYER_COLORS[layer], borderStyle: LAYER_LINE_STYLES[layer] }} aria-hidden="true" />
                  {LAYER_LABELS[layer]}
                </label>
              ))}
              <span className="inline-flex min-h-9 items-center px-2 text-xs text-neutral-400">假设层为空</span>
            </div>
          </fieldset>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-label="关系图谱">
          <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 dark:border-[rgba(148,163,184,0.30)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium tabular-nums text-primary">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                {displayedPapers.length} 篇文献 · {displayedRelations.length} 条当前连线
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-500" aria-label="关系图例">
                <LegendLine color={LAYER_COLORS.citation} style="solid" label="引用" />
                <LegendLine color={LAYER_COLORS.documented_semantic} style="dotted" label="有据语义" />
                <LegendLine color={LAYER_COLORS.curatorial} style="dashed" label="阅读连接" />
              </div>
            </div>
            <div className="flex shrink-0 gap-2 self-end sm:self-auto">
              <button type="button" onClick={() => setFitRevision((revision) => revision + 1)} title="适配视图" aria-label="适配图谱视图" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 outline-none transition-colors hover:border-accent hover:text-accent focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)] dark:text-neutral-500">
                <Focus className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setLayoutRevision((revision) => revision + 1)} title="重新布局" aria-label="重新计算图谱布局" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 outline-none transition-colors hover:border-accent hover:text-accent focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)] dark:text-neutral-500">
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
              anchorLabelLimit={anchorLabelLimit}
              onNodeSelect={selectNode}
              onEdgeSelect={selectEdge}
              onCanvasClear={clearSelection}
            />
          ) : (
            <div className="flex h-[28rem] items-center justify-center p-8 text-center text-sm text-neutral-500 sm:h-[34rem] xl:h-[38rem]">
              当前筛选没有可显示的文献。请调整筛选或重置图谱。
            </div>
          )}
          <div className="border-t border-neutral-200 px-4 py-3 dark:border-[rgba(148,163,184,0.30)]">
            <h2 id="map-legend-heading" className="sr-only">图例与解释边界</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-500" aria-label="节点角色颜色">
              {(Object.keys(ROLE_LABELS) as PaperRole[]).map((role) => (
                <li key={role} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ backgroundColor: ROLE_COLORS[role] }} aria-hidden="true" />
                  {ROLE_LABELS[role]}
                </li>
              ))}
              <li className="inline-flex items-center gap-2 border-l border-neutral-200 pl-4 dark:border-neutral-700">
                <span className="h-2.5 w-2.5 rounded-full bg-neutral-400" aria-hidden="true" />
                <span className="h-3.5 w-3.5 rounded-full bg-neutral-400" aria-hidden="true" />
                优先级 4 / 5
              </li>
            </ul>
          </div>
        </section>

        <aside className="min-w-0 space-y-4" aria-label="图谱详情">
          {selectedPaper ? (
            <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="selected-paper-heading">
              <p className="flex items-center gap-2 text-xs font-semibold text-accent">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ROLE_COLORS[selectedPaper.role] }} aria-hidden="true" />
                选中文献
              </p>
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
                  <button type="button" onClick={() => expandFromSelection(config.default_hops as 1 | 2)} className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-primary outline-none hover:border-accent focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)]">
                    <UnfoldHorizontal className="h-4 w-4" aria-hidden="true" />
                    按默认展开 {config.default_hops} 跳
                  </button>
                )}
                {config.default_hops !== 1 && (
                  <button type="button" onClick={() => expandFromSelection(1)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-primary outline-none hover:border-accent focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)]">展开 1 跳</button>
                )}
                {config.max_expansion_hops >= 2 && config.default_hops !== 2 && (
                  <button type="button" onClick={() => expandFromSelection(2)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-primary outline-none hover:border-accent focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)]">展开 2 跳</button>
                )}
                <button type="button" onClick={() => onOpenPaper(selectedPaper.id)} className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 dark:bg-accent dark:text-neutral-900 dark:focus:ring-accent dark:focus:ring-offset-neutral-900">Library 详情</button>
              </div>
            </section>
          ) : selectedEdge ? (
            <EdgeDetail edge={selectedEdge} paperById={paperById} />
          ) : (
            <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="map-overview-heading">
              <p className="text-xs font-semibold text-accent">图谱概览</p>
              <h3 id="map-overview-heading" className="mt-1 font-serif text-lg font-semibold text-primary">当前范围</h3>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <DetailTerm label="显示文献" value={String(displayedPapers.length)} />
                <DetailTerm label="当前连线" value={String(displayedRelations.length)} />
                <DetailTerm label="启用证据层" value={`${activeLayers.size} / 3`} />
                <DetailTerm label="筛选候选" value={String(eligiblePapers.length)} />
              </dl>
            </section>
          )}

          {selectedPaper && (
            <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="adjacent-heading">
              <h3 id="adjacent-heading" className="text-sm font-semibold text-primary">邻接文献（键盘列表）</h3>
              {adjacent.length > 0 ? (
                <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {adjacent.map(({ relation, paper }) => (
                    <li key={`${relation.id}-${paper.id}`} className="py-3 first:pt-0 last:pb-0">
                      <button type="button" onClick={() => selectAdjacentNode(paper.id)} className="w-full rounded-sm text-left outline-none focus:ring-2 focus:ring-accent">
                        <span className="block text-sm font-medium leading-snug text-primary">{paper.title}</span>
                      </button>
                      <div className="mt-1 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0 break-words text-xs text-neutral-500">
                          {relation.directed ? (relation.source === selectedPaper.id ? '向外' : '向内') : '无向'} · {RELATION_LABELS[relation.relation]} · {LAYER_LABELS[relation.layer]}
                        </span>
                        <button type="button" onClick={() => openEdgeFromKeyboardList(relation.id)} className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 outline-none hover:border-accent hover:text-accent focus:ring-2 focus:ring-accent dark:border-[rgba(148,163,184,0.30)] dark:text-neutral-500" aria-label={`查看 ${paper.title} 的${RELATION_LABELS[relation.relation]}关系`}>
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

          <section id="map-keyboard-fallback" className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="map-keyboard-fallback-heading">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="map-keyboard-fallback-heading" className="text-sm font-semibold text-primary">文献索引</h3>
              <span className="shrink-0 text-xs tabular-nums text-neutral-400">{displayedPapers.length}</span>
            </div>
            <p id="map-keyboard-fallback-description" className="sr-only">
              图形画布用于指针探索；可用 Tab 键进入此列表并选择任一文献，再通过邻接列表检查关系。
            </p>
            {displayedPapers.length > 0 ? (
              <ul className="mt-3 max-h-[30rem] divide-y divide-neutral-200 overflow-y-auto pr-1 dark:divide-neutral-700">
                {displayedPapers.map((paper) => (
                  <li key={paper.id}>
                    <button
                      type="button"
                      onClick={() => selectNode(paper.id)}
                      aria-pressed={selectedPaperId === paper.id}
                      className={`w-full min-w-0 border-l-2 px-3 py-2.5 text-left outline-none transition-colors focus:ring-2 focus:ring-inset focus:ring-accent ${
                        selectedPaperId === paper.id
                          ? 'border-accent bg-amber-50 dark:bg-accent/10'
                          : 'border-transparent hover:border-neutral-300 hover:bg-neutral-50 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60'
                      }`}
                    >
                      <span className="block break-words text-sm font-medium leading-snug text-primary">{paper.title}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ROLE_COLORS[paper.role] }} aria-hidden="true" />
                        {paper.year} · {ROLE_LABELS[paper.role]}
                      </span>
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

      <p className="border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-500 dark:border-[rgba(148,163,184,0.30)]">
        箭头由来源指向被引用或被使用的文献。缺少连线只表示当前图谱信息不足；阅读连接仅用于导航，不构成历史影响或研究空白的证据。
      </p>
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
    <section id="selected-edge-detail" tabIndex={-1} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" aria-labelledby="selected-edge-heading">
      <p className="flex items-center gap-2 text-xs font-semibold text-accent">
        <span className="w-7 border-t-2" style={{ borderColor: LAYER_COLORS[edge.layer], borderStyle: LAYER_LINE_STYLES[edge.layer] }} aria-hidden="true" />
        选中关系
      </p>
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
