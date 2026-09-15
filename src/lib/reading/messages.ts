import type {
  PaperEntryType,
  PaperOrigin,
  PaperRole,
  ReadingStatus,
  RelationLayer,
  RelationType,
} from './types';

type SupportedReadingLocale = 'en' | 'zh' | 'zh-hk';

type IdentityStatus = 'primary_record_checked' | 'thesis_only' | 'needs_review';
type PriorityBasis = 'assistant_proposed_curatorial_relevance' | 'user_confirmed';
type CurationStatus = 'proposed' | 'accepted' | 'archived';
type AnnotationAuthor = 'assistant' | 'user';

export interface ReadingMessages {
  app: {
    eyebrow: string;
    title: string;
    description: string;
    countSummary: (papers: number, relations: number, threads: number) => string;
    viewNavigation: string;
    tabs: Record<'library' | 'map' | 'threads', string>;
    dataNoticeLabel: string;
    dataNotice: string;
    loading: string;
    mapLoading: string;
    malformedTitle: string;
    malformedMessage: string;
    unavailableTitle: string;
    unavailableMessage: string;
    retry: string;
  };
  labels: {
    roles: Record<PaperRole, string>;
    origins: Record<PaperOrigin, string>;
    entryTypes: Record<PaperEntryType, string>;
    statuses: Record<ReadingStatus, string>;
    relationTypes: Record<RelationType, string>;
    relationLayers: Record<RelationLayer, string>;
    identityStatuses: Record<IdentityStatus, string>;
    verificationSourceKinds: Record<string, string>;
    priorityBases: Record<PriorityBasis, string>;
    curationStatuses: Record<CurationStatus, string>;
    annotationAuthors: Record<AnnotationAuthor, string>;
    proposed: string;
    confirmed: string;
    accepted: string;
    notRecorded: string;
  };
  library: {
    filtersRegion: string;
    searchLabel: string;
    searchPlaceholder: string;
    reset: string;
    filters: {
      topics: string;
      processes: string;
      roles: string;
      years: string;
      priorities: string;
      origins: string;
    };
    allFilters: {
      topics: string;
      processes: string;
      roles: string;
      years: string;
      priorities: string;
      origins: string;
    };
    priorityOption: (priority: number) => string;
    recordsHeading: string;
    showing: (shown: number, total: number) => string;
    noRecords: string;
    clearFilters: string;
    priority: (priority: number, state: string) => string;
    partialAuthorList: string;
    readingStatus: string;
    topics: string;
    processes: string;
    openExternal: (service: string, title: string) => string;
    showDetails: string;
    hideDetails: string;
    whyRetained: string;
    researchConnection: string;
    thesisProvenance: string;
    bibliographyReference: (reference: number) => string;
    chapter: (chapter: number, section: string) => string;
    pageLocations: (printed: string, pdf: string) => string;
    noThesisLocation: string;
    metadataVerification: string;
    publicationYear: string;
    preprintYear: string;
    journal: string;
    identityStatus: string;
    checkedOn: string;
    verificationSources: string;
    noVerificationNotes: string;
    annotationProvenance: string;
    annotationAuthor: string;
    priorityBasis: string;
    curationStatus: string;
    personalNotes: string;
    noPersonalNotes: string;
    ideaHooks: string;
    noIdeaHooks: string;
    relatedPapers: string;
    noRelations: string;
    undirectedConnection: string;
    outgoingRelation: string;
    incomingRelation: string;
  };
  map: {
    heading: string;
    candidateSummary: (priority: number, papers: number) => string;
    returnToExpansion: string;
    showAllResults: string;
    reset: string;
    searchLabel: string;
    searchPlaceholder: string;
    locate: string;
    noSearchMatch: string;
    located: (title: string) => string;
    filters: {
      topic: string;
      process: string;
      role: string;
      year: string;
      relation: string;
    };
    all: string;
    evidenceLayers: string;
    hypothesisEmpty: string;
    graphRegion: string;
    graphSummary: (papers: number, relations: number) => string;
    relationLegend: string;
    citationLegend: string;
    semanticLegend: string;
    curatorialLegend: string;
    fitView: string;
    relayout: string;
    canvasLabel: (limit: number) => string;
    noVisiblePapers: string;
    legendBoundary: string;
    roleColors: string;
    prioritySizes: string;
    details: string;
    selectedPaper: string;
    partialAuthorList: string;
    year: string;
    role: string;
    suggestedPriority: string;
    readingStatus: string;
    expandDefault: (hops: number) => string;
    expandHops: (hops: number) => string;
    libraryDetails: string;
    overview: string;
    currentScope: string;
    visiblePapers: string;
    currentRelations: string;
    enabledLayers: string;
    filteredCandidates: string;
    adjacentPapers: string;
    outgoing: string;
    incoming: string;
    undirected: string;
    viewRelation: string;
    viewRelationFor: (title: string, relation: string) => string;
    noAdjacent: string;
    paperIndex: string;
    keyboardDescription: string;
    noSelectablePapers: string;
    disclaimer: string;
    selectedRelation: string;
    pointsTo: string;
    bidirectional: string;
    evidenceLayer: string;
    direction: string;
    directed: string;
    confidence: string;
    confidenceHigh: string;
    confidenceCuratorial: string;
    status: string;
    evidenceChecked: string;
    evidence: string;
    primarySource: (locator: string, checkedOn: string) => string;
    viewEvidence: string;
    thesisContext: (chapter: number, section: string, printed: string, pdf: string) => string;
  };
  threads: {
    heading: string;
    description: string;
    libraryNotice: string;
    empty: string;
    threadNumber: (index: number) => string;
    thesisChapters: string;
    chapter: (chapter: number) => string;
    noneListed: string;
    annotation: string;
    orderedStages: string;
    orderedStagesLabel: (title: string) => string;
    linkedPapersLabel: (stage: string) => string;
    linkedPaperUnavailable: string;
    openPaper: (title: string, year: number) => string;
    noLinkedLiterature: string;
    readingPrompt: string;
    readingPromptLabel: (title: string) => string;
    promptDisclaimer: string;
  };
}

