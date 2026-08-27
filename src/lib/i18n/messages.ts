export interface LocaleMessages {
  common: {
    all: string;
    copyToClipboard: string;
    media: string;
    closeMediaPreview: string;
    scrollArea: string;
  };
  navigation: {
    openMainMenu: string;
  };
  theme: {
    system: string;
    light: string;
    dark: string;
    currentTheme: string;
    cycleTheme: string;
  };
  profile: {
    email: string;
    location: string;
    workAddress: string;
    advisors: string;
    click: string;
    googleMap: string;
    send: string;
    sendEmail: string;
    researchInterests: string;
    like: string;
    liked: string;
    thanks: string;
  };
  home: {
    about: string;
    news: string;
    openQuestions: string;
    selectedPublications: string;
    viewAll: string;
  };
  publications: {
    searchPlaceholder: string;
    filters: string;
    year: string;
    type: string;
    noResults: string;
    abstract: string;
    bibtex: string;
    code: string;
    project: string;
    pdf: string;
    slides: string;
    video: string;
  };
  questions: {
    answer: string;
    filterByTag: string;
    noResults: string;
  };
  photography: {
    previous: string;
    next: string;
    noItems: string;
    camera: string;
    lens: string;
  };
  footer: {
    lastUpdated: string;
    builtWithPrism: string;
  };
}

const en: LocaleMessages = {
  common: {
    all: 'All',
    copyToClipboard: 'Copy to clipboard',
    media: 'Media',
    closeMediaPreview: 'Close media preview',
    scrollArea: 'scroll area',
  },
  navigation: {
    openMainMenu: 'Open main menu',
  },
  theme: {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    currentTheme: 'Current theme',
    cycleTheme: 'Click to cycle theme',
  },
  profile: {
    email: 'Email',
    location: 'Location',
    workAddress: 'Work Address',
    advisors: 'Advisors',
    click: 'Click',
    googleMap: 'Google Map',
    send: 'Send',
    sendEmail: 'Send Email',
    researchInterests: 'Research Interests',
    like: 'Like',
    liked: 'Liked',
    thanks: 'Thanks!',
  },
  home: {
    about: 'About',
    news: 'News',
    openQuestions: 'Open Questions',
    selectedPublications: 'Selected Publications',
    viewAll: 'View All',
  },
  publications: {
    searchPlaceholder: 'Search publications...',
    filters: 'Filters',
    year: 'Year',
    type: 'Type',
    noResults: 'No publications found matching your criteria.',
    abstract: 'Abstract',
    bibtex: 'BibTeX',
    code: 'Code',
    project: 'Project',
    pdf: 'PDF',
    slides: 'Slides',
    video: 'Video',
  },
  questions: {
    answer: 'Answer',
    filterByTag: 'Filter by tag',
    noResults: 'No questions found for this tag.',
  },
  photography: {
    previous: 'Previous photo',
    next: 'Next photo',
    noItems: 'No photographs added yet.',
    camera: 'Camera',
    lens: 'Lens',
  },
  footer: {
    lastUpdated: 'Last updated',
    builtWithPrism: 'Built with PRISM',
  },
};

const zh: LocaleMessages = {
  common: {
    all: '全部',
    copyToClipboard: '复制到剪贴板',
    media: '媒体',
    closeMediaPreview: '关闭媒体预览',
    scrollArea: '滚动区域',
  },
  navigation: {
    openMainMenu: '打开主菜单',
  },
  theme: {
    system: '跟随系统',
    light: '浅色',
    dark: '深色',
    currentTheme: '当前主题',
    cycleTheme: '点击切换主题',
  },
  profile: {
    email: '邮箱',
    location: '地址',
    workAddress: '办公地址',
    advisors: '导师',
    click: '点击',
    googleMap: '谷歌地图',
    send: '发送',
    sendEmail: '发送邮件',
    researchInterests: '研究兴趣',
    like: '点赞',
    liked: '已点赞',
    thanks: '感谢支持！',
  },
  home: {
    about: '关于我',
    news: '动态',
    openQuestions: '问题集',
    selectedPublications: '精选论文',
    viewAll: '查看全部',
  },
  publications: {
    searchPlaceholder: '搜索论文...',
    filters: '筛选',
    year: '年份',
    type: '类型',
    noResults: '没有找到符合条件的论文。',
    abstract: '摘要',
    bibtex: 'BibTeX',
    code: '代码',
    project: '项目',
    pdf: 'PDF',
    slides: '讲稿',
    video: '视频',
  },
  questions: {
    answer: '答案',
    filterByTag: '按标签筛选',
    noResults: '当前标签下没有问题。',
  },
  photography: {
    previous: '上一张',
    next: '下一张',
    noItems: '还没有添加摄影作品。',
    camera: '机身',
    lens: '镜头',
  },
  footer: {
    lastUpdated: '最近更新',
    builtWithPrism: '由 PRISM 构建',
  },
};

const zhHk: LocaleMessages = {
  common: {
    all: '全部',
    copyToClipboard: '複製到剪貼簿',
    media: '媒體',
    closeMediaPreview: '關閉媒體預覽',
    scrollArea: '捲動區域',
  },
  navigation: {
    openMainMenu: '開啟主選單',
  },
  theme: {
    system: '跟隨系統',
    light: '淺色',
    dark: '深色',
    currentTheme: '目前主題',
    cycleTheme: '按一下切換主題',
  },
  profile: {
    email: '電郵',
    location: '地址',
    workAddress: '辦公地址',
    advisors: '導師',
    click: '按一下',
    googleMap: 'Google 地圖',
    send: '傳送',
    sendEmail: '傳送電郵',
    researchInterests: '研究興趣',
    like: '讚好',
    liked: '已讚好',
    thanks: '多謝支持！',
  },
  home: {
    about: '關於我',
    news: '最新動態',
    openQuestions: '問題集',
    selectedPublications: '精選論文',
    viewAll: '查看全部',
  },
  publications: {
    searchPlaceholder: '搜尋論文...',
    filters: '篩選',
    year: '年份',
    type: '類型',
    noResults: '找不到符合條件的論文。',
    abstract: '摘要',
    bibtex: 'BibTeX',
    code: '程式碼',
    project: '項目',
    pdf: 'PDF',
    slides: '講稿',
    video: '影片',
  },
  questions: {
    answer: '答案',
    filterByTag: '按標籤篩選',
    noResults: '目前標籤下沒有問題。',
  },
  photography: {
    previous: '上一張相片',
    next: '下一張相片',
    noItems: '尚未加入攝影作品。',
    camera: '相機',
    lens: '鏡頭',
  },
  footer: {
    lastUpdated: '最近更新',
    builtWithPrism: '由 PRISM 建構',
  },
};

export const messages: Record<string, LocaleMessages> = {
  en,
  zh,
  'zh-hk': zhHk,
};

export function getMessages(locale: string): LocaleMessages {
  return messages[locale] || en;
}
