export interface BasePageConfig {
    type: 'about' | 'publication' | 'card' | 'text' | 'questions' | 'gallery';
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
    context: string;
    tags: string[];
}

export interface QuestionsPageConfig extends BasePageConfig {
    type: 'questions';
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
}

export interface GalleryPageConfig extends BasePageConfig {
    type: 'gallery';
    items: GalleryItem[];
}