const en: ReadingMessages = {
  app: {
    eyebrow: 'Open · Read only',
    title: 'Reading',
    description: 'A research reading index, relationship map, and thematic paths for inclusive heavy-flavor semileptonic decays.',
    countSummary: (papers, relations, threads) => `${papers} ${papers === 1 ? 'paper' : 'papers'} · ${relations} ${relations === 1 ? 'relation' : 'relations'} · ${threads} ${threads === 1 ? 'thread' : 'threads'}`,
    viewNavigation: 'Reading views',
    tabs: { library: 'Library', map: 'Map', threads: 'Threads' },
    dataNoticeLabel: 'Reading data notice',
    dataNotice: 'Priorities, descriptions, and reading order retain the proposal provenance recorded in the data. An unknown reading status does not mean read. This browser does not save edits, notes, or filter state.',
    loading: 'Loading Reading data…',
    mapLoading: 'Loading the local map component…',
    malformedTitle: 'Data does not match the Reading v1 contract',
    malformedMessage: 'The Reading data could not be verified. Please try again later.',
    unavailableTitle: 'Reading data is temporarily unavailable',
    unavailableMessage: 'The Reading data service could not be reached. Please try again later.',
    retry: 'Retry',
  },
  labels: {
    roles: { foundation: 'Foundation', method: 'Method', phenomenology: 'Phenomenology', experiment: 'Experiment', review: 'Review', frontier: 'Frontier' },
    origins: { thesis_ch1_7: 'Thesis Ch. 1–7', bibliography_only: 'Bibliography only', external_supplement: 'External supplement' },
    entryTypes: { article: 'Article', book: 'Book', proceedings: 'Proceedings', preprint: 'Preprint' },
    statuses: { unknown: 'Unknown (not marked as read)', to_read: 'To read', skimmed: 'Skimmed', read: 'Read', deep_read: 'Deep read', revisit: 'Revisit' },
    relationTypes: { cites: 'Cites', uses_framework_of: 'Uses its framework', uses_data_from: 'Uses its data', cross_checks_against: 'Cross-checks against it', adapts_method_of: 'Adapts its method', updates_software_of: 'Updates its software', curated_connection: 'Suggested reading link' },
    relationLayers: { citation: 'Citation evidence', documented_semantic: 'Documented semantic relation', curatorial: 'Suggested reading link' },
    identityStatuses: { primary_record_checked: 'Primary record checked', thesis_only: 'Thesis only', needs_review: 'Needs review' },
    verificationSourceKinds: { arxiv_record: 'arXiv record', bibliographic_record: 'Bibliographic record', primary_reference_list: 'Primary reference list', publisher_record: 'Publisher record', publisher_supplied_repository: 'Publisher-supplied repository' },
    priorityBases: { assistant_proposed_curatorial_relevance: 'Assistant-proposed curatorial relevance', user_confirmed: 'User confirmed' },
    curationStatuses: { proposed: 'Proposed', accepted: 'Accepted', archived: 'Archived' },
    annotationAuthors: { assistant: 'Assistant proposal', user: 'User' },
    proposed: 'proposed', confirmed: 'confirmed', accepted: 'Accepted', notRecorded: 'Not recorded',
  },
  library: {
    filtersRegion: 'Library search and filters', searchLabel: 'Search the Reading library', searchPlaceholder: 'Search titles, authors, identifiers, topics, processes, or annotations', reset: 'Reset',
    filters: { topics: 'Topics', processes: 'Processes', roles: 'Roles', years: 'Years', priorities: 'Priorities', origins: 'Origins' },
    allFilters: { topics: 'All topics', processes: 'All processes', roles: 'All roles', years: 'All years', priorities: 'All priorities', origins: 'All origins' },
    priorityOption: (priority) => `Priority ${priority}`, recordsHeading: 'Library records', showing: (shown, total) => `Showing ${shown} of ${total}`, noRecords: 'No records match these controls.', clearFilters: 'Clear search and filters',
    priority: (priority, state) => `Priority ${priority} · ${state}`, partialAuthorList: '(partial author list)', readingStatus: 'Reading status', topics: 'Topics', processes: 'Processes',
    openExternal: (service, title) => `Open ${service} record for ${title} in a new tab`, showDetails: 'Show details', hideDetails: 'Hide details', whyRetained: 'Why this record is retained', researchConnection: 'Research connection', thesisProvenance: 'Thesis provenance',
    bibliographyReference: (reference) => `Thesis bibliography reference [${reference}]`, chapter: (chapter, section) => `Chapter ${chapter} · ${section}`, pageLocations: (printed, pdf) => `Printed pages ${printed} · PDF pages ${pdf}`, noThesisLocation: 'No in-scope thesis location is assigned.',
    metadataVerification: 'Metadata and verification', publicationYear: 'Publication year', preprintYear: 'Preprint year', journal: 'Journal', identityStatus: 'Identity status', checkedOn: 'Checked on', verificationSources: 'Verification sources', noVerificationNotes: 'No additional metadata or version notes.',
    annotationProvenance: 'Annotation provenance', annotationAuthor: 'Annotation author', priorityBasis: 'Priority basis', curationStatus: 'Curation status', personalNotes: 'Personal notes', noPersonalNotes: 'No personal notes recorded.', ideaHooks: 'Idea hooks', noIdeaHooks: 'No idea hooks recorded.', relatedPapers: 'Related papers', noRelations: 'No recorded relations for this paper.',
    undirectedConnection: 'Undirected proposed connection', outgoingRelation: 'Outgoing relation', incomingRelation: 'Incoming relation',
  },
  map: {
    heading: 'Literature relationship map', candidateSummary: (priority, papers) => `Priority ${priority}+ · ${papers} candidate ${papers === 1 ? 'paper' : 'papers'}`, returnToExpansion: 'Return to current expansion', showAllResults: 'Show all filtered results', reset: 'Reset',
    searchLabel: 'Search and locate a paper', searchPlaceholder: 'Search title, author, or paper ID', locate: 'Locate', noSearchMatch: 'No matching paper in the current filters.', located: (title) => `Located: ${title}`,
    filters: { topic: 'Topic', process: 'Process', role: 'Role', year: 'Year', relation: 'Relation' }, all: 'All', evidenceLayers: 'Evidence layers', hypothesisEmpty: 'Hypothesis layer is empty', graphRegion: 'Relationship graph', graphSummary: (papers, relations) => `${papers} ${papers === 1 ? 'paper' : 'papers'} · ${relations} current ${relations === 1 ? 'relation' : 'relations'}`,
    relationLegend: 'Relationship legend', citationLegend: 'Citation', semanticLegend: 'Documented semantic', curatorialLegend: 'Reading link', fitView: 'Fit graph view', relayout: 'Recalculate graph layout', canvasLabel: (limit) => `Interactive literature relationship graph. Up to ${limit} key nodes are labelled by default. Use the current-paper list in graph details for keyboard access.`,
    noVisiblePapers: 'No papers match the current filters. Adjust the filters or reset the graph.', legendBoundary: 'Legend and interpretation boundary', roleColors: 'Node role colors', prioritySizes: 'Priority 4 / 5', details: 'Graph details', selectedPaper: 'Selected paper', partialAuthorList: '(partial author list)',
    year: 'Year', role: 'Role', suggestedPriority: 'Suggested priority', readingStatus: 'Reading status', expandDefault: (hops) => `Expand default ${hops} hop${hops === 1 ? '' : 's'}`, expandHops: (hops) => `Expand ${hops} hop${hops === 1 ? '' : 's'}`, libraryDetails: 'Library details',
    overview: 'Graph overview', currentScope: 'Current scope', visiblePapers: 'Visible papers', currentRelations: 'Current relations', enabledLayers: 'Enabled evidence layers', filteredCandidates: 'Filtered candidates', adjacentPapers: 'Adjacent papers (keyboard list)', outgoing: 'outgoing', incoming: 'incoming', undirected: 'undirected', viewRelation: 'View relation', viewRelationFor: (title, relation) => `View the ${relation} relation for ${title}`, noAdjacent: 'No adjacent items under the current evidence layers and filters.',
    paperIndex: 'Paper index', keyboardDescription: 'The graph canvas supports pointer exploration. Use Tab to enter this list, select a paper, and inspect its relations in the adjacent-paper list.', noSelectablePapers: 'No papers are available under the current filters.', disclaimer: 'Arrows point from the source to the cited or used paper. A missing edge only means the current graph has insufficient information. Reading links are for navigation and are not evidence of historical influence or a research gap.',
    selectedRelation: 'Selected relation', pointsTo: 'points to', bidirectional: 'bidirectional link', evidenceLayer: 'Evidence layer', direction: 'Direction', directed: 'Directed', confidence: 'Confidence marker', confidenceHigh: 'High (verified)', confidenceCuratorial: 'Curatorial suggestion', status: 'Status', evidenceChecked: 'Evidence checked', evidence: 'Evidence', primarySource: (locator, checkedOn) => `Primary source · ${locator} · checked on ${checkedOn}`, viewEvidence: 'View evidence', thesisContext: (chapter, section, printed, pdf) => `Thesis context: Chapter ${chapter} ${section}, printed pages ${printed} / PDF pages ${pdf}`,
  },
  threads: {
    heading: 'Threads', description: 'Curated reading order for the supplied paths. A thread is a navigation aid, not a checked citation chain.', libraryNotice: 'Paper links open the corresponding Library detail. Empty diagnostic stages remain intentionally unlinked.', empty: 'No reading threads are available.',
    threadNumber: (index) => `Thread ${index}`, thesisChapters: 'Thesis chapters:', chapter: (chapter) => `Ch. ${chapter}`, noneListed: 'None listed', annotation: 'Annotation:', orderedStages: 'Ordered stages', orderedStagesLabel: (title) => `${title} ordered reading stages`, linkedPapersLabel: (stage) => `${stage} linked papers`, linkedPaperUnavailable: 'Linked paper unavailable', openPaper: (title, year) => `Open paper ${title} (${year})`, noLinkedLiterature: 'No literature is linked to this diagnostic stage; the narrative is intentionally retained.', readingPrompt: 'Reading prompt', readingPromptLabel: (title) => `${title} reading prompt`, promptDisclaimer: 'This is a reading prompt, not a verified research gap.',
  },
};

