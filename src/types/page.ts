export interface BasePageConfig {
    type: 'about' | 'publication' | 'card' | 'text' | 'questions' | 'gallery' | 'learning';
    title: string;
    description?: string;
}

export interface PublicationPageConfig extends BasePageConfig {
    type: 'publication';
    source: string;
}

export interface TextPageConfig extends BasePageConfig {
    type: 'text';
    source: string;
}

export interface CardItem {
    id?: string;
    title: string;
    subtitle?: string;
    date?: string;
    content?: string;
    tags?: string[];
    link?: string;
    image?: string;
}

export interface CardPageConfig extends BasePageConfig {
    type: 'card';
    items: CardItem[];
}

export interface QuestionItem {
    id: string;
    date: string;
    question: string;
    context?: string;
    answer?: string;
    answerDate?: string;
    tags: string[];
}

export interface QuestionsQuote {
    text: string;
    german?: string;
    source?: string;
}

export interface QuestionsPageConfig extends BasePageConfig {
    type: 'questions';
    quote?: QuestionsQuote;
    items: QuestionItem[];
}

export interface GalleryItem {
    id: string;
    thumb: string;
    image: string;
    title: string;
    date?: string;
    location?: string;
    camera?: string;
    lens?: string;
    alt: string;
    description?: string;
    details?: string;
}

export interface GalleryPageConfig extends BasePageConfig {
    type: 'gallery';
    items: GalleryItem[];
}

export interface LearningUpdate {
    id?: string;
    date: string;
    content: string;
}

export interface LearningCourse {
    id: string;
    title: string;
    version?: string;
    pdf?: string;
    updates?: LearningUpdate[];
}

export interface LearningPageConfig extends BasePageConfig {
    type: 'learning';
    pdf_label: string;
    pdf_pending: string;
    updates_title: string;
    empty_updates: string;
    version_pending: string;
    courses: LearningCourse[];
}
