'use client';

import { motion } from 'framer-motion';
import { useMessages } from '@/lib/i18n/useMessages';

export interface NewsItem {
    date: string;
    content: string;
}

interface NewsProps {
    items: NewsItem[];
    title?: string;
}

export default function News({ items, title }: NewsProps) {
    const messages = useMessages();
    const resolvedTitle = title || messages.home.news;
    const shouldScroll = items.length > 5;

    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
        >
            <h2 className="text-2xl font-serif font-bold text-primary mb-4">{resolvedTitle}</h2>
            <div
                className={`space-y-3 ${
                    shouldScroll
                        ? 'max-h-[18.5rem] overflow-y-auto overscroll-contain pr-3 [scrollbar-gutter:stable]'
                        : ''
                }`}
                tabIndex={shouldScroll ? 0 : undefined}
                aria-label={shouldScroll ? `${resolvedTitle} scroll area` : undefined}
            >
                {items.map((item, index) => (
                    <div key={index} className="flex items-start space-x-3">
                        <span className="text-xs text-neutral-500 mt-1 w-24 flex-shrink-0">{item.date}</span>
                        <p className="text-sm text-neutral-700">{item.content}</p>
                    </div>
                ))}
            </div>
        </motion.section>
    );
}