const zh: ReadingMessages = {
  app: {
    eyebrow: '公开 · 只读', title: '阅读', description: '关于重味强子半轻子单举衰变的研究阅读索引、文献关系图与主题路径。', countSummary: (papers, relations, threads) => `${papers} 篇文献 · ${relations} 条关系 · ${threads} 条线索`, viewNavigation: '阅读视图', tabs: { library: '文献库', map: '关系图', threads: '主题线索' }, dataNoticeLabel: '阅读数据说明', dataNotice: '优先级、说明与阅读顺序均保留数据中标明的提议来源；阅读状态为“未知”不代表已读。本浏览器不会保存编辑、笔记或筛选状态。', loading: '正在读取阅读数据…', mapLoading: '正在加载关系图组件…', malformedTitle: '数据不符合 Reading v1 契约', malformedMessage: '阅读数据未能通过校验，请稍后重试。', unavailableTitle: '阅读数据暂不可用', unavailableMessage: '暂时无法连接阅读数据服务，请稍后重试。', retry: '重试',
  },
  labels: {
    roles: { foundation: '基础', method: '方法', phenomenology: '唯象', experiment: '实验', review: '综述', frontier: '前沿' },
    origins: { thesis_ch1_7: '学位论文第 1–7 章', bibliography_only: '仅见于参考文献', external_supplement: '外部补充' },
    entryTypes: { article: '期刊论文', book: '专著', proceedings: '会议论文', preprint: '预印本' },
    statuses: { unknown: '未知（未标记为已读）', to_read: '待读', skimmed: '已略读', read: '已读', deep_read: '已精读', revisit: '需重读' },
    relationTypes: { cites: '引用', uses_framework_of: '使用其框架', uses_data_from: '使用其数据', cross_checks_against: '与其交叉检验', adapts_method_of: '改编其方法', updates_software_of: '更新其软件', curated_connection: '建议阅读连接' },
    relationLayers: { citation: '引用事实', documented_semantic: '有据语义关系', curatorial: '建议阅读连接' },
    identityStatuses: { primary_record_checked: '已核对主要记录', thesis_only: '仅见于学位论文', needs_review: '需要复核' },
    verificationSourceKinds: { arxiv_record: 'arXiv 记录', bibliographic_record: '书目记录', primary_reference_list: '原始参考文献列表', publisher_record: '出版方记录', publisher_supplied_repository: '出版方提供的资料库' },
    priorityBases: { assistant_proposed_curatorial_relevance: '助手按策展相关性建议', user_confirmed: '用户已确认' },
    curationStatuses: { proposed: '建议', accepted: '已采纳', archived: '已归档' },
    annotationAuthors: { assistant: '助手建议', user: '用户' },
    proposed: '建议', confirmed: '已确认', accepted: '已采纳', notRecorded: '未记录',
  },
  library: {
    filtersRegion: '文献库搜索与筛选', searchLabel: '搜索阅读文献库', searchPlaceholder: '搜索题名、作者、标识符、主题、过程或批注', reset: '重置', filters: { topics: '主题', processes: '过程', roles: '角色', years: '年份', priorities: '优先级', origins: '来源' }, allFilters: { topics: '全部主题', processes: '全部过程', roles: '全部角色', years: '全部年份', priorities: '全部优先级', origins: '全部来源' }, priorityOption: (priority) => `优先级 ${priority}`, recordsHeading: '文献记录', showing: (shown, total) => `显示 ${shown} / ${total} 篇`, noRecords: '没有符合当前条件的文献。', clearFilters: '清除搜索与筛选', priority: (priority, state) => `优先级 ${priority} · ${state}`, partialAuthorList: '（作者列表不完整）', readingStatus: '阅读状态', topics: '主题', processes: '过程', openExternal: (service, title) => `在新标签页打开 ${title} 的 ${service} 记录`, showDetails: '查看详情', hideDetails: '收起详情', whyRetained: '收录理由', researchConnection: '研究关联', thesisProvenance: '学位论文出处', bibliographyReference: (reference) => `学位论文参考文献 [${reference}]`, chapter: (chapter, section) => `第 ${chapter} 章 · ${section}`, pageLocations: (printed, pdf) => `印刷页 ${printed} · PDF 页 ${pdf}`, noThesisLocation: '未指定范围内的学位论文位置。', metadataVerification: '元数据与核验', publicationYear: '发表年份', preprintYear: '预印本年份', journal: '期刊', identityStatus: '身份核验状态', checkedOn: '核对日期', verificationSources: '核验来源', noVerificationNotes: '没有额外的元数据或版本说明。', annotationProvenance: '批注来源', annotationAuthor: '批注作者', priorityBasis: '优先级依据', curationStatus: '策展状态', personalNotes: '个人笔记', noPersonalNotes: '没有个人笔记。', ideaHooks: '思路提示', noIdeaHooks: '没有思路提示。', relatedPapers: '相关文献', noRelations: '没有记录与本文相关的关系。', undirectedConnection: '无向建议连接', outgoingRelation: '向外关系', incomingRelation: '向内关系',
  },
  map: {
    heading: '文献关系图', candidateSummary: (priority, papers) => `优先级 ${priority}+ · ${papers} 篇候选文献`, returnToExpansion: '回到当前展开', showAllResults: '显示全部筛选结果', reset: '重置', searchLabel: '搜索并定位文献', searchPlaceholder: '搜索题名、作者或文献 ID', locate: '定位', noSearchMatch: '当前筛选范围内没有匹配文献。', located: (title) => `已定位：${title}`, filters: { topic: '主题', process: '过程', role: '角色', year: '年份', relation: '关系' }, all: '全部', evidenceLayers: '证据层', hypothesisEmpty: '假设层为空', graphRegion: '关系图谱', graphSummary: (papers, relations) => `${papers} 篇文献 · ${relations} 条当前连线`, relationLegend: '关系图例', citationLegend: '引用', semanticLegend: '有据语义', curatorialLegend: '阅读连接', fitView: '适配图谱视图', relayout: '重新计算图谱布局', canvasLabel: (limit) => `文献关系交互图，默认标注最多 ${limit} 个关键节点。图谱详情区的当前文献列表提供键盘操作方式。`, noVisiblePapers: '当前筛选没有可显示的文献。请调整筛选或重置图谱。', legendBoundary: '图例与解释边界', roleColors: '节点角色颜色', prioritySizes: '优先级 4 / 5', details: '图谱详情', selectedPaper: '选中文献', partialAuthorList: '（作者列表不完整）', year: '年份', role: '角色', suggestedPriority: '建议优先级', readingStatus: '阅读状态', expandDefault: (hops) => `按默认展开 ${hops} 跳`, expandHops: (hops) => `展开 ${hops} 跳`, libraryDetails: '文献库详情', overview: '图谱概览', currentScope: '当前范围', visiblePapers: '显示文献', currentRelations: '当前连线', enabledLayers: '启用证据层', filteredCandidates: '筛选候选', adjacentPapers: '邻接文献（键盘列表）', outgoing: '向外', incoming: '向内', undirected: '无向', viewRelation: '查看关系', viewRelationFor: (title, relation) => `查看 ${title} 的${relation}关系`, noAdjacent: '当前证据层与筛选下没有邻接项。', paperIndex: '文献索引', keyboardDescription: '图形画布用于指针探索；可用 Tab 键进入此列表并选择任一文献，再通过邻接列表检查关系。', noSelectablePapers: '当前筛选没有可选择的文献。', disclaimer: '箭头由来源指向被引用或被使用的文献。缺少连线只表示当前图谱信息不足；阅读连接仅用于导航，不构成历史影响或研究空白的证据。', selectedRelation: '选中关系', pointsTo: '指向', bidirectional: '双向连接', evidenceLayer: '证据层', direction: '方向', directed: '有向', confidence: '置信标记', confidenceHigh: '高（已核证）', confidenceCuratorial: '策展建议', status: '状态', evidenceChecked: '证据已检查', evidence: '证据', primarySource: (locator, checkedOn) => `原始来源 · ${locator} · 核对日期：${checkedOn}`, viewEvidence: '查看证据', thesisContext: (chapter, section, printed, pdf) => `学位论文语境：第 ${chapter} 章 ${section}，印刷页 ${printed} / PDF 页 ${pdf}`,
  },
  threads: {
    heading: '主题线索', description: '按既定主题整理的建议阅读顺序。线索只用于导航，不代表已经核证的引用链。', libraryNotice: '点击文献可打开对应的文献库详情；没有文献的诊断阶段会保留说明，但不添加链接。', empty: '暂无阅读线索。', threadNumber: (index) => `线索 ${index}`, thesisChapters: '学位论文章节：', chapter: (chapter) => `第 ${chapter} 章`, noneListed: '未列出', annotation: '批注：', orderedStages: '阅读阶段', orderedStagesLabel: (title) => `${title}的阅读阶段`, linkedPapersLabel: (stage) => `${stage}的相关文献`, linkedPaperUnavailable: '相关文献暂不可用', openPaper: (title, year) => `打开文献 ${title}（${year}）`, noLinkedLiterature: '此诊断阶段未关联文献；相关说明有意保留。', readingPrompt: '阅读问题', readingPromptLabel: (title) => `${title}的阅读问题`, promptDisclaimer: '这是阅读提示，并非已经核证的研究空白。',
  },
};

const zhHk: ReadingMessages = {
  app: {
    eyebrow: '公開 · 唯讀', title: '閱讀', description: '重味強子半輕子單舉衰變研究的文獻索引、關係圖與閱讀脈絡。', countSummary: (papers, relations, threads) => `${papers} 篇文獻 · ${relations} 項關係 · ${threads} 條閱讀脈絡`, viewNavigation: '閱讀檢視', tabs: { library: '文獻庫', map: '關係圖', threads: '閱讀脈絡' }, dataNoticeLabel: '閱讀數據說明', dataNotice: '優先級、說明與閱讀次序均保留數據所標示的建議來源；閱讀狀態為「未知」並不表示已讀。瀏覽器不會儲存編輯內容、筆記或篩選狀態。', loading: '正在讀取閱讀數據…', mapLoading: '正在載入關係圖元件…', malformedTitle: '數據格式不符合 Reading v1 規格', malformedMessage: '閱讀數據未能通過驗證，請稍後再試。', unavailableTitle: '閱讀數據暫時無法使用', unavailableMessage: '暫時無法連接閱讀數據服務，請稍後再試。', retry: '重試',
  },
  labels: {
    roles: { foundation: '基礎', method: '方法', phenomenology: '唯象', experiment: '實驗', review: '綜述', frontier: '前沿' },
    origins: { thesis_ch1_7: '學位論文第 1–7 章', bibliography_only: '僅見於參考文獻', external_supplement: '外部補充' },
    entryTypes: { article: '期刊論文', book: '專著', proceedings: '會議論文', preprint: '預印本' },
    statuses: { unknown: '未知（未標記為已讀）', to_read: '待閱讀', skimmed: '已略讀', read: '已閱讀', deep_read: '已精讀', revisit: '待重溫' },
    relationTypes: { cites: '引用', uses_framework_of: '使用其框架', uses_data_from: '使用其數據', cross_checks_against: '與其交叉檢驗', adapts_method_of: '改編其方法', updates_software_of: '更新其軟件', curated_connection: '建議閱讀連結' },
    relationLayers: { citation: '引用事實', documented_semantic: '有據語義關係', curatorial: '建議閱讀連結' },
    identityStatuses: { primary_record_checked: '已核對主要記錄', thesis_only: '僅見於學位論文', needs_review: '需要覆核' },
    verificationSourceKinds: { arxiv_record: 'arXiv 記錄', bibliographic_record: '書目記錄', primary_reference_list: '原始參考文獻列表', publisher_record: '出版方記錄', publisher_supplied_repository: '出版方提供的資料庫' },
    priorityBases: { assistant_proposed_curatorial_relevance: '助手按策展相關性建議', user_confirmed: '用戶已確認' },
    curationStatuses: { proposed: '建議', accepted: '已採納', archived: '已封存' },
    annotationAuthors: { assistant: '助手建議', user: '用戶' },
    proposed: '建議', confirmed: '已確認', accepted: '已採納', notRecorded: '未記錄',
  },
  library: {
    filtersRegion: '文獻庫搜尋與篩選', searchLabel: '搜尋閱讀文獻庫', searchPlaceholder: '搜尋題名、作者、識別碼、主題、過程或批註', reset: '重設', filters: { topics: '主題', processes: '過程', roles: '角色', years: '年份', priorities: '優先級', origins: '來源' }, allFilters: { topics: '全部主題', processes: '全部過程', roles: '全部角色', years: '全部年份', priorities: '全部優先級', origins: '全部來源' }, priorityOption: (priority) => `優先級 ${priority}`, recordsHeading: '文獻記錄', showing: (shown, total) => `顯示 ${shown} / ${total} 篇`, noRecords: '沒有符合目前條件的文獻。', clearFilters: '清除搜尋與篩選', priority: (priority, state) => `優先級 ${priority} · ${state}`, partialAuthorList: '（作者名單不完整）', readingStatus: '閱讀狀態', topics: '主題', processes: '過程', openExternal: (service, title) => `在新分頁開啟 ${title} 的 ${service} 記錄`, showDetails: '查看詳情', hideDetails: '收起詳情', whyRetained: '收錄理由', researchConnection: '研究關聯', thesisProvenance: '學位論文出處', bibliographyReference: (reference) => `學位論文參考文獻 [${reference}]`, chapter: (chapter, section) => `第 ${chapter} 章 · ${section}`, pageLocations: (printed, pdf) => `印刷頁 ${printed} · PDF 頁 ${pdf}`, noThesisLocation: '未指定範圍內的學位論文位置。', metadataVerification: '元數據與核驗', publicationYear: '發表年份', preprintYear: '預印本年份', journal: '期刊', identityStatus: '身份核驗狀態', checkedOn: '核對日期', verificationSources: '核驗來源', noVerificationNotes: '沒有額外的元數據或版本說明。', annotationProvenance: '批註來源', annotationAuthor: '批註作者', priorityBasis: '優先級依據', curationStatus: '策展狀態', personalNotes: '個人筆記', noPersonalNotes: '沒有個人筆記。', ideaHooks: '思路提示', noIdeaHooks: '沒有思路提示。', relatedPapers: '相關文獻', noRelations: '沒有記錄與本文相關的關係。', undirectedConnection: '無向建議連結', outgoingRelation: '向外關係', incomingRelation: '向內關係',
  },
  map: {
    heading: '文獻關係圖', candidateSummary: (priority, papers) => `優先級 ${priority}+ · ${papers} 篇候選文獻`, returnToExpansion: '返回目前展開範圍', showAllResults: '顯示全部篩選結果', reset: '重設', searchLabel: '搜尋並定位文獻', searchPlaceholder: '搜尋題名、作者或文獻 ID', locate: '定位', noSearchMatch: '目前篩選範圍內找不到相符文獻。', located: (title) => `已定位：${title}`, filters: { topic: '主題', process: '過程', role: '角色', year: '年份', relation: '關係' }, all: '全部', evidenceLayers: '證據層', hypothesisEmpty: '假設層暫無資料', graphRegion: '關係圖譜', graphSummary: (papers, relations) => `${papers} 篇文獻 · ${relations} 條目前連線`, relationLegend: '關係圖例', citationLegend: '引用', semanticLegend: '有據語義', curatorialLegend: '閱讀連結', fitView: '調整圖譜以配合視窗', relayout: '重新排列圖譜', canvasLabel: (limit) => `互動式文獻關係圖，預設最多標示 ${limit} 個關鍵節點。圖譜詳情區的目前文獻列表支援鍵盤操作。`, noVisiblePapers: '目前篩選沒有可顯示的文獻。請調整篩選或重設圖譜。', legendBoundary: '圖例及詮釋範圍', roleColors: '節點角色顏色', prioritySizes: '優先級 4 / 5', details: '圖譜詳情', selectedPaper: '已選文獻', partialAuthorList: '（作者名單不完整）', year: '年份', role: '角色', suggestedPriority: '建議優先級', readingStatus: '閱讀狀態', expandDefault: (hops) => `按預設展開 ${hops} 層`, expandHops: (hops) => `展開 ${hops} 層`, libraryDetails: '前往文獻庫詳情', overview: '圖譜概覽', currentScope: '目前範圍', visiblePapers: '顯示文獻', currentRelations: '目前連線', enabledLayers: '已啟用證據層', filteredCandidates: '篩選後候選文獻', adjacentPapers: '相鄰文獻（鍵盤列表）', outgoing: '向外', incoming: '向內', undirected: '無向', viewRelation: '查看關係', viewRelationFor: (title, relation) => `查看 ${title} 的${relation}關係`, noAdjacent: '在目前的證據層及篩選條件下，沒有相鄰文獻。', paperIndex: '文獻索引', keyboardDescription: '圖形畫布供指標裝置探索；你亦可按 Tab 鍵進入此列表，選擇任一文獻，再於相鄰文獻列表查看關係。', noSelectablePapers: '目前篩選沒有可選擇的文獻。', disclaimer: '箭嘴由來源指向被引用或使用的文獻。缺少連線只表示目前圖譜的資料不足；閱讀連結只供導覽，並不構成歷史影響或研究空白的證據。', selectedRelation: '已選關係', pointsTo: '指向', bidirectional: '雙向連結', evidenceLayer: '證據層', direction: '方向', directed: '有向', confidence: '可信度標記', confidenceHigh: '高（已核證）', confidenceCuratorial: '編選建議', status: '狀態', evidenceChecked: '證據已核對', evidence: '證據', primarySource: (locator, checkedOn) => `原始來源 · ${locator} · 核對日期：${checkedOn}`, viewEvidence: '查看證據', thesisContext: (chapter, section, printed, pdf) => `學位論文語境：第 ${chapter} 章 ${section}，印刷頁 ${printed} / PDF 頁 ${pdf}`,
  },
  threads: {
    heading: '閱讀脈絡', description: '為既定路徑編排的閱讀次序。每條脈絡只供導覽，並非經核證的引用鏈。', libraryNotice: '文獻連結會開啟文獻庫內相應的詳情。沒有文獻的診斷階段會按原意保留，不設連結。', empty: '暫無閱讀脈絡。', threadNumber: (index) => `閱讀脈絡 ${index}`, thesisChapters: '學位論文章節：', chapter: (chapter) => `第 ${chapter} 章`, noneListed: '未列出', annotation: '註釋者：', orderedStages: '閱讀階段', orderedStagesLabel: (title) => `${title} 的閱讀階段（按次序排列）`, linkedPapersLabel: (stage) => `${stage} 的相關文獻`, linkedPaperUnavailable: '連結的文獻暫時無法使用', openPaper: (title, year) => `開啟文獻 ${title}（${year}）`, noLinkedLiterature: '此診斷階段沒有連結文獻；其說明按原意保留。', readingPrompt: '閱讀思考題', readingPromptLabel: (title) => `${title} 的閱讀思考題`, promptDisclaimer: '這是閱讀提示，並非經核證的研究空白。',
  },
};

const READING_MESSAGES: Record<SupportedReadingLocale, ReadingMessages> = { en, zh, 'zh-hk': zhHk };

export function getReadingMessages(locale: string): ReadingMessages {
  if (locale === 'zh-hk') return READING_MESSAGES['zh-hk'];
  if (locale === 'zh') return READING_MESSAGES.zh;
  return READING_MESSAGES.en;
}
